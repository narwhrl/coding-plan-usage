import { describe, expect, it } from "vitest";
import type { AccountView, SnapshotView, Window } from "./types";
import { nextResetWindow, overviewKpis, sortAccountsByUrgency, tightestWindow } from "./overview";

function snap(windows: Window[], status: SnapshotView["status"] = "ok"): SnapshotView {
  return {
    id: 1,
    fetchedAt: "2026-09-02T12:00:00Z",
    status,
    error: status === "error" ? "failed" : null,
    windows,
    balance: null,
  };
}

function mkAccount(overrides: Partial<AccountView> = {}): AccountView {
  return {
    id: "account",
    providerId: "provider",
    providerName: "Provider",
    providerKind: "builtin",
    providerUnit: "percent",
    label: "Account",
    enabled: true,
    config: {},
    nextFetchAt: null,
    createdAt: "2026-09-02T12:00:00Z",
    latestSnapshot: null,
    lastOkSnapshot: null,
    warn: false,
    warnThreshold: 20,
    ...overrides,
  };
}

function window(remainingPct?: number, resetAt?: string): Window {
  return { kind: "daily", unit: "percent", remainingPct, resetAt };
}

describe("tightestWindow", () => {
  it("returns the smallest numeric remaining percentage or null", () => {
    expect(tightestWindow(snap([window(55), window(undefined), window(12)]))?.remainingPct).toBe(12);
    expect(tightestWindow(snap([window(undefined)]))).toBeNull();
    expect(tightestWindow(null)).toBeNull();
  });

  it("ignores minor lanes even when they are tighter", () => {
    const major = window(55);
    expect(tightestWindow(snap([major, { ...window(2), minor: true }]))).toBe(major);
  });
});

describe("nextResetWindow", () => {
  it("picks the soonest future reset and ignores past or missing ones", () => {
    const soon = window(50, new Date(Date.now() + 60_000).toISOString());
    const later = window(50, new Date(Date.now() + 600_000).toISOString());
    const past = window(50, new Date(Date.now() - 60_000).toISOString());

    expect(nextResetWindow([later, soon, past])).toBe(soon);
    expect(nextResetWindow([past, window(50)])).toBeNull();
    expect(nextResetWindow([])).toBeNull();
  });

  it("ignores minor lanes even when they reset sooner", () => {
    const major = window(50, new Date(Date.now() + 600_000).toISOString());
    const minor = { ...window(50, new Date(Date.now() + 60_000).toISOString()), minor: true };
    expect(nextResetWindow([minor, major])).toBe(major);
  });
});

describe("overviewKpis", () => {
  it("counts an errored account and still uses its display snapshot for the next reset", () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    const account = mkAccount({
      latestSnapshot: snap([], "error"),
      lastOkSnapshot: snap([window(8, resetAt)]),
    });

    const result = overviewKpis([account]);

    expect(result.errorCount).toBe(1);
    expect(result.tightest).toBeNull();
    expect(result.nextReset).toEqual({ account, window: account.lastOkSnapshot?.windows[0] });
  });

  it("excludes disabled accounts from the quota KPIs but still counts them", () => {
    const account = mkAccount({
      enabled: false,
      latestSnapshot: snap([], "error"),
      lastOkSnapshot: snap([window(4, new Date(Date.now() + 60_000).toISOString())]),
    });

    expect(overviewKpis([account])).toEqual({
      total: 1,
      enabledTotal: 0,
      disabledCount: 1,
      errorCount: 0,
      tightest: null,
      nextReset: null,
    });
  });

  it("ignores reset timestamps in the past", () => {
    const account = mkAccount({
      latestSnapshot: snap([window(25, new Date(Date.now() - 60_000).toISOString())]),
    });

    const result = overviewKpis([account]);

    expect(result.tightest?.window.remainingPct).toBe(25);
    expect(result.nextReset).toBeNull();
  });

  it("skips minor lanes for both the tightest and next-reset KPIs", () => {
    const account = mkAccount({
      latestSnapshot: snap([
        { ...window(2, new Date(Date.now() + 60_000).toISOString()), minor: true },
        window(25, new Date(Date.now() + 600_000).toISOString()),
      ]),
    });

    const result = overviewKpis([account]);

    expect(result.tightest?.window.remainingPct).toBe(25);
    expect(result.nextReset?.window.remainingPct).toBe(25);
  });
});

describe("sortAccountsByUrgency", () => {
  it("sorts error, warning, normal, and disabled accounts with stable percentage ties", () => {
    const accounts = [
      mkAccount({ id: "normal-high", latestSnapshot: snap([window(70)]) }),
      mkAccount({ id: "disabled", enabled: false, latestSnapshot: snap([window(1)]) }),
      mkAccount({ id: "tie-first", latestSnapshot: snap([window(40)]) }),
      mkAccount({ id: "warning", warn: true, latestSnapshot: snap([window(15)]) }),
      mkAccount({ id: "error", latestSnapshot: snap([], "error"), lastOkSnapshot: snap([window(5)]) }),
      mkAccount({ id: "normal-low", latestSnapshot: snap([window(20)]) }),
      mkAccount({ id: "tie-second", latestSnapshot: snap([window(40)]) }),
    ];

    expect(sortAccountsByUrgency(accounts).map((account) => account.id)).toEqual([
      "error",
      "warning",
      "normal-low",
      "tie-first",
      "tie-second",
      "normal-high",
      "disabled",
    ]);
  });
});
