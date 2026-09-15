import { describe, expect, it } from "vitest";
import { buildTrendSeries, TREND_RESETS_KEY, trendValueMode } from "./trend";
import type { HistorySnapshot } from "./types";

const HOUR = 3_600_000;

function snap(id: number, agoMs: number, windows: HistorySnapshot["windows"]): HistorySnapshot {
  return {
    id,
    fetchedAt: new Date(Date.now() - agoMs).toISOString(),
    windows,
    balance: null,
  };
}

const label = (iso: string) => iso.slice(11, 16);
const name = (w: HistorySnapshot["windows"][number]) => w.label ?? w.kind;

describe("buildTrendSeries", () => {
  it("collects one series per window in first-seen order", () => {
    const { data, series } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [{ kind: "5h", unit: "percent", remainingPct: 60 }]),
        snap(2, HOUR, [
          { kind: "5h", unit: "percent", remainingPct: 40 },
          { kind: "weekly", unit: "percent", remainingPct: 80 },
        ]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(series).toEqual(["5h", "weekly"]);
    expect(data).toHaveLength(2);
    expect(data[0]["5h"]).toBe(60);
    expect(data[0].weekly).toBeUndefined();
    expect(data[1].weekly).toBe(80);
  });

  it("drops snapshots older than the requested span", () => {
    const history = [
      snap(1, 48 * HOUR, [{ kind: "5h", unit: "percent", remainingPct: 10 }]),
      snap(2, HOUR, [{ kind: "5h", unit: "percent", remainingPct: 20 }]),
    ];
    expect(buildTrendSeries(history, 24 * HOUR, label, name).data).toHaveLength(1);
    expect(buildTrendSeries(history, Number.POSITIVE_INFINITY, label, name).data).toHaveLength(2);
  });

  it("falls back to remaining amount when a window has no percentage", () => {
    const { data } = buildTrendSeries(
      [snap(1, HOUR, [{ kind: "balance", unit: "cny", remaining: 12.4 }])],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[0].balance).toBe(12.4);
  });

  it("maps a window with neither percentage nor remaining to null", () => {
    const { data } = buildTrendSeries(
      [snap(1, HOUR, [{ kind: "credits", unit: "credits" }])],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[0].credits).toBeNull();
  });

  it("returns empty output for missing history", () => {
    expect(buildTrendSeries(null, Number.POSITIVE_INFINITY, label, name)).toEqual({
      data: [],
      series: [],
    });
  });
});

describe("buildTrendSeries reset marks", () => {
  it("marks a point when remainingPct jumps back up by >= 5pp", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [{ kind: "5h", unit: "percent", remainingPct: 40 }]),
        snap(2, HOUR, [{ kind: "5h", unit: "percent", remainingPct: 98 }]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[0][TREND_RESETS_KEY]).toBeUndefined();
    expect(data[1][TREND_RESETS_KEY]).toEqual(["5h"]);
  });

  it("ignores small upticks below the jump threshold", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [{ kind: "5h", unit: "percent", remainingPct: 95 }]),
        snap(2, HOUR, [{ kind: "5h", unit: "percent", remainingPct: 98 }]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[1][TREND_RESETS_KEY]).toBeUndefined();
  });

  it("marks a near-full reset via resetAt moving forward, even without a visible jump", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [
          { kind: "weekly", unit: "percent", remainingPct: 97, resetAt: new Date(Date.now() - HOUR).toISOString() },
        ]),
        snap(2, HOUR, [
          {
            kind: "weekly",
            unit: "percent",
            remainingPct: 99,
            resetAt: new Date(Date.now() + 6 * 24 * HOUR).toISOString(),
          },
        ]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[1][TREND_RESETS_KEY]).toEqual(["weekly"]);
  });

  it("ignores second-level resetAt drift from reset_after_seconds derivation", () => {
    const base = Date.now() + 5 * HOUR;
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [
          { kind: "5h", unit: "percent", remainingPct: 60, resetAt: new Date(base).toISOString() },
        ]),
        snap(2, HOUR, [
          { kind: "5h", unit: "percent", remainingPct: 50, resetAt: new Date(base + 30_000).toISOString() },
        ]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[1][TREND_RESETS_KEY]).toBeUndefined();
  });

  it("does not mark balance top-ups (amount windows never reset)", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [{ kind: "balance", unit: "cny", remaining: 10 }]),
        snap(2, HOUR, [{ kind: "balance", unit: "cny", remaining: 110 }]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[1][TREND_RESETS_KEY]).toBeUndefined();
  });

  it("keeps marks per series when only one window resets", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 2 * HOUR, [
          { kind: "5h", unit: "percent", remainingPct: 40 },
          { kind: "weekly", unit: "percent", remainingPct: 60 },
        ]),
        snap(2, HOUR, [
          { kind: "5h", unit: "percent", remainingPct: 100 },
          { kind: "weekly", unit: "percent", remainingPct: 55 },
        ]),
      ],
      Number.POSITIVE_INFINITY,
      label,
      name,
    );
    expect(data[1][TREND_RESETS_KEY]).toEqual(["5h"]);
  });

  it("marks the first in-range point when the reset happened across the range cutoff", () => {
    const { data } = buildTrendSeries(
      [
        snap(1, 48 * HOUR, [{ kind: "5h", unit: "percent", remainingPct: 10 }]),
        snap(2, HOUR, [{ kind: "5h", unit: "percent", remainingPct: 95 }]),
      ],
      24 * HOUR,
      label,
      name,
    );
    expect(data).toHaveLength(1);
    expect(data[0][TREND_RESETS_KEY]).toEqual(["5h"]);
  });
});

describe("trendValueMode", () => {
  it("uses percent when any window has remainingPct, otherwise amount", () => {
    expect(
      trendValueMode([snap(1, HOUR, [{ kind: "5h", unit: "percent", remainingPct: 40 }])]),
    ).toBe("percent");
    expect(trendValueMode([snap(1, HOUR, [{ kind: "balance", unit: "cny", remaining: 8 }])])).toBe(
      "amount",
    );
    expect(trendValueMode(null)).toBe("amount");
  });
});
