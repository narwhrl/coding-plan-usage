import type { Window } from "./types";

/** next-intl 的 t 在纯函数里的最小签名（has 用于缺词条回退）。 */
export type Translate = ((key: string, values?: Record<string, string | number | Date>) => string) & {
  has?: (key: string) => boolean;
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

/** 百分比文本；无数值返回 null，由调用方决定占位。 */
export function windowPctText(w: Window, digits = 0): string | null {
  return w.remainingPct === undefined ? null : `${w.remainingPct.toFixed(digits)}%`;
}

/**
 * 窗口的绝对量文本（remaining 或 used/total），不含百分比。
 * percent 单位的窗口只有百分比信息，返回 null，避免与 windowPctText 重复渲染成 "45% 45% %"。
 */
export function windowAmountText(w: Window, unitLabel: string): string | null {
  if (w.unit === "percent") return null;
  let amount: string | null = null;
  if (w.remaining !== undefined) {
    amount =
      w.total !== undefined
        ? `${compactNumber(w.remaining)} / ${compactNumber(w.total)}`
        : compactNumber(w.remaining);
  } else if (w.used !== undefined) {
    amount = `${compactNumber(w.used)} / ${w.total !== undefined ? compactNumber(w.total) : "?"}`;
  }
  if (amount === null) return null;
  return unitLabel ? `${amount} ${unitLabel}` : amount;
}

/** 额度紧张度分级：低于阈值 critical，低于阈值 2 倍（最多 50%）warning。 */
export type QuotaTone = "critical" | "warning" | "normal";

export function quotaTone(pct: number | undefined, warnPct: number): QuotaTone {
  if (pct === undefined) return "normal";
  if (pct < warnPct) return "critical";
  if (pct < Math.min(warnPct * 2, 50)) return "warning";
  return "normal";
}

/** resetAt → 人读倒计时（<1h 分钟，<48h 小时，其余天）。 */
export function countdownText(resetAt: string | null | undefined, t: Translate): string | null {
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
 * 窗口重置时刻的人读文本：未来给倒计时，已过去给「n 分钟前」。
 * 采集有间隔，快照里的 resetAt 可能已经过期；那时说「0 分钟后」是假的。
 */
export function resetText(resetAt: string | null | undefined, t: Translate): string | null {
  if (!resetAt) return null;
  const ms = Date.parse(resetAt);
  if (!Number.isFinite(ms)) return null;
  return ms > Date.now() ? countdownText(resetAt, t) : relativeTimeText(resetAt, t);
}

/** 相对过去时间，本地化（t 绑定到 time 命名空间）。 */
export function relativeTimeText(iso: string | null | undefined, t: Translate): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("ago", { time: t("minutes", { count: minutes }) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("ago", { time: t("hours", { count: hours }) });
  return t("ago", { time: t("days", { count: Math.round(hours / 24) }) });
}

export function localDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/** 图表轴 / 表格用的紧凑时间："9/2 14:00"，locale 感知但不含年与秒。 */
export function shortDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 只要时钟部分："14:00"。 */
export function shortTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * 窗口显示名：优先适配器给的 label，其次 window.<kind> 词条，最后裸 kind。
 * 自定义提供商的 kind 不在词条表里，所以必须走 t.has 判断，不能直接 t()。
 */
export function windowName(w: Pick<Window, "kind" | "label">, t: Translate): string {
  if (w.label) return w.label;
  const key = `window.${w.kind}`;
  return t.has?.(key) ? t(key) : w.kind;
}

/** 单位显示名：unit.<unit> 词条，缺失回退裸值。 */
export function unitName(unit: string, t: Translate): string {
  const key = `unit.${unit}`;
  return t.has?.(key) ? t(key) : unit;
}

/** 提供商 monogram：名称前两个字母（大写）。 */
export function monogram(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\u4e00-\u9fff]/g, "");
  return (cleaned.slice(0, 2) || name.slice(0, 2) || "?").toUpperCase();
}
