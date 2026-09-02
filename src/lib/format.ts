import type { Window } from "./types";

/** next-intl 翻译函数的最小形状：windowName/unitName 只需要 has + 取值。 */
export type Translator = {
  (key: string, values?: Record<string, string | number | Date>): string;
  has: (key: string) => boolean;
};

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
 * 本地化窗口名：优先窗口自带 label；`window.<kind>` 词条不存在时（自定义提供商的
 * kind 不在词条表里）回退为 kind 原文。next-intl 没有 defaultValue，必须用 has() 判断，
 * 否则会把 `window.<kind>` 原样渲染出来。
 */
export function windowName(w: { kind: string; label?: string }, t: Translator): string {
  if (w.label) return w.label;
  const key = `window.${w.kind}`;
  return t.has(key) ? t(key) : w.kind;
}

/** 本地化单位名，同样用 has() 兜底。 */
export function unitName(unit: string, t: Translator): string {
  const key = `unit.${unit}`;
  return t.has(key) ? t(key) : unit;
}

/** 窗口主显示值：优先 remaining，否则 used/total。 */
export function windowValueText(w: Window, unitLabel: string): string {
  const parts: string[] = [];
  if (w.remaining !== undefined) parts.push(compactNumber(w.remaining));
  if (w.used !== undefined) parts.push(`${compactNumber(w.used)} / ${w.total !== undefined ? compactNumber(w.total) : "?"}`);
  if (parts.length === 0 && w.remainingPct !== undefined) parts.push(`${w.remainingPct.toFixed(0)}%`);
  return parts.length > 0 ? parts.join(" · ") + (unitLabel ? ` ${unitLabel}` : "") : "—";
}

/** 窗口百分比读数：无 remainingPct 时返回 null（调用方改显示绝对量）。 */
export function windowPctText(w: Window): string | null {
  return w.remainingPct !== undefined ? `${w.remainingPct.toFixed(0)}%` : null;
}

/**
 * 窗口绝对量读数：percent 单位返回 null（与 windowPctText 拼在一起会渲染出「45% 45%」）。
 * 没有可显示的绝对量时也返回 null。
 */
export function windowAmountText(w: Window, unitLabel: string): string | null {
  if (w.unit === "percent") return null;
  const parts: string[] = [];
  if (w.remaining !== undefined) parts.push(compactNumber(w.remaining));
  if (w.used !== undefined) parts.push(`${compactNumber(w.used)} / ${w.total !== undefined ? compactNumber(w.total) : "?"}`);
  return parts.length > 0 ? `${parts.join(" · ")}${unitLabel ? ` ${unitLabel}` : ""}` : null;
}

/** 额度紧张度分级：全站唯一判定入口，QuotaBar/读数/sparkline/KPI 都从这里取色。 */
export type QuotaTone = "critical" | "warning" | "normal";

export function quotaTone(pct: number, warnPct: number): QuotaTone {
  if (pct < warnPct) return "critical";
  if (pct < Math.min(warnPct * 2, 50)) return "warning";
  return "normal";
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

/**
 * 窗口重置时刻：采集有间隔，快照里的 resetAt 可能已经过期，那时要说「1 小时前」
 * 而不是「0 分钟后」。只有确定筛过未来时间的地方（KPI 的 nextReset）才直接用 countdownText。
 */
export function resetText(
  resetAt: string | null | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  if (!resetAt) return null;
  const ms = Date.parse(resetAt);
  if (!Number.isFinite(ms)) return null;
  if (ms > Date.now()) return countdownText(resetAt, t);
  return relativeTimeText(resetAt, t);
}

/** 本地化相对时间（「3 分钟前」）。 */
export function relativeTimeText(
  iso: string | null | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: Math.round(hours / 24) });
}

/** @deprecated 英文紧凑相对时间，保留给未迁移的调用方；新代码用 relativeTimeText。 */
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
  // 不带秒：秒级精度对采集快照没有信息量，还挤占表格宽度。
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 短时间（HH:mm），24h 视图的横轴刻度用。 */
export function shortTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** 短日期时间（M月d日 HH:mm 风格），多天视图的横轴刻度用。 */
export function shortDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 提供商 monogram：名称前两个字母（大写）。 */
export function monogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\u4e00-\u9fff]/g, "");
  return (cleaned.slice(0, 2) || name.slice(0, 2) || "?").toUpperCase();
}
