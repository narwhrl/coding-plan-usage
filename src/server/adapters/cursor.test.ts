import { describe, it, expect } from "vitest";
import { cursorAdapter } from "./cursor";

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
  credentials: { sessionToken: "sess-1" },
  config: {} as { baseUrl?: string },
  now: () => new Date("2026-08-31T09:00:00Z"),
};

function usageSummary(body: unknown, grok?: unknown): typeof fetch {
  return routeFetch({
    "https://cursor.com/api/usage-summary": () => new Response(JSON.stringify(body), { status: 200 }),
    "https://cursor.com/api/auth/me": () => new Response(JSON.stringify({ email: "a@b.c", name: "Ada" }), { status: 200 }),
    "https://cursor.com/api/dashboard/get-sand-usage-status": () =>
      grok === undefined
        ? new Response("no grok", { status: 404 })
        : new Response(JSON.stringify(grok), { status: 200 }),
  });
}

describe("cursor adapter", () => {
  it("reads Cursor Models / Other Models / Grok Bot and ignores an exhausted used/limit pair", async () => {
    const seen: { url: string; method?: string; body?: string }[] = [];
    const fetchFn = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
      return usageSummary(
        {
          billingCycleEnd: "2026-09-30T00:00:00.000Z",
          membershipType: "pro",
          individualUsage: {
            plan: {
              used: 2000,
              limit: 2000,
              remaining: 0,
              autoPercentUsed: 20,
              apiPercentUsed: 40,
              totalPercentUsed: 100,
            },
          },
        },
        { usagePercent: 15, hasNonZeroIncludedLimit: true, nextResetTimestampUtc: "2026-09-07T00:00:00.000Z" },
      )(input, init);
    }) as typeof fetch;

    const result = await cursorAdapter.fetchUsage({ ...ctxBase, fetchFn });
    expect(result.windows).toEqual([
      {
        kind: "cursor_models",
        unit: "percent",
        remainingPct: 80,
        resetAt: "2026-09-30T00:00:00.000Z",
      },
      {
        kind: "other_models",
        unit: "percent",
        remainingPct: 60,
        resetAt: "2026-09-30T00:00:00.000Z",
      },
      {
        kind: "grok_bot",
        unit: "percent",
        remainingPct: 85,
        resetAt: "2026-09-07T00:00:00.000Z",
      },
    ]);
    expect(result.meta?.email).toBe("a@b.c");
    expect(result.meta?.membershipType).toBe("pro");
    expect(seen.some((c) => c.url.includes("get-sand-usage-status") && c.method === "POST" && c.body === "{}")).toBe(true);
  });

  it("does not treat a 0/0 dollar plan as a usable window", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: usageSummary({
        billingCycleEnd: "2026-09-30T00:00:00.000Z",
        individualUsage: {
          plan: { used: 0, limit: 0, remaining: 0, totalPercentUsed: 12 },
        },
      }),
    });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ kind: "monthly", remainingPct: 88, unit: "percent" });
  });

  it("parses team display-message percents when plan pools are missing", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: usageSummary({
        autoModelSelectedDisplayMessage: "You've used 25% of your included total usage",
        namedModelSelectedDisplayMessage: "You've used 10% of your included API usage",
        individualUsage: {},
      }),
    });
    expect(result.windows.map((w) => [w.kind, w.remainingPct])).toEqual([
      ["cursor_models", 75],
      ["other_models", 90],
    ]);
  });

  it("falls back to a monthly dollar window when the account has no percent pools", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: usageSummary({
        billingCycleEnd: "2026-09-01T00:00:00.000Z",
        individualUsage: { plan: { used: 2500, limit: 10000, remaining: 7500 } },
      }),
    });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({
      kind: "monthly",
      unit: "usd",
      used: 25,
      total: 100,
      remaining: 75,
      remainingPct: 75,
    });
  });

  it("keeps usage-summary data when Grok Bot request fails", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: usageSummary({
        individualUsage: { plan: { autoPercentUsed: 5, apiPercentUsed: 8 } },
      }),
    });
    expect(result.windows).toHaveLength(2);
    expect(result.windows.some((w) => w.kind === "grok_bot")).toBe(false);
  });

  it("throws when no quota numbers are present", async () => {
    await expect(
      cursorAdapter.fetchUsage({
        ...ctxBase,
        fetchFn: usageSummary({ individualUsage: { plan: { used: 0, limit: 0 } } }),
      }),
    ).rejects.toThrow("no usable quota numbers");
  });
});
