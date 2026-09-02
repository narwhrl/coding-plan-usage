import type { HistorySnapshot } from "./types";

/** Recharts 折线图数据点：timeLabel + 每个系列名一个 remainingPct（缺测点为 null）。 */
export type TrendPoint = Record<string, string | number | null>;

export type TrendSeries = {
  data: TrendPoint[];
  /** 出现过的系列名，顺序即调色板 chart-1..5 的分配顺序。 */
  series: string[];
};

/**
 * 把快照历史压成折线图数据；spanMs 为回看窗口（Infinity 表示不裁剪）。
 * Date.now() 留在这里而不是组件里：render 期间调用不纯函数会被 react-hooks/purity 拦下。
 */
export function buildTrendSeries(
  history: HistorySnapshot[] | null,
  spanMs: number,
  labelOf: (iso: string) => string,
  nameOf: (window: HistorySnapshot["windows"][number]) => string,
): TrendSeries {
  const cutoff = Number.isFinite(spanMs) ? Date.now() - spanMs : Number.NEGATIVE_INFINITY;
  const names = new Set<string>();
  const data: TrendPoint[] = [];
  for (const snap of history ?? []) {
    const ms = Date.parse(snap.fetchedAt);
    if (Number.isFinite(ms) && ms < cutoff) continue;
    const point: TrendPoint = { timeLabel: labelOf(snap.fetchedAt) };
    for (const w of snap.windows ?? []) {
      const name = nameOf(w);
      names.add(name);
      point[name] = w.remainingPct ?? null;
    }
    data.push(point);
  }
  return { data, series: Array.from(names) };
}
