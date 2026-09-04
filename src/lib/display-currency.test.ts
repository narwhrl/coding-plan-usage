import { describe, expect, it } from "vitest";
import type { AccountView, Window } from "./types";
import { accountForDisplay, historyForCurrency, windowsForCurrency } from "./display-currency";

const cny: Window[] = [
  { kind: "balance", unit: "cny", remaining: 12.4 },
  { kind: "granted", unit: "cny", remaining: 0 },
];
const usd: Window[] = [
  { kind: "balance", unit: "usd", remaining: 1.72 },
  { kind: "granted", unit: "usd", remaining: 0 },
];
const both = [...cny, ...usd];

describe("windowsForCurrency", () => {
  it("returns non-money windows unchanged", () => {
    const plan = [{ kind: "5h", unit: "percent", remainingPct: 40 }];
    expect(windowsForCurrency(plan, "USD")).toEqual(plan);
  });

  it("keeps a single-currency snapshot even when the other code is preferred", () => {
    expect(windowsForCurrency(cny, "USD")).toEqual(cny);
  });

  it("picks the preferred currency when both CNY and USD are present, defaulting to CNY", () => {
    expect(windowsForCurrency(both, "USD")).toEqual(usd);
    expect(windowsForCurrency(both, "CNY")).toEqual(cny);
    expect(windowsForCurrency(both, undefined)).toEqual(cny);
  });
});

describe("accountForDisplay", () => {
  it("rewrites balance to the preferred currency window", () => {
    const account: AccountView = {
      id: "demo-deepseek",
      providerId: "deepseek",
      providerName: "DeepSeek API",
      providerKind: "builtin",
      providerUnit: "usd",
      lane: "api",
      label: "x",
      enabled: true,
      config: { displayCurrency: "USD" },
      nextFetchAt: null,
      consecutiveFailures: 0,
      lastErrorAt: null,
      createdAt: "2026-09-03T00:00:00Z",
      latestSnapshot: {
        id: 1,
        fetchedAt: "2026-09-03T00:00:00Z",
        status: "ok",
        error: null,
        windows: both,
        balance: { amount: 12.4, currency: "CNY" },
      },
      lastOkSnapshot: {
        id: 1,
        fetchedAt: "2026-09-03T00:00:00Z",
        status: "ok",
        error: null,
        windows: both,
        balance: { amount: 12.4, currency: "CNY" },
      },
      warn: false,
      warnThreshold: 20,
    };
    const shown = accountForDisplay(account);
    expect(shown.lastOkSnapshot?.windows).toEqual(usd);
    expect(shown.lastOkSnapshot?.balance).toEqual({ amount: 1.72, currency: "USD" });
  });
});

describe("historyForCurrency", () => {
  it("filters each snapshot independently", () => {
    const history = [
      { id: 1, fetchedAt: "2026-09-01T00:00:00Z", windows: both, balance: null },
      { id: 2, fetchedAt: "2026-09-02T00:00:00Z", windows: cny, balance: null },
    ];
    const usdHistory = historyForCurrency(history, "USD");
    expect(usdHistory?.[0].windows).toEqual(usd);
    expect(usdHistory?.[0].balance).toEqual({ amount: 1.72, currency: "USD" });
    expect(usdHistory?.[1].windows).toEqual(cny);
    expect(usdHistory?.[1].balance).toEqual({ amount: 12.4, currency: "CNY" });
  });
});
