import { describe, expect, it } from "vitest";
import type { HistorySnapshot } from "./types";
import { buildTrendSeries } from "./trend";

function snap(fetchedAt: string, windows: HistorySnapshot["windows"]): HistorySnapshot {
  return { id: 1, fetchedAt, windows, balance: null };
}

describe("buildTrendSeries", () => {
  it("keeps nulls for missing percentages and names series in first-seen order", () => {
    const history = [
      snap("2026-09-01T10:00:00Z", [
        { kind: "daily", label: "Daily", unit: "percent", remainingPct: 80 },
        { kind: "weekly", unit: "percent" },
      ]),
      snap("2026-09-02T10:00:00Z", [{ kind: "daily", label: "Daily", unit: "percent", remainingPct: 40 }]),
    ];

    const result = buildTrendSeries(history, Number.POSITIVE_INFINITY, (iso) => iso, (w) => w.label ?? w.kind);

    expect(result.series).toEqual(["Daily", "weekly"]);
    expect(result.data).toEqual([
      { timeLabel: "2026-09-01T10:00:00Z", Daily: 80, weekly: null },
      { timeLabel: "2026-09-02T10:00:00Z", Daily: 40 },
    ]);
  });

  it("drops snapshots older than the lookback window", () => {
    const now = Date.now();
    const history = [
      snap(new Date(now - 3 * 86_400_000).toISOString(), [
        { kind: "daily", unit: "percent", remainingPct: 90 },
      ]),
      snap(new Date(now - 3_600_000).toISOString(), [{ kind: "daily", unit: "percent", remainingPct: 20 }]),
    ];

    const result = buildTrendSeries(history, 86_400_000, (iso) => iso, (w) => w.kind);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.daily).toBe(20);
  });
});
