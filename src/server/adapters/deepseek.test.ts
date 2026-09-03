import { describe, expect, it } from "vitest";
import { deepseekAdapter } from "./deepseek";

const ctxBase = {
  credentials: {} as Record<string, string>,
  config: {} as { baseUrl?: string },
  now: () => new Date("2026-09-03T09:00:00Z"),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("deepseek adapter", () => {
  it("maps the official CNY balance example without inventing remainingPct", async () => {
    const fetchFn = (async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.deepseek.com/user/balance");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      return jsonResponse({
        is_available: true,
        balance_infos: [
          {
            currency: "CNY",
            total_balance: "110.00",
            granted_balance: "10.00",
            topped_up_balance: "100.00",
          },
        ],
      });
    }) as typeof fetch;

    const result = await deepseekAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "sk-test" },
      fetchFn,
    });

    expect(result.windows).toEqual([
      { kind: "balance", unit: "cny", remaining: 110 },
      { kind: "granted", unit: "cny", remaining: 10 },
      { kind: "topped_up", unit: "cny", remaining: 100 },
    ]);
    expect(result.windows.every((w) => w.remainingPct === undefined && w.total === undefined)).toBe(true);
    expect(result.balance).toEqual({ amount: 110, currency: "CNY" });
    expect(result.meta).toEqual({
      isAvailable: true,
      balances: [{ currency: "CNY", total: 110, granted: 10, toppedUp: 100 }],
    });
  });

  it("accepts USD and strips a pasted Bearer prefix", async () => {
    let seenAuth = "";
    const fetchFn = (async (_input: unknown, init?: RequestInit) => {
      seenAuth = (init?.headers as Record<string, string>).Authorization;
      return jsonResponse({
        is_available: false,
        balance_infos: [{ currency: "USD", total_balance: "0.00", granted_balance: "0", topped_up_balance: "0" }],
      });
    }) as typeof fetch;

    const result = await deepseekAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "Bearer sk-usd" },
      fetchFn,
    });

    expect(seenAuth).toBe("Bearer sk-usd");
    expect(result.windows[0]).toEqual({ kind: "balance", unit: "usd", remaining: 0 });
    expect(result.balance).toEqual({ amount: 0, currency: "USD" });
    expect(result.meta?.isAvailable).toBe(false);
  });

  it("emits one set of windows per currency when both CNY and USD are present", async () => {
    const fetchFn = (async () =>
      jsonResponse({
        is_available: true,
        balance_infos: [
          { currency: "CNY", total_balance: "8.5", granted_balance: "1", topped_up_balance: "7.5" },
          { currency: "USD", total_balance: "2", granted_balance: "0", topped_up_balance: "2" },
        ],
      })) as typeof fetch;

    const result = await deepseekAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "k" },
      fetchFn,
    });

    expect(result.windows.map((w) => ({ kind: w.kind, label: w.label }))).toEqual([
      { kind: "balance", label: "CNY" },
      { kind: "granted", label: "CNY" },
      { kind: "topped_up", label: "CNY" },
      { kind: "balance", label: "USD" },
      { kind: "granted", label: "USD" },
      { kind: "topped_up", label: "USD" },
    ]);
    expect(result.balance).toEqual({ amount: 8.5, currency: "CNY" });
  });

  it("rejects a missing key, HTTP errors, and an empty balance_infos list", async () => {
    await expect(
      deepseekAdapter.fetchUsage({
        ...ctxBase,
        credentials: {},
        fetchFn: (async () => jsonResponse({})) as typeof fetch,
      }),
    ).rejects.toThrow(/missing apiKey/);

    await expect(
      deepseekAdapter.fetchUsage({
        ...ctxBase,
        credentials: { apiKey: "k" },
        fetchFn: (async () => new Response("nope", { status: 401 })) as typeof fetch,
      }),
    ).rejects.toThrow(/DeepSeek balance HTTP 401/);

    await expect(
      deepseekAdapter.fetchUsage({
        ...ctxBase,
        credentials: { apiKey: "k" },
        fetchFn: (async () => jsonResponse({ is_available: true, balance_infos: [] })) as typeof fetch,
      }),
    ).rejects.toThrow(/no usable balance_infos/);
  });
});
