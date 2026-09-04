import { createHmac } from "node:crypto";

/**
 * 出站告警：把一次采集结果收敛成一个电平，只在电平迁移时投递 Webhook。
 * 每轮都发会在 15 分钟间隔下变成刷屏，所以状态机是这个功能的主体。
 */

export type AlertLevel = "ok" | "low" | "error";
export type NotifyEvent = "quota_low" | "quota_recovered" | "poll_error" | "test";

/** 单次 5xx 抖动不打扰：连续失败达到这个次数才发 poll_error。 */
const ERROR_ALERT_MIN_FAILURES = 2;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * 单次采集结果 → 告警电平。
 * isAvailable 那一条是为了和 /api/accounts 的 warn 判定对齐（官方余额不足以继续调 API），
 * 否则界面亮黄灯而告警沉默。
 */
export function evaluateAlertLevel(input: {
  status: "ok" | "error";
  windows: { remainingPct?: number; minor?: boolean }[];
  warnThreshold: number;
  isAvailable?: boolean;
}): AlertLevel {
  if (input.status === "error") return "error";
  if (input.isAvailable === false) return "low";
  for (const window of input.windows) {
    if (window.minor) continue;
    if (typeof window.remainingPct !== "number") continue;
    if (window.remainingPct < input.warnThreshold) return "low";
  }
  return "ok";
}

function eventForLevel(level: AlertLevel): NotifyEvent | null {
  if (level === "error") return "poll_error";
  if (level === "low") return "quota_low";
  return "quota_recovered";
}

function allowed(event: NotifyEvent, events: { low: boolean; recovered: boolean; error: boolean }): boolean {
  if (event === "quota_low") return events.low;
  if (event === "quota_recovered") return events.recovered;
  if (event === "poll_error") return events.error;
  return true;
}

/**
 * 电平迁移 → 该不该发、发什么。null 表示不发。
 *
 * - 首次判定（prev=null）为正常时保持沉默：没人想在部署后立刻收到一条「已恢复」。
 * - 停留在同一异常电平只在超过最小间隔后重发，作为持续异常的定期提醒。
 * - 停留在正常电平永不发。
 */
export function decideNotifyEvent(input: {
  prev: AlertLevel | null;
  next: AlertLevel;
  lastNotifiedAt: string | null;
  minIntervalMinutes: number;
  consecutiveFailures: number;
  events: { low: boolean; recovered: boolean; error: boolean };
  now: Date;
}): NotifyEvent | null {
  if (input.next === "error" && input.consecutiveFailures < ERROR_ALERT_MIN_FAILURES) return null;

  let event: NotifyEvent | null;
  if (input.prev === input.next) {
    if (input.next === "ok") return null;
    const lastMs = input.lastNotifiedAt ? Date.parse(input.lastNotifiedAt) : Number.NaN;
    const elapsed = Number.isFinite(lastMs) ? input.now.getTime() - lastMs : Number.POSITIVE_INFINITY;
    if (elapsed < input.minIntervalMinutes * 60_000) return null;
    event = eventForLevel(input.next);
  } else if (input.prev === null && input.next === "ok") {
    return null;
  } else {
    event = eventForLevel(input.next);
  }

  if (!event) return null;
  return allowed(event, input.events) ? event : null;
}

export type NotifyPayload = {
  version: 1;
  event: NotifyEvent;
  firedAt: string;
  account: {
    id: string;
    label: string;
    providerId: string;
    providerName: string;
  } | null;
  level: AlertLevel;
  previousLevel: AlertLevel | null;
  threshold: number;
  window: {
    kind: string;
    label: string | null;
    remainingPct: number | null;
    remaining: number | null;
    total: number | null;
    unit: string | null;
    resetAt: string | null;
  } | null;
  error: string | null;
  consecutiveFailures: number;
};

/**
 * POST 一次 JSON。签名对象是实际发出的 body 字符串。
 * 任何异常都收敛成 { ok: false }：告警投递失败绝不能影响采集结果。
 * 日志里只允许出现状态码/错误信息，不得带 url、secret 或完整 payload。
 */
export async function dispatchWebhook(
  payload: NotifyPayload,
  endpoint: { url: string; secret: string },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-cpu-event": payload.event,
  };
  if (endpoint.secret) {
    headers["x-cpu-signature"] = `sha256=${createHmac("sha256", endpoint.secret).update(body).digest("hex")}`;
  }
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[notify] delivery failed:", response.status);
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[notify] delivery failed:", message);
    return { ok: false, error: message };
  }
}
