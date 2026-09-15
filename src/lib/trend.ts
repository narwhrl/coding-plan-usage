import type { HistorySnapshot } from "./types";

/**
 * Recharts 折线图数据点：timeLabel + 每个系列名一个数值（缺测点为 null）。
 * TREND_RESETS_KEY 下挂该点发生重置的系列名数组（标记点/tooltip 用，不参与绘图）。
 */
export type TrendPoint = Record<string, string | number | null | string[]>;

/** 数据点里记录重置系列名的键；不会与本地化的系列名冲突。 */
export const TREND_RESETS_KEY = "__resets";

export type TrendSeries = {
  data: TrendPoint[];
  /** 出现过的系列名，顺序即调色板 chart-1..5 的分配顺序。 */
  series: string[];
};

export type TrendValueMode = "percent" | "amount";

/**
 * 重置判定：配额剩余只减不增，remainingPct 一次回升 ≥5pp 即是新窗口。
 * 阈值只挡适配器舍入抖动；正常采集间隔下重置后的回落远不止 5pp。
 */
const RESET_JUMP_PCT = 5;
/**
 * resetAt 一次性前移 ≥1h 也算重置——覆盖「快满格时重置」这种看不出跳变的情形。
 * reset_after_seconds 派生的 resetAt（codex）只有秒级漂移，不会误触；
 * 短于 1h 的滚动窗口由跳升信号兜底。
 */
const RESET_SHIFT_MS = 3_600_000;

/** 任一窗口有 remainingPct 就按配额百分比画；否则按预付费 remaining 画余额。 */
export function trendValueMode(history: HistorySnapshot[] | null): TrendValueMode {
  for (const snap of history ?? []) {
    for (const w of snap.windows ?? []) {
      if (typeof w.remainingPct === "number") return "percent";
    }
  }
  return "amount";
}

/**
 * 把快照历史压成折线图数据；spanMs 为回看窗口（Infinity 表示不裁剪）。
 * Date.now() 留在这里而不是组件里：render 期间调用不纯函数会被 react-hooks/purity 拦下。
 *
 * 范围外的快照不产点，但仍参与重置判定——范围边界上发生的那次重置，
 * 会标在范围内第一个点上，而不是因为上一快照被裁掉就漏掉。
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
  const prevByName = new Map<string, { pct: number | null; resetAt: string | null }>();
  for (const snap of history ?? []) {
    const ms = Date.parse(snap.fetchedAt);
    const inRange = !Number.isFinite(ms) || ms >= cutoff;
    const point: TrendPoint | null = inRange ? { timeLabel: labelOf(snap.fetchedAt) } : null;
    for (const w of snap.windows ?? []) {
      const name = nameOf(w);
      const pct = typeof w.remainingPct === "number" ? w.remainingPct : null;
      const resetAt = typeof w.resetAt === "string" ? w.resetAt : null;
      const prev = prevByName.get(name);
      let reset = false;
      if (prev) {
        if (pct !== null && prev.pct !== null && pct - prev.pct >= RESET_JUMP_PCT) reset = true;
        if (!reset && resetAt && prev.resetAt) {
          reset = Date.parse(resetAt) - Date.parse(prev.resetAt) >= RESET_SHIFT_MS;
        }
      }
      prevByName.set(name, { pct, resetAt });
      if (!point) continue;
      names.add(name);
      point[name] =
        pct ?? (typeof w.remaining === "number" ? w.remaining : null);
      if (reset) {
        const marks = (point[TREND_RESETS_KEY] as string[] | undefined) ?? [];
        if (!marks.includes(name)) marks.push(name);
        point[TREND_RESETS_KEY] = marks;
      }
    }
    if (point) data.push(point);
  }
  return { data, series: Array.from(names) };
}
