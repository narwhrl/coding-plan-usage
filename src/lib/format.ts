import type { Window } from "./types";

/** 紧凑数字：1234567 → 1.23M；保留必要精度。 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1)}K`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** 窗口主显示值：优先 remaining，否则 used/total。 */
export function windowValueText(w: Window, unitLabel: string): string {
  const parts: string[] = [];
  if (w.remaining !== undefined) parts.push(compactNumber(w.remaining));
  if (w.used !== undefined) parts.push(`${compactNumber(w.used)} / ${w.total !== undefined ? compactNumber(w.total) : "?"}`);
  if (parts.length === 0 && w.remainingPct !== undefined) parts.push(`${w.remainingPct.toFixed(0)}%`);
  return parts.length > 0 ? parts.join(" · ") + (unitLabel ? ` ${unitLabel}` : "") : "—";
}

/** resetAt → 人读倒计时（<1h 分钟，<48h 小时，其余天）。 */
export function countdownText(
  resetAt: string | null | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  if (!resetAt) return null;
  const ms = Date.parse(resetAt);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return t("inMinutes", { count: 0 });
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return t("inMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t("inHours", { count: hours });
  return t("inDays", { count: Math.round(hours / 24) });
}

/** 相对时间（本地时区显示）。 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function localDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/** 提供商 monogram：名称前两个字母（大写）。 */
export function monogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\u4e00-\u9fff]/g, "");
  return (cleaned.slice(0, 2) || name.slice(0, 2) || "?").toUpperCase();
}
