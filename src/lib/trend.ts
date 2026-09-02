import type { HistorySnapshot } from "./types";

/**
 * 趋势图序列构建：按时间范围裁剪快照，为每个窗口系列收集 remainingPct。
 * 渲染期不碰 Date.now()（react-hooks/purity）——「现在」在这里一次性取定。
 */
export function buildTrendSeries(
  history: HistorySnapshot[] | null,
  rangeMs: number,
  formatTime: (iso: string) => string,
  nameOf: (w: { kind: string; label?: string }) => string,
): { data: Record<string, string | number | null>[]; series: string[] } {
  if (!history) return { data: [], series: [] };
  const cutoff = Number.isFinite(rangeMs) ? Date.now() - rangeMs : Number.NEGATIVE_INFINITY;
  const rows = history.filter((snap) => Date.parse(snap.fetchedAt) >= cutoff);

  const series: string[] = [];
  const seen = new Set<string>();
  for (const snap of rows) {
    for (const w of snap.windows ?? []) {
      const name = nameOf(w);
      if (!seen.has(name)) {
        seen.add(name);
        series.push(name);
      }
    }
  }

  const data = rows.map((snap) => {
    const point: Record<string, string | number | null> = {
      time: snap.fetchedAt,
      timeLabel: formatTime(snap.fetchedAt),
    };
    for (const w of snap.windows ?? []) {
      point[nameOf(w)] = w.remainingPct ?? null;
    }
    return point;
  });

  return { data, series };
}
