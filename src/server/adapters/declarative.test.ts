import { describe, it, expect } from "vitest";
import { getByDotPath, declarativeAdapter, DeclarativeSpecSchema } from "./declarative";

describe("declarative dot-path", () => {
  it("walks nested objects and array indexes", () => {
    const body = { data: { limits: [{ remaining: 42 }, { remaining: 7 }], balance: { total: 100 } } };
    expect(getByDotPath(body, "data.limits.1.remaining")).toBe(7);
    expect(getByDotPath(body, "data.balance.total")).toBe(100);
    expect(getByDotPath(body, "data.limits.5.remaining")).toBeUndefined();
    expect(getByDotPath(body, "data.missing")).toBeUndefined();
    expect(getByDotPath(body, "")).toBeUndefined();
  });

  it("handles numeric-string values", () => {
    const body = { v: "75" };
    expect(getByDotPath(body, "v")).toBe("75");
  });
});

const SPEC = DeclarativeSpecSchema.parse({
  baseUrl: "http://localhost:9899",
  method: "GET",
  path: "/",
  auth: { type: "bearer" },
  mapping: { total: "data.balance.total", remaining: "data.balance.remaining", resetAt: "data.balance.resetAt" },
  unit: "credits",
});

function stubFetch(payload: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
}

describe("declarative adapter", () => {
  it("maps fields with divisor and computes remainingPct", async () => {
    const spec = DeclarativeSpecSchema.parse({ ...SPEC, divisor: 100 });
    const adapter = declarativeAdapter("Demo", spec);
    const result = await adapter.fetchUsage({
      credentials: { apiKey: "k" },
      config: {},
      fetchFn: stubFetch({ data: { balance: { total: 10000, remaining: 7500 } } }),
      now: () => new Date(),
    });
    expect(result.windows).toHaveLength(1);
    const w = result.windows[0];
    expect(w.total).toBe(100);
    expect(w.remaining).toBe(75);
    expect(w.remainingPct).toBe(75);
    expect(w.unit).toBe("credits");
  });

  it("derives remaining from total-used when remaining missing", async () => {
    const spec = DeclarativeSpecSchema.parse({
      ...SPEC,
      mapping: { total: "data.total", used: "data.used" },
    });
    const adapter = declarativeAdapter("Demo", spec);
    const result = await adapter.fetchUsage({
      credentials: { apiKey: "k" },
      config: {},
      fetchFn: stubFetch({ data: { total: 200, used: 50 } }),
      now: () => new Date(),
    });
    expect(result.windows[0].remaining).toBe(150);
    expect(result.windows[0].remainingPct).toBe(75);
  });

  it("throws when no mapping resolves to a number", async () => {
    const adapter = declarativeAdapter("Demo", SPEC);
    await expect(
      adapter.fetchUsage({
        credentials: { apiKey: "k" },
        config: {},
        fetchFn: stubFetch({ unrelated: true }),
        now: () => new Date(),
      }),
    ).rejects.toThrow(/none of mapping/);
  });

  it("parses ISO resetAt", async () => {
    const adapter = declarativeAdapter("Demo", SPEC);
    const result = await adapter.fetchUsage({
      credentials: { apiKey: "k" },
      config: {},
      fetchFn: stubFetch({ data: { balance: { total: 10, remaining: 5, resetAt: "2026-09-01T00:00:00Z" } } }),
      now: () => new Date(),
    });
    expect(result.windows[0].resetAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("uses header auth when configured", async () => {
    const spec = DeclarativeSpecSchema.parse({
      ...SPEC,
      auth: { type: "header", header: "X-Key" },
    });
    const calls: Record<string, string>[] = [];
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ data: { balance: { total: 1, remaining: 1 } } }), { status: 200 });
    }) as typeof fetch;
    const adapter = declarativeAdapter("Demo", spec);
    await adapter.fetchUsage({ credentials: { apiKey: "k" }, config: {}, fetchFn, now: () => new Date() });
    expect(calls[0]["X-Key"]).toBe("k");
    expect(calls[0]["Authorization"]).toBeUndefined();
  });
});
