import { describe, it, expect } from "vitest";
import { dailySeries, latestDaySeries, parseModelUsage } from "../../lib/model-usage";
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
    const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
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

  it("folds filtered events into a GLM-shaped 7-day modelUsage card", async () => {
    const now = ctxBase.now();
    const hours = glmWindowHours(now);
    const morning = localMillis(now, 0, 10, 15);
    const afternoon = localMillis(now, 0, 16, 40);
    const yesterday = localMillis(now, -1, 9, 5);
    const seen: { url: string; headers?: HeadersInit; body?: string }[] = [];

    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: withModelUsage(seen, {
        me: { email: "a@b.c", name: "Ada", id: "152683922" },
        events: {
          totalUsageEventsCount: 3,
          usageEventsDisplay: [
            {
              timestamp: String(morning),
              model: "composer-2",
              tokenUsage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: "5", cacheReadTokens: 5 },
            },
            {
              timestamp: String(afternoon),
              model: "claude-4.5-sonnet",
              tokenUsage: { inputTokens: 50, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0 },
            },
            {
              timestamp: String(yesterday),
              model: "composer-2",
              tokenUsage: { inputTokens: 30, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
            },
          ],
        },
        aggregated: {
          aggregations: [
            {
              modelIntent: "composer-2",
              inputTokens: "1000",
              outputTokens: "200",
              cacheWriteTokens: "10",
              cacheReadTokens: "5",
            },
            { model: "claude-4.5-sonnet", inputTokens: 50, outputTokens: 10 },
          ],
        },
      }),
    });

    const usage = parseModelUsage(result.meta?.modelUsage);
    expect(usage).not.toBeNull();
    expect(usage!.xTime).toEqual(hours);
    expect(dailySeries(usage!)).toHaveLength(7);
    expect(latestDaySeries(usage!)).toHaveLength(24);

    const morningIdx = hours.indexOf(localHourLabel(new Date(morning)));
    const afternoonIdx = hours.indexOf(localHourLabel(new Date(afternoon)));
    const yesterdayIdx = hours.indexOf(localHourLabel(new Date(yesterday)));
    expect(usage!.tokens[morningIdx]).toBe(130);
    expect(usage!.tokens[afternoonIdx]).toBe(60);
    expect(usage!.tokens[yesterdayIdx]).toBe(30);
    expect(usage!.calls[morningIdx]).toBe(1);
    expect(usage!.totalTokens).toBe(220);
    expect(usage!.totalCalls).toBe(3);
    expect(usage!.models).toEqual([
      { name: "composer-2", totalTokens: 1215 },
      { name: "claude-4.5-sonnet", totalTokens: 60 },
    ]);

    const eventReq = seen.find((c) => c.url.includes("get-filtered-usage-events"));
    const headers = headerMap(eventReq?.headers);
    expect(headers.origin).toBe("https://cursor.com");
    expect(headers.cookie).toContain("WorkosCursorSessionToken=sess-1");
    const payload = JSON.parse(eventReq?.body ?? "{}") as {
      teamId: number;
      userId: number;
      startDate: string;
      endDate: string;
      page: number;
      pageSize: number;
    };
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    expect(payload).toMatchObject({
      teamId: 0,
      userId: 152683922,
      startDate: String(start.getTime()),
      endDate: String(end.getTime()),
      page: 1,
      pageSize: 100,
    });
    expect(result.windows.map((w) => w.kind)).toEqual(["cursor_models", "other_models"]);
  });

  it("pages through filtered events until the count is exhausted", async () => {
    const now = ctxBase.now();
    const stamp = localMillis(now, 0, 11, 0);
    const pages: number[] = [];
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: withModelUsage([], {
        events: (init) => {
          const page = JSON.parse(typeof init?.body === "string" ? init.body : "{}").page as number;
          pages.push(page);
          if (page === 1) {
            return {
              totalUsageEventsCount: 101,
              usageEventsDisplay: Array.from({ length: 100 }, () => ({
                timestamp: String(stamp),
                model: "composer-2",
                tokenUsage: { inputTokens: 1, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
              })),
            };
          }
          return {
            totalUsageEventsCount: 101,
            usageEventsDisplay: [
              {
                timestamp: String(stamp),
                model: "composer-2",
                tokenUsage: { inputTokens: 9, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
              },
            ],
          };
        },
      }),
    });
    expect(pages).toEqual([1, 2]);
    const usage = parseModelUsage(result.meta?.modelUsage)!;
    const idx = usage.xTime.indexOf(localHourLabel(new Date(stamp)));
    expect(usage.tokens[idx]).toBe(109);
    expect(usage.totalCalls).toBe(101);
  });

  it("accepts the official usageEvents field name", async () => {
    const now = ctxBase.now();
    const stamp = localMillis(now, 0, 8, 0);
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: withModelUsage([], {
        events: {
          usageEvents: [
            {
              timestamp: stamp,
              model: "gpt-5",
              tokenUsage: { inputTokens: 7, outputTokens: 3 },
            },
          ],
        },
      }),
    });
    const usage = parseModelUsage(result.meta?.modelUsage)!;
    expect(usage.totalTokens).toBe(10);
    expect(usage.models).toEqual([{ name: "gpt-5", totalTokens: 10 }]);
  });

  it("still shows a model card when only aggregations arrive", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: withModelUsage([], {
        events: { usageEventsDisplay: [] },
        aggregated: {
          aggregations: [{ modelIntent: "composer-2", inputTokens: 40, outputTokens: 10 }],
        },
      }),
    });
    const usage = parseModelUsage(result.meta?.modelUsage)!;
    expect(usage.tokens[0]).toBe(50);
    expect(usage.totalTokens).toBe(50);
    expect(usage.models).toEqual([{ name: "composer-2", totalTokens: 50 }]);
  });

  it("keeps quota windows when model-usage endpoints fail", async () => {
    const result = await cursorAdapter.fetchUsage({
      ...ctxBase,
      fetchFn: withModelUsage([], { eventsStatus: 500, aggregatedStatus: 500 }),
    });
    expect(result.windows).toHaveLength(2);
    expect(result.meta?.modelUsage).toBeUndefined();
  });
});

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localHourLabel(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:00`;
}

function glmWindowHours(now: Date): string[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const hours: string[] = [];
  for (let stamp = start.getTime(); stamp <= end.getTime(); stamp += 3_600_000) {
    hours.push(localHourLabel(new Date(stamp)));
  }
  return hours;
}

function localMillis(now: Date, dayOffset: number, hour: number, minute: number): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute, 0, 0).getTime();
}

function headerMap(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers) || headers instanceof Headers) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = String(value);
  return out;
}

type EventsBody = Record<string, unknown> | ((init?: RequestInit) => Record<string, unknown>);

function withModelUsage(
  seen: { url: string; headers?: HeadersInit; body?: string }[],
  opts: {
    events?: EventsBody;
    aggregated?: unknown;
    eventsStatus?: number;
    aggregatedStatus?: number;
    me?: unknown;
  },
): typeof fetch {
  const quota = usageSummary({
    individualUsage: { plan: { autoPercentUsed: 20, apiPercentUsed: 40 } },
  });
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: init?.headers, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("get-filtered-usage-events")) {
      if (opts.eventsStatus) return new Response("no events", { status: opts.eventsStatus });
      const body = typeof opts.events === "function" ? opts.events(init) : (opts.events ?? { usageEventsDisplay: [] });
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes("get-aggregated-usage-events")) {
      if (opts.aggregatedStatus) return new Response("no agg", { status: opts.aggregatedStatus });
      return new Response(JSON.stringify(opts.aggregated ?? { aggregations: [] }), { status: 200 });
    }
    if (opts.me && url.includes("/api/auth/me")) {
      return new Response(JSON.stringify(opts.me), { status: 200 });
    }
    return quota(input, init);
  }) as typeof fetch;
}
