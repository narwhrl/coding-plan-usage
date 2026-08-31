import { describe, it, expect, vi } from "vitest";
import { glmAdapter } from "./glm";
import { codexAdapter } from "./codex";
import { claudeAdapter } from "./claude";

/** stub fetch：按 URL 首段路由到 handler。 */
function routeFetch(routes: Record<string, (init?: RequestInit) => Response>): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(init);
    }
    return new Response("no route for " + url, { status: 404 });
  }) as typeof fetch;
}

const ctxBase = {
  credentials: {} as Record<string, string>,
  config: {} as { baseUrl?: string },
  now: () => new Date("2026-08-31T09:00:00Z"),
};

describe("glm adapter", () => {
  it("normalizes quota/limit into 5h + monthly windows", async () => {
    const fetchFn = routeFetch({
      "https://api.z.ai/api/monitor/usage/quota/limit": () =>
        new Response(
          JSON.stringify({
            data: {
              limits: [
                { type: "TOKENS_LIMIT", percentage: 40 },
                { type: "TIME_LIMIT", percentage: 25, currentValue: 250, usage: 1000 },
              ],
            },
          }),
          { status: 200 },
        ),
      "https://api.z.ai/api/monitor/usage/model-usage": () =>
        new Response(JSON.stringify({ data: [{ model: "glm-4.6", tokens: 12345 }] }), { status: 200 }),
    });
    const result = await glmAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "Bearer my-key" },
      config: { baseUrl: "https://api.z.ai" },
      fetchFn,
    });
    expect(result.windows).toHaveLength(2);
    const [w5h, monthly] = result.windows;
    expect(w5h.kind).toBe("5h");
    expect(w5h.remainingPct).toBe(60);
    expect(monthly.kind).toBe("monthly");
    expect(monthly.used).toBe(250);
    expect(monthly.total).toBe(1000);
    expect(monthly.remainingPct).toBe(75);
    expect((result.meta?.modelUsage as unknown[]).length).toBe(1);
  });

  it("sends raw token without Bearer prefix", async () => {
    const seen: string[] = [];
    const fetchFn = (async (_input: unknown, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ data: { limits: [{ type: "TOKENS_LIMIT", percentage: 1 }] } }), {
        status: 200,
      });
    }) as typeof fetch;
    await glmAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "tok-123" },
      config: { baseUrl: "https://api.z.ai" },
      fetchFn,
    });
    expect(seen[0]).toBe("tok-123");
  });
});

describe("codex adapter", () => {
  const authJson = JSON.stringify({
    tokens: { access_token: "expired-at", refresh_token: "rt-1", id_token: makeIdToken("acct-42") },
  });

  function makeIdToken(accountId: string): string {
    const payload = Buffer.from(JSON.stringify({ chatgpt_account_id: accountId })).toString("base64url");
    return `header.${payload}.sig`;
  }

  it("derives account_id from id_token claim", async () => {
    let usageHeaders: Record<string, string> | undefined;
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": (init) => {
        usageHeaders = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            rateLimit: {
              primaryWindow: { used_percent: 30, resets_at: 1770000000 },
              secondaryWindow: { used_percent: 80 },
            },
            planType: "plus",
          }),
          { status: 200 },
        );
      },
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(usageHeaders?.["chatgpt-account-id"]).toBe("acct-42");
    expect(usageHeaders?.Authorization).toBe("Bearer expired-at");
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].remainingPct).toBe(70);
    expect(result.windows[1].remainingPct).toBe(20);
    expect(result.meta?.planType).toBe("plus");
  });

  it("refreshes on 401 with exact request body constants, then retries", async () => {
    const refreshBodies: unknown[] = [];
    const refresh = vi.fn(() => {
      refreshBodies.push(undefined);
      return new Response(JSON.stringify({ access_token: "new-at", refresh_token: "rt-2", id_token: makeIdToken("acct-42") }), {
        status: 200,
      });
    });
    let usageCalls = 0;
    const usage = vi.fn(() => {
      usageCalls += 1;
      if (usageCalls === 1) return new Response("unauthorized", { status: 401 });
      return new Response(
        JSON.stringify({ rateLimit: { primaryWindow: { used_percent: 10 } } }),
        { status: 200 },
      );
    });
    const fetchFn = routeFetch({
      "https://auth.openai.com/oauth/token": (_init) => {
        // body 校验在 wrapper 里做（需读取 stream）
        return refresh();
      },
      "https://chatgpt.com": (_init) => usage(),
    });
    // 包装以捕获 refresh body
    const wrappedFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).startsWith("https://auth.openai.com")) {
        refreshBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
      }
      return (fetchFn as typeof fetch)(input, init);
    }) as typeof fetch;

    const onRefreshed = vi.fn();
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn: wrappedFetch,
      onCredentialsRefreshed: onRefreshed,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refreshBodies.find(Boolean)).toEqual({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: "rt-1",
    });
    expect(usageCalls).toBe(2);
    expect(result.windows[0].remainingPct).toBe(90);
    // 新 tokens 已回写
    const written = JSON.parse(onRefreshed.mock.calls[0][0].authJson);
    expect(written.tokens.access_token).toBe("new-at");
    expect(written.tokens.refresh_token).toBe("rt-2");
  });
});

