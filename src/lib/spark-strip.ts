import type { SparkPoint } from "./types";

export type SparkSlot = { day: string; pct: number | null };

/**
 * 近 7 天每日最紧值 → 固定 7 个日槽（最右为今天）。缺测的日子是空槽：
 * 空槽本身就是「那天没采到」的信息，所以画柱不画线（折线会在缺测日之间插值）。
 * 槽位固定，所有卡片的柱子才会纵向对齐。
 */
export function sparkSlots(points: SparkPoint[], now: Date = new Date()): SparkSlot[] {
  const dayMs = 86_400_000;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const byDay = new Map(points.map((p) => [p.d, p.pct]));
  const slots: SparkSlot[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart - i * dayMs).toISOString().slice(0, 10);
    const pct = byDay.get(day);
    slots.push({ day, pct: pct === undefined ? null : Math.max(0, Math.min(100, pct)) });
  }
  return slots;
}
