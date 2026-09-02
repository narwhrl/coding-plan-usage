import { describe, expect, it } from "vitest";
import { buildTrendSeries } from "./trend";
import type { HistorySnapshot } from "./types";

const snap = (fetchedAt: string, pcts: Record<string, number>): HistorySnapshot => ({
  id: 1,
  fetchedAt,
  windows: Object.entries(pcts).map(([kind, pct]) => ({ kind, unit: "percent", remainingPct: pct })),
  balance: null,
});

const nameOf = (w: { kind: string; label?: string }) => w.label ?? w.kind;

describe("buildTrendSeries", () => {
  const h = [
    snap("2026-08-26T00:00:00Z", { "5h": 90 }),
    snap("2026-08-30T00:00:00Z", { "5h": 60, weekly: 80 }),
    snap("2026-09-01T00:00:00Z", { "5h": 40, weekly: 70 }),
  ];

  it("null 历史 → 空结果", () => {
    expect(buildTrendSeries(null, Infinity, (s) => s, nameOf)).toEqual({ data: [], series: [] });
  });

  it("全范围：系列按出现顺序收集，缺失窗口补 null", () => {
    const { data, series } = buildTrendSeries(h, Number.POSITIVE_INFINITY, (s) => s, nameOf);
    expect(series).toEqual(["5h", "weekly"]);
    expect(data).toHaveLength(3);
    expect(data[0]["weekly"]).toBeUndefined();
    expect(data[2]["5h"]).toBe(40);
  });

  it("时间范围裁剪：24h 只剩最后一行", () => {
    // Date.now 晚于 2026-09-01，24h 内无数据 → 空
    const { data, series } = buildTrendSeries(h, 86_400_000, (s) => s, nameOf);
    expect(data).toHaveLength(0);
    expect(series).toHaveLength(0);
  });

  it("timeLabel 走传入的格式化函数", () => {
    const { data } = buildTrendSeries(h, Number.POSITIVE_INFINITY, () => "X", nameOf);
    expect(data[0].timeLabel).toBe("X");
  });
});
