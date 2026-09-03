import type { SparkPoint } from "@/lib/types";
/** windows JSON 元素（对象原样透传，仅收窄读取字段）；非数组或非对象元素及空对象一律剔除（历史脏数据防御）。 */
export function parseWindows(
  text: string | null,
): ({ remainingPct?: number; minor?: boolean } & Record<string, unknown>)[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is { remainingPct?: number; minor?: boolean } & Record<string, unknown> =>
        typeof w === "object" && w !== null && !Array.isArray(w) && Object.keys(w).length > 0,
    );
  } catch {
    return [];
  }
}


/**
 * 近 7 天每日最紧值序列（概览卡 `SparkStrip` 的数据源）。
 *
 * 规则：
 * - 日期桶 = `fetchedAt.slice(0, 10)`（ISO UTC 前缀，字典序即可比较）。
 * - 每行取全部窗口中数值型 `remainingPct` 的最小值（`minor` 车道跳过；无数值窗口则跳过该行）。
 * - 同一天多行取最小值。
 * - 只保留 [UTC 当日零点 − 6 天, now] 区间内的行；非法/未来时间戳剔除。
 */
export function dailyTightestSeries(
  rows: { fetchedAt: string; windows: ({ remainingPct?: number; minor?: boolean } & Record<string, unknown>)[] }[],
  now: Date = new Date(),
): SparkPoint[] {
  const startDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const ts = Date.parse(row.fetchedAt);
    if (!Number.isFinite(ts) || ts > now.getTime()) continue;
    const day = row.fetchedAt.slice(0, 10);
    if (day < startDay) continue;
    let min: number | undefined;
    for (const w of row.windows) {
      if (w.minor) continue;
      const pct = w.remainingPct;
      if (typeof pct !== "number") continue;
      min = min === undefined ? pct : Math.min(min, pct);
    }
    if (min === undefined) continue;
    const existing = byDay.get(day);
    byDay.set(day, existing === undefined ? min : Math.min(existing, min));
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([d, pct]) => ({ d, pct }));
}
