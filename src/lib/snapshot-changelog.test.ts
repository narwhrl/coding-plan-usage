import { describe, expect, it } from "vitest";
import {
  buildChangeLog,
  formatSigned,
  metricsEqual,
  windowKey,
  windowMetric,
} from "./snapshot-changelog";
import type { HistorySnapshot, Window } from "./types";

function win(over: Partial<Window> = {}): Window {
  return { kind: "5h", unit: "percent", ...over };
}

function snap(
  id: number,
  fetchedAt: string,
  windows: Window[],
): HistorySnapshot {
  return { id, fetchedAt, windows, balance: null };
}

describe("windowKey", () => {
  it("distinguishes same-kind windows by label and unit", () => {
    expect(windowKey(win({ kind: "requests", label: "Premium requests", unit: "requests" }))).not.toBe(
      windowKey(win({ kind: "requests", label: "Chat", unit: "requests" })),
    );
    expect(windowKey(win({ kind: "balance", label: "CNY", unit: "cny" }))).not.toBe(
      windowKey(win({ kind: "balance", label: "USD", unit: "usd" })),
    );
  });
});

describe("windowMetric", () => {
  it("prefers remainingPct, then remaining, then used", () => {
    expect(windowMetric(win({ remainingPct: 40, remaining: 8, used: 2 }))).toEqual({
      metric: "percent",
      value: 40,
    });
    expect(windowMetric(win({ remaining: 12.4, unit: "cny" }))).toEqual({
      metric: "amount",
      value: 12.4,
    });
    expect(windowMetric(win({ used: 7, unit: "requests" }))).toEqual({
      metric: "amount",
      value: 7,
    });
    expect(windowMetric(win())).toBeNull();
  });
});

describe("metricsEqual", () => {
  it("rounds percentages to the displayed integer", () => {
    expect(metricsEqual({ metric: "percent", value: 60.4 }, { metric: "percent", value: 59.6 })).toBe(
      true,
    );
    expect(metricsEqual({ metric: "percent", value: 60 }, { metric: "percent", value: 58 })).toBe(
      false,
    );
  });

  it("treats compact-equal amounts as unchanged", () => {
    expect(metricsEqual({ metric: "amount", value: 12.4 }, { metric: "amount", value: 12.4 })).toBe(
      true,
    );
    expect(metricsEqual({ metric: "amount", value: 12.4001 }, { metric: "amount", value: 12.4 })).toBe(
      true,
    );
    expect(metricsEqual({ metric: "amount", value: 18.2 }, { metric: "amount", value: 16.8 })).toBe(
      false,
    );
  });
});

describe("formatSigned", () => {
  it("marks the sign and uses a minus for negatives", () => {
    expect(formatSigned(18)).toBe("+18");
    expect(formatSigned(-18)).toBe("−18");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(-1.4)).toBe("−1.4");
  });
});

describe("buildChangeLog", () => {
  it("returns empty for missing, empty, or single-snapshot history", () => {
    expect(buildChangeLog(null)).toEqual([]);
    expect(buildChangeLog([])).toEqual([]);
    expect(
      buildChangeLog([snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 60 })])]),
    ).toEqual([]);
  });

  it("drops snapshots where every window is unchanged", () => {
    const history = [
      snap(1, "2026-03-10T00:00:00Z", [
        win({ remainingPct: 70 }),
        win({ kind: "weekly", remainingPct: 72 }),
      ]),
      snap(2, "2026-03-10T06:00:00Z", [
        win({ remainingPct: 70 }),
        win({ kind: "weekly", remainingPct: 72 }),
      ]),
    ];
    expect(buildChangeLog(history)).toEqual([]);
  });

  it("keeps only the windows that moved, newest event first", () => {
    const history = [
      snap(1, "2026-03-10T00:00:00Z", [
        win({ remainingPct: 60 }),
        win({ kind: "weekly", remainingPct: 45 }),
      ]),
      snap(2, "2026-03-10T06:00:00Z", [
        win({ remainingPct: 40 }),
        win({ kind: "weekly", remainingPct: 45 }),
      ]),
      snap(3, "2026-03-10T12:00:00Z", [
        win({ remainingPct: 8 }),
        win({ kind: "weekly", remainingPct: 45 }),
      ]),
    ];
    const events = buildChangeLog(history);
    expect(events.map((e) => e.snapshotId)).toEqual([3, 2]);
    expect(events[0].changes).toEqual([
      {
        key: windowKey(win()),
        window: { kind: "5h", label: undefined, minor: undefined, unit: "percent" },
        change: "changed",
        metric: "percent",
        from: 40,
        to: 8,
        delta: -32,
      },
    ]);
    expect(events[1].changes[0]).toMatchObject({ from: 60, to: 40, delta: -20 });
  });

  it("records amount deltas for prepaid windows", () => {
    const events = buildChangeLog([
      snap(1, "2026-03-10T00:00:00Z", [win({ kind: "balance", unit: "cny", remaining: 18.2 })]),
      snap(2, "2026-03-11T00:00:00Z", [win({ kind: "balance", unit: "cny", remaining: 16.8 })]),
    ]);
    expect(events[0].changes[0]).toMatchObject({
      change: "changed",
      metric: "amount",
      from: 18.2,
      to: 16.8,
      delta: expect.closeTo(-1.4),
    });
  });

  it("marks windows that appear or disappear", () => {
    const events = buildChangeLog([
      snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 80 })]),
      snap(2, "2026-03-10T06:00:00Z", [
        win({ remainingPct: 80 }),
        win({ kind: "weekly", remainingPct: 50 }),
      ]),
      snap(3, "2026-03-10T12:00:00Z", [win({ kind: "weekly", remainingPct: 50 })]),
    ]);
    expect(events[0].changes).toEqual([
      expect.objectContaining({ change: "disappeared", window: expect.objectContaining({ kind: "5h" }), from: 80 }),
    ]);
    expect(events[1].changes).toEqual([
      expect.objectContaining({ change: "appeared", window: expect.objectContaining({ kind: "weekly" }), to: 50 }),
    ]);
  });

  it("treats a quota reset as a positive percent change", () => {
    const events = buildChangeLog([
      snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 8 })]),
      snap(2, "2026-03-10T05:00:00Z", [win({ remainingPct: 100 })]),
    ]);
    expect(events[0].changes[0]).toMatchObject({ from: 8, to: 100, delta: 92 });
  });

  it("does not treat resetAt-only updates as a change", () => {
    expect(
      buildChangeLog([
        snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 45, resetAt: "2026-03-10T05:00:00Z" })]),
        snap(2, "2026-03-10T01:00:00Z", [win({ remainingPct: 45, resetAt: "2026-03-10T06:00:00Z" })]),
      ]),
    ).toEqual([]);
  });

  it("sorts unsorted input by fetchedAt before diffing", () => {
    const events = buildChangeLog([
      snap(2, "2026-03-10T06:00:00Z", [win({ remainingPct: 40 })]),
      snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 60 })]),
    ]);
    expect(events[0].changes[0]).toMatchObject({ from: 60, to: 40 });
  });

  it("skips percent jitter that still displays as the same integer", () => {
    expect(
      buildChangeLog([
        snap(1, "2026-03-10T00:00:00Z", [win({ remainingPct: 60.4 })]),
        snap(2, "2026-03-10T01:00:00Z", [win({ remainingPct: 59.6 })]),
      ]),
    ).toEqual([]);
  });
});
