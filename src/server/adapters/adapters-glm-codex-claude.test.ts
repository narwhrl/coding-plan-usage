import { describe, it, expect, vi } from "vitest";
import { glmAdapter } from "./glm";
import { codexAdapter } from "./codex";
import { claudeAdapter } from "./claude";

/** stub fetch：按 URL 首段路由到 handler。 */
function routeFetch(routes: Record<string, (init?: RequestInit, url?: string) => Response>): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(init, url);
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
  it("normalizes quota/limit into 5h + weekly + mcp windows and queries a 7-day model-usage window", async () => {
    let modelUsageUrl = "";
    const fetchFn = routeFetch({
      "https://api.z.ai/api/monitor/usage/quota/limit": () =>
        new Response(
          JSON.stringify({
            data: {
              limits: [
                { type: "TOKENS_LIMIT", percentage: 40, nextResetTime: 1776336869810 },
                { type: "TOKENS_LIMIT", percentage: 29, nextResetTime: 1776934952998 },
                {
                  type: "TIME_LIMIT",
                  percentage: 25,
                  currentValue: 250,
                  usage: 1000,
                  nextResetTime: 1777712552994,
                },
              ],
            },
          }),
          { status: 200 },
        ),
      "https://api.z.ai/api/monitor/usage/model-usage": (_init, url) => {
        modelUsageUrl = String(url);
        return new Response(JSON.stringify({ data: [{ model: "glm-4.6", tokens: 12345 }] }), { status: 200 });
      },
    });
    const result = await glmAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "Bearer my-key" },
      config: { baseUrl: "https://api.z.ai" },
      fetchFn,
    });
    expect(result.windows).toHaveLength(3);
    const [w5h, weekly, monthly] = result.windows;
    expect(w5h.kind).toBe("5h");
    expect(w5h.label).toBeUndefined();
    expect(w5h.remainingPct).toBe(60);
    expect(w5h.resetAt).toBe(new Date(1776336869810).toISOString());
    expect(weekly.kind).toBe("weekly");
    expect(weekly.label).toBeUndefined();
    expect(weekly.remainingPct).toBe(71);
    expect(weekly.resetAt).toBe(new Date(1776934952998).toISOString());
    expect(monthly.kind).toBe("mcp");
    expect(monthly.used).toBe(250);
    expect(monthly.total).toBe(1000);
    expect(monthly.remainingPct).toBe(75);
    expect(monthly.resetAt).toBe(new Date(1777712552994).toISOString());
    expect((result.meta?.modelUsage as unknown[]).length).toBe(1);

    const now = ctxBase.now();
    const p = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    expect(modelUsageUrl).toBe(
      `https://api.z.ai/api/monitor/usage/model-usage` +
        `?startTime=${encodeURIComponent(fmt(start))}&endTime=${encodeURIComponent(fmt(end))}`,
    );
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

  it("maps next_reset_time and leaves resetAt null when the field is missing", async () => {
    const fetchFn = routeFetch({
      "https://api.z.ai/api/monitor/usage/quota/limit": () =>
        new Response(
          JSON.stringify({
            data: {
              limits: [
                { type: "TOKENS_LIMIT", percentage: 10, next_reset_time: 1776336869810 },
                { type: "TOKENS_LIMIT", percentage: 20 },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    const result = await glmAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "tok-123" },
      config: { baseUrl: "https://api.z.ai" },
      fetchFn,
    });
    expect(result.windows[0].resetAt).toBe(new Date(1776336869810).toISOString());
    expect(result.windows[1].resetAt).toBeNull();
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

  it("parses the live snake_case wham/usage payload (rate_limit.primary_window + reset_at)", async () => {
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": () =>
        new Response(
          JSON.stringify({
            plan_type: "plus",
            rate_limit: {
              allowed: true,
              limit_reached: false,
              primary_window: {
                used_percent: 34,
                limit_window_seconds: 18000,
                reset_after_seconds: 5865,
                reset_at: 1778091218,
              },
              secondary_window: {
                used_percent: 37,
                limit_window_seconds: 604800,
                reset_after_seconds: 520217,
                reset_at: 1778605571,
              },
            },
            additional_rate_limits: [
              {
                limit_name: "GPT-5.3-Codex-Spark",
                metered_feature: "codex_bengalfox",
                rate_limit: {
                  primary_window: {
                    used_percent: 10,
                    limit_window_seconds: 18000,
                    reset_at: 1778103354,
                  },
                  secondary_window: {
                    used_percent: 20,
                    limit_window_seconds: 604800,
                    reset_at: 1778605191,
                  },
                },
              },
            ],
          }),
          { status: 200 },
        ),
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(result.windows).toHaveLength(4);
    expect(result.windows[0]).toMatchObject({
      kind: "5h",
      remainingPct: 66,
      resetAt: new Date(1778091218 * 1000).toISOString(),
    });
    expect(result.windows[1]).toMatchObject({
      kind: "weekly",
      remainingPct: 63,
      resetAt: new Date(1778605571 * 1000).toISOString(),
    });
    expect(result.windows[2]).toMatchObject({
      kind: "5h",
      label: "GPT-5.3-Codex-Spark",
      remainingPct: 90,
      minor: true,
    });
    expect(result.windows[3]).toMatchObject({
      kind: "weekly",
      label: "GPT-5.3-Codex-Spark",
      remainingPct: 80,
      minor: true,
    });
    expect(result.meta?.planType).toBe("plus");
  });

  it("labels a weekly-only primary_window as weekly, not 5h", async () => {
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": () =>
        new Response(
          JSON.stringify({
            rate_limit: {
              primary_window: { used_percent: 35, reset_at: 1770500000, limit_window_seconds: 604800 },
            },
          }),
          { status: 200 },
        ),
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].kind).toBe("weekly");
    expect(result.windows[0].remainingPct).toBe(65);
    expect(result.windows[0].minor).toBeUndefined();
  });

  it("uses additional_rate_limits when rate_limit is empty so collection still succeeds", async () => {
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": () =>
        new Response(
          JSON.stringify({
            plan_type: "pro",
            rate_limit: null,
            additional_rate_limits: [
              {
                limit_name: "Codex Other",
                metered_feature: "codex_other",
                rate_limit: {
                  primary_window: { used_percent: 70, reset_at: 1770500000, limit_window_seconds: 604800 },
                },
              },
            ],
          }),
          { status: 200 },
        ),
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({
      kind: "weekly",
      label: "Codex Other",
      remainingPct: 30,
    });
    expect(result.windows[0].minor).toBeUndefined();
  });

  it("derives resetAt from reset_after_seconds when reset_at is missing", async () => {
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": () =>
        new Response(
          JSON.stringify({
            rate_limit: {
              primary_window: { used_percent: 0, limit_window_seconds: 18000, reset_after_seconds: 3600 },
            },
          }),
          { status: 200 },
        ),
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(result.windows[0].remainingPct).toBe(100);
    expect(result.windows[0].resetAt).toBe(new Date(Date.parse("2026-08-31T10:00:00Z")).toISOString());
  });

  it("treats a window with reset but no used_percent as 0% used", async () => {
    const fetchFn = routeFetch({
      "https://chatgpt.com/backend-api/wham/usage": () =>
        new Response(
          JSON.stringify({
            rate_limit: {
              primary_window: { limit_window_seconds: 18000, reset_at: 1778091218 },
              secondary_window: { limit_window_seconds: 604800, reset_at: 1778605571 },
            },
          }),
          { status: 200 },
        ),
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
    });
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({ kind: "5h", remainingPct: 100 });
    expect(result.windows[1]).toMatchObject({ kind: "weekly", remainingPct: 100 });
  });

  it("refreshes and retries when wham/usage returns 200 with no windows", async () => {
    let usageCalls = 0;
    const fetchFn = routeFetch({
      "https://auth.openai.com/oauth/token": () =>
        new Response(JSON.stringify({ access_token: "new-at", refresh_token: "rt-2" }), { status: 200 }),
      "https://chatgpt.com/backend-api/wham/usage": () => {
        usageCalls += 1;
        if (usageCalls === 1) return new Response(JSON.stringify({ detail: "token expired" }), { status: 200 });
        return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 15 } } }), { status: 200 });
      },
    });
    const onRefreshed = vi.fn();
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson },
      config: {},
      fetchFn,
      onCredentialsRefreshed: onRefreshed,
    });
    expect(usageCalls).toBe(2);
    expect(result.windows[0].remainingPct).toBe(85);
    const written = JSON.parse(onRefreshed.mock.calls[0][0].authJson);
    expect(written.tokens.access_token).toBe("new-at");
    expect(written.tokens.account_id).toBe("acct-42");
  });

  it("refreshes a JWT that is already expired before the first usage call", async () => {
    const expiredJwt = `h.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.s`;
    let usageAuth: string | undefined;
    const fetchFn = routeFetch({
      "https://auth.openai.com/oauth/token": () =>
        new Response(JSON.stringify({ access_token: "fresh-at" }), { status: 200 }),
      "https://chatgpt.com/backend-api/wham/usage": (init) => {
        usageAuth = (init?.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 4 } } }), { status: 200 });
      },
    });
    const result = await codexAdapter.fetchUsage({
      ...ctxBase,
      credentials: { authJson: JSON.stringify({ tokens: { access_token: expiredJwt, refresh_token: "rt-1", id_token: makeIdToken("acct-42") } }) },
      config: {},
      fetchFn,
    });
    expect(usageAuth).toBe("Bearer fresh-at");
    expect(result.windows[0].remainingPct).toBe(96);
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
