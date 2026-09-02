import type { SparkPoint } from "./types";

export type SparkSlot = {
  /** UTC 日期 YYYY-MM-DD。 */
  day: string;
  /** 当日最紧 remainingPct；当天没有成功快照时为 null。 */
  pct: number | null;
};

/**
 * 把稀疏的每日序列铺成固定 7 个槽位（最右为今天）。
 * 槽位固定，所有卡片的柱子才会纵向对齐；缺测的一天留空而不是插值。
 */
export function buildSparkSlots(points: SparkPoint[], now: Date = new Date()): SparkSlot[] {
  const byDay = new Map(points.map((p) => [p.d, p.pct]));
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(todayMs - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    const pct = byDay.get(day);
    return {
      day,
      pct: typeof pct === "number" && Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null,
    };
  });
}
