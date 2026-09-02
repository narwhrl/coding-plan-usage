import { describe, expect, it } from "vitest";
import { buildTrendSeries } from "./trend";
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

  it("maps a missing percentage to null so connectNulls can bridge it", () => {
    const { data } = buildTrendSeries(
      [snap(1, HOUR, [{ kind: "credits", unit: "credits", remaining: 5 }])],
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
