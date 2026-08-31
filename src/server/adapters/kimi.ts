import { numberOrNull, isoOrNull, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Kimi Code（官方 coding plan 端点）。
 * GET https://api.kimi.com/coding/v1/usages，Authorization: Bearer <api key>。
 * 解析规范：token-monitor kimiLimits.js（MIT）：
 * - 顶层 usage = 周配额（FEATURE_CODING）
 * - limits[] = 5 小时会话窗口（duration=300, timeUnit="TIME_UNIT_MINUTE"）
 * 别名键防御式匹配（used/limit/remaining/percent）。
 */

const USAGES_URL = "https://api.kimi.com/coding/v1/usages";

const DETAIL_USED_KEYS = ["used", "usedValue", "used_value", "usedAmount", "used_amount", "currentValue", "current_value", "consumed", "consumedValue", "consumed_value"];
const DETAIL_LIMIT_KEYS = ["limit", "limitValue", "limit_value", "total", "totalValue", "total_value", "quota", "quotaValue", "quota_value", "max", "maxValue", "max_value"];
const DETAIL_REMAINING_KEYS = ["remaining", "remainingValue", "remaining_value"];
const DETAIL_PERCENT_KEYS = ["percent", "percentage", "usedPercent", "used_percent", "usagePercentage", "usage_percentage"];
const DETAIL_RESET_KEYS = ["resetTime", "reset_time", "resetAt", "reset_at"];
const WINDOW_UNIT_KEYS = ["timeUnit", "time_unit", "unit", "windowUnit", "window_unit"];

function pickNumber(obj: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const value = numberOrNull(obj[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickRaw(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

/** used% / limit+remaining% / percentage% 三选一（kimiLimits.usedPercentFromDetail）。 */
function usedPercentFromDetail(detail: Record<string, unknown> | null | undefined): number | null {
  if (!detail || typeof detail !== "object") return null;
  const used = pickNumber(detail, DETAIL_USED_KEYS);
  const limit = pickNumber(detail, DETAIL_LIMIT_KEYS);
  if (used !== null && limit !== null && limit > 0) {
    return Math.max(0, Math.min(100, (used / limit) * 100));
  }
  const remaining = pickNumber(detail, DETAIL_REMAINING_KEYS);
  if (limit !== null && limit > 0 && remaining !== null) {
    return Math.max(0, Math.min(100, ((limit - remaining) / limit) * 100));
  }
  const percent = pickNumber(detail, DETAIL_PERCENT_KEYS);
  if (percent !== null) return Math.max(0, Math.min(100, percent));
  return null;
}

/** protobuf 枚举 timeUnit → 分钟（kimiLimits.kimiWindowMinutes）。 */
function windowMinutes(duration: unknown, timeUnit: unknown): number | null {
  const amount = numberOrNull(duration);
  if (amount === null || amount <= 0) return null;
  const unit = String(timeUnit ?? "").trim().toUpperCase();
  if (unit.includes("MIN")) return amount;
  if (unit.includes("HOUR")) return amount * 60;
  if (unit.includes("DAY")) return amount * 24 * 60;
  if (unit.includes("WEEK")) return amount * 7 * 24 * 60;
  if (unit.includes("MONTH")) return amount * 30 * 24 * 60;
  return null;
}

export const kimiAdapter: Adapter = {
  id: "kimi",
  name: "Kimi Coding",
  unit: "percent",
  fields: [{ key: "apiKey", label: "API Key", kind: "text", secret: true }],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Kimi: missing apiKey");
    const res = await ctx.fetchFn(USAGES_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      throw new Error(`Kimi usages HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const rawBody = (await res.json()) as Record<string, unknown>;
    const body = (rawBody?.data && typeof rawBody.data === "object" ? rawBody.data : rawBody) as Record<string, unknown>;

    const windows: Window[] = [];
    const seenKinds = new Set<string>();

    // 顶层 usage → 周配额（FEATURE_CODING）
    const usage = body?.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      const usedPct = usedPercentFromDetail(usage);
      if (usedPct !== null) {
        windows.push({
          kind: "weekly",
          label: "Weekly quota",
          unit: "percent",
          remainingPct: Math.max(0, Math.min(100, 100 - usedPct)),
          resetAt: isoOrNull(pickRaw(usage, DETAIL_RESET_KEYS)),
        });
        seenKinds.add("weekly");
      }
    }

    // limits[] → 会话/其它窗口
    const limits = Array.isArray(body?.limits) ? (body.limits as Record<string, unknown>[]) : [];
    for (const entry of limits) {
      const detail = ((entry?.detail ?? entry?.usage ?? entry?.quota) as Record<string, unknown>) ?? entry;
      const usedPct = usedPercentFromDetail(detail);
      if (usedPct === null) continue;
      const window = (entry?.window ?? entry?.period ?? entry?.rateLimit ?? entry?.timeWindow) as
        | Record<string, unknown>
        | undefined;
      const minutes = windowMinutes(window?.duration ?? window?.windowDuration ?? window?.size ?? window?.value, pickRaw(window, WINDOW_UNIT_KEYS));
      const kind = minutes !== null && minutes <= 6 * 60 ? "5h" : "weekly";
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      windows.push({
        kind,
        label: kind === "5h" ? "5-hour session" : "Weekly",
        unit: "percent",
        remainingPct: Math.max(0, Math.min(100, 100 - usedPct)),
        resetAt: isoOrNull(pickRaw(detail, DETAIL_RESET_KEYS) ?? pickRaw(window, DETAIL_RESET_KEYS)),
      });
    }

    if (windows.length === 0) throw new Error("Kimi: usages response has no usable windows");
    return { windows };
  },
};

