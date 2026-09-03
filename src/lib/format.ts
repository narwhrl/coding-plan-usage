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

/** 卡片/详情主读数：有剩余百分比用百分比，否则用绝对量（预付费余额）。 */
export function windowPrimaryText(w: Window, t: Translate, pctDigits = 0): string | null {
  return windowPctText(w, pctDigits) ?? windowAmountText(w, unitName(w.unit, t));
}

/**
 * 窗口的绝对量文本（remaining 或 used/total），不含百分比。
 * percent 单位的窗口只有百分比信息，返回 null，避免与 windowPctText 重复渲染成 "45% 45% %"。
 */
export function windowAmountText(w: Window, unitLabel: string): string | null {
  if (w.unit === "percent") return null;
  // 百分比语义始终是「剩余」，所以有 remaining 就按剩余/总量呈现，避免和 used 混读。
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
 * 适配器曾写入的英文同义 label → window.<kind>。
 * 历史快照仍带着 Weekly quota / Token usage (weekly) 这类名字，
 * 显示层必须映射，否则中文界面会停在英文，各家用词也对不齐。
 */
const WINDOW_LABEL_ALIASES: Record<string, string> = {
  "weekly quota": "window.weekly",
  "weekly usage": "window.weekly",
  "weekly": "window.weekly",
  "token usage (weekly)": "window.weekly",
  "token usage(weekly)": "window.weekly",
  "weekly (7d)": "window.weekly",
  "secondary (weekly)": "window.weekly",
  "7-day": "window.weekly",
  "7d": "window.weekly",
  "5-hour session": "window.5h",
  "5-hour window": "window.5h",
  "5-hour quota": "window.5h",
  "5 hour quota": "window.5h",
  "token usage (5h)": "window.5h",
  "token usage (5 hour)": "window.5h",
  "token usage(5 hour)": "window.5h",
  "session (5h)": "window.5h",
  "primary (5h)": "window.5h",
  "5h interval": "window.5h",
  "5h": "window.5h",
  "plan usage": "window.monthly",
  "overall usage": "window.monthly",
  "team pooled": "window.monthly",
  "monthly": "window.monthly",
  "monthly quota": "window.monthly",
  "mcp usage (monthly)": "window.mcp",
  "mcp monthly usage": "window.mcp",
  "mcp usage(1 month)": "window.mcp",
  "mcp monthly": "window.mcp",
  credits: "window.credits",
  "credits (lifetime)": "window.lifetime",
  "lifetime credits": "window.lifetime",
  balance: "window.balance",
  granted: "window.granted",
  "topped up": "window.topped_up",
  "premium requests": "window.premium",
  chat: "window.chat",
};

/** 同 kind 多条时 label 才是区分信息（模型名），不能被 kind 词条盖掉。 */
const DISTINCTIVE_LABEL_KINDS = new Set(["daily"]);

const CURRENCY_CODE = /^[A-Za-z]{3}$/;
const LABEL_CURRENCY_SUFFIX = /^(.*?)\s*\(([a-z]{3})\)\s*$/i;

function normalizeWindowLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function aliasForLabel(label: string): string | undefined {
  const normalized = normalizeWindowLabel(label);
  return WINDOW_LABEL_ALIASES[normalized] ?? WINDOW_LABEL_ALIASES[normalized.replace(/\s*\([a-z0-9]{3,4}\)\s*$/i, "").trim()];
}

function withCurrency(name: string, currency: string, t: Translate): string {
  return t.has?.("window.withCurrency") ? t("window.withCurrency", { name, currency }) : `${name} (${currency})`;
}

/**
 * 窗口显示名：规范 kind 走 window.<kind>；英文同义 label 映射到同一词条；
 * 只有模型名这类无法用 kind 表达的 label 才原样显示。
 * 自定义提供商的 kind 不在词条表里，所以必须走 t.has 判断，不能直接 t()。
 */
export function windowName(w: Pick<Window, "kind" | "label">, t: Translate): string {
  const kindKey = `window.${w.kind}`;
  const hasKind = Boolean(t.has?.(kindKey));

  if (w.label) {
    const currencyMatch = LABEL_CURRENCY_SUFFIX.exec(w.label.trim());
    if (currencyMatch) {
      const aliased = aliasForLabel(currencyMatch[1]);
      if (aliased && t.has?.(aliased)) return withCurrency(t(aliased), currencyMatch[2].toUpperCase(), t);
    }
    const aliased = aliasForLabel(w.label);
    if (aliased && t.has?.(aliased)) return t(aliased);
    if (CURRENCY_CODE.test(w.label.trim()) && hasKind) {
      return withCurrency(t(kindKey), w.label.trim().toUpperCase(), t);
    }
    if (DISTINCTIVE_LABEL_KINDS.has(w.kind)) return w.label;
  }

  if (hasKind) return t(kindKey);
  return w.label || w.kind;
}

/** 凭证字段名：fields.<providerId>.<key>，否则 fields.<key>，再回退适配器原文。 */
export function fieldLabel(providerId: string, field: { key: string; label: string }, t: Translate): string {
  const specific = `fields.${providerId}.${field.key}`;
  if (t.has?.(specific)) return t(specific);
  const generic = `fields.${field.key}`;
  return t.has?.(generic) ? t(generic) : field.label;
}

/** 凭证占位符：fields.<providerId>.<key>Placeholder，否则适配器原文。 */
export function fieldPlaceholder(
  providerId: string,
  field: { key: string; placeholder?: string },
  t: Translate,
): string | undefined {
  const key = `fields.${providerId}.${field.key}Placeholder`;
  if (t.has?.(key)) return t(key);
  return field.placeholder;
}

const REGION_BY_URL: Record<string, string> = {
  "https://api.z.ai": "region.zai",
  "https://open.bigmodel.cn": "region.bigmodel",
  "https://api.minimax.io": "region.minimaxGlobal",
  "https://api.minimaxi.com": "region.minimaxChina",
};

/** 双区 Base URL 选项：按 URL 取词条，未知地址回退适配器原文。 */
export function regionName(option: { label: string; value: string }, t: Translate): string {
  const key = REGION_BY_URL[option.value];
  return key && t.has?.(key) ? t(key) : option.label;
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