describe("claude adapter", () => {
  const usagePayload = {
    five_hour: { used_percent: 55, resets_at: "2026-08-31T12:00:00Z" },
    seven_day: { utilization: 30 },
  };

  function claudeFetch(usageStatus = 200): typeof fetch {
    return routeFetch({
      "https://api.anthropic.com/api/oauth/usage": () =>
        usageStatus === 200
          ? new Response(JSON.stringify(usagePayload), { status: 200 })
          : new Response("denied", { status: 401 }),
      "https://api.anthropic.com/api/oauth/profile": () => new Response(JSON.stringify({ email: "a@b.c" }), { status: 200 }),
    });
  }

  it("parses claudeAiOauth shape without refresh", async () => {
    const result = await claudeAdapter.fetchUsage({
      ...ctxBase,
      credentials: {
        credentialsJson: JSON.stringify({
          claudeAiOauth: { accessToken: "at-1", refreshToken: "rt-1", expiresAt: String(Date.now() + 3600_000) },
        }),
      },
      config: {},
      fetchFn: claudeFetch(),
    });
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].kind).toBe("5h");
    expect(result.windows[0].remainingPct).toBe(45);
    expect(result.windows[0].resetAt).toBe("2026-08-31T12:00:00.000Z");
    expect(result.windows[1].kind).toBe("weekly");
    expect(result.windows[1].remainingPct).toBe(70);
    expect(result.meta?.email).toBe("a@b.c");
  });

  it("parses root-level shape and refreshes with URLSearchParams body", async () => {
    const refreshBodies: string[] = [];
    const onRefreshed = vi.fn();
    const fetchFn = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://console.anthropic.com")) {
        refreshBodies.push(String(init?.body));
        return new Response(
          JSON.stringify({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }),
          { status: 200 },
        );
      }
      if (url.includes("/api/oauth/usage")) {
        return new Response(JSON.stringify(usagePayload), { status: 200 });
      }
      if (url.includes("/api/oauth/profile")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("nf", { status: 404 });
    }) as typeof fetch;

    // 根级结构 + 已过期 accessToken → 触发刷新
    const result = await claudeAdapter.fetchUsage({
      ...ctxBase,
      credentials: {
        credentialsJson: JSON.stringify({
          accessToken: "stale",
          refreshToken: "rt-1",
          expiresAt: String(Date.parse("2026-08-31T08:59:00Z")),
        }),
      },
      config: {},
      fetchFn,
      onCredentialsRefreshed: onRefreshed,
    });
    expect(refreshBodies).toHaveLength(1);
    const params = new URLSearchParams(refreshBodies[0]);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt-1");
    expect(params.get("client_id")).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e");
    expect(result.windows[0].remainingPct).toBe(45);
    const written = JSON.parse(onRefreshed.mock.calls[0][0].credentialsJson);
    expect(written.accessToken).toBe("at-2");
    expect(written.claudeAiOauth).toBeUndefined(); // 根级形态保持根级
  });

  it("refreshes then retries on 401 usage", async () => {
    const refreshBodies: string[] = [];
    let usageCalls = 0;
    const fetchFn = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://console.anthropic.com")) {
        refreshBodies.push(String(init?.body));
        return new Response(JSON.stringify({ access_token: "at-3", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/api/oauth/usage")) {
        usageCalls += 1;
        return usageCalls === 1
          ? new Response("denied", { status: 401 })
          : new Response(JSON.stringify(usagePayload), { status: 200 });
      }
      if (url.includes("/api/oauth/profile")) return new Response(JSON.stringify({}), { status: 200 });
      return new Response("nf", { status: 404 });
    }) as typeof fetch;

    const result = await claudeAdapter.fetchUsage({
      ...ctxBase,
      credentials: {
        credentialsJson: JSON.stringify({
          claudeAiOauth: { accessToken: "at-1", refreshToken: "rt-1", expiresAt: String(Date.now() + 3600_000) },
        }),
      },
      config: {},
      fetchFn,
    });
    expect(refreshBodies).toHaveLength(1);
    expect(usageCalls).toBe(2);
    expect(result.windows).toHaveLength(2);
  });
});
