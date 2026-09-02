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

/**
 * 窗口数值文本（不含百分比）：优先 remaining，其次 used/total。
 * 百分比由调用方单独渲染，这里不再拼接，避免出现「45% 45%」式重复。
 */
export function windowValueText(w: Window, unitLabel: string): string {
  const parts: string[] = [];
  if (w.remaining !== undefined) parts.push(compactNumber(w.remaining));
  if (w.used !== undefined) parts.push(`${compactNumber(w.used)} / ${w.total !== undefined ? compactNumber(w.total) : "?"}`);
  return parts.length > 0 ? parts.join(" · ") + (unitLabel && unitLabel !== "%" ? ` ${unitLabel}` : "") : "";
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

/** 相对时间（跟随界面语言本地化）。 */
export function relativeTime(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
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
