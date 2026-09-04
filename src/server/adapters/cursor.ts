import { isoOrNull, numberOrNull, pctWindow, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Cursor（非官方）。
 * GET https://cursor.com/api/usage-summary（Cookie: WorkosCursorSessionToken=<用户粘贴值>）。
 * POST https://cursor.com/api/dashboard/get-sand-usage-status 取 Grok Bot（best-effort）。
 * GET https://cursor.com/api/auth/me 取套餐/账号名（best-effort）。
 * 用量明细（GLM 同款 meta.modelUsage，失败不阻断主窗口）：
 *   POST /api/dashboard/get-filtered-usage-events 按小时桶（近 7 个本地自然日）
 *   POST /api/dashboard/get-aggregated-usage-events 按模型汇总（有则覆盖事件聚合）
 * 解析规范：token-monitor cursorProbe.js + limitCollector.js fetchCursorAccountLimits（MIT）。
 * Spending 页三栏：Cursor Models = autoPercentUsed，Other Models = apiPercentUsed，
 * Grok Bot = sand usagePercent。金额 used/limit 经常是 0/0 或已用满，不能当主窗口。
 */

const USAGE_URL = "https://cursor.com/api/usage-summary";
const AUTH_ME_URL = "https://cursor.com/api/auth/me";
const SAND_USAGE_URL = "https://cursor.com/api/dashboard/get-sand-usage-status";
const EVENTS_URL = "https://cursor.com/api/dashboard/get-filtered-usage-events";
const AGGREGATED_URL = "https://cursor.com/api/dashboard/get-aggregated-usage-events";
const MODEL_USAGE_PAGE_SIZE = 100;
const MODEL_USAGE_MAX_PAGES = 50;

type Moneyish = { used?: unknown; limit?: unknown; remaining?: unknown } | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sessionHeaders(sessionToken: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Cookie: `WorkosCursorSessionToken=${sessionToken}`,
    accept: "application/json",
    Referer: "https://cursor.com/dashboard",
    ...extra,
  };
}

function centsToUsd(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value) / 100;
}

/** 金额窗只在 limit>0 时成立；0/0 会盖住百分比池，不能当可用窗口。 */
function windowFromMoney(source: Moneyish, kind: string, resetAt: string | null): Window | null {
  const used = numberOrNull(source?.used);
  const limit = numberOrNull(source?.limit);
  const remaining = numberOrNull(source?.remaining);
  if (limit === null || limit <= 0) return null;
  const usedUsd = centsToUsd(used);
  const limitUsd = centsToUsd(limit);
  const remainingUsd = centsToUsd(remaining);
  const usedPct =
    used !== null
      ? (used / limit) * 100
      : remaining !== null
        ? ((limit - remaining) / limit) * 100
        : null;
  const window = pctWindow(kind, undefined, "usd", usedPct, resetAt);
  if (!window && usedUsd === null && limitUsd === null && remainingUsd === null) return null;
  return {
    kind,
    unit: "usd",
    ...(usedUsd !== null ? { used: usedUsd } : {}),
    ...(limitUsd !== null ? { total: limitUsd } : {}),
    ...(remainingUsd !== null ? { remaining: remainingUsd } : {}),
    ...(window ? { remainingPct: window.remainingPct } : {}),
    resetAt,
  };
}

/** "You've used 42% of your included total usage" → 42。 */
function usedPercentFromMessage(message: unknown): number | null {
  if (typeof message !== "string" || !message.includes("%")) return null;
  const match = message.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? numberOrNull(match[1]) : null;
}

function parseGrokBot(json: unknown, fallbackReset: string | null): Window | null {
  const source = asRecord(json);
  if (!source || source.hasNonZeroIncludedLimit !== true) return null;
  const window = pctWindow("grok_bot", undefined, "percent", numberOrNull(source.usagePercent), isoOrNull(source.nextResetTimestampUtc) ?? fallbackReset);
  return window;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 本地小时桶，和 GLM x_time 一样："YYYY-MM-DD HH:00"。 */
function localHourLabel(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:00`;
}

function eventTokens(event: Record<string, unknown>): number {
  const usage = asRecord(event.tokenUsage) ?? event;
  return (
    (numberOrNull(usage.inputTokens) ?? 0) +
    (numberOrNull(usage.outputTokens) ?? 0) +
    (numberOrNull(usage.cacheWriteTokens) ?? 0) +
    (numberOrNull(usage.cacheReadTokens) ?? 0)
  );
}

function addModelTokens(target: Map<string, number>, name: unknown, tokens: number): void {
  const model = typeof name === "string" ? name.trim() : "";
  if (!model) return;
  target.set(model, (target.get(model) ?? 0) + tokens);
}

/** 看板用 usageEventsDisplay；官方 Admin API 同形字段是 usageEvents。 */
function usageEventsFrom(body: Record<string, unknown> | null): unknown[] {
  if (Array.isArray(body?.usageEventsDisplay)) return body.usageEventsDisplay;
  if (Array.isArray(body?.usageEvents)) return body.usageEvents;
  return [];
}

/** 近 7 个本地自然日（与 GLM model-usage 同一窗口），收成 UsageCard 能吃的 modelUsage。 */
async function fetchCursorModelUsage(
  fetchFn: typeof fetch,
  sessionToken: string,
  now: Date,
  userId?: number,
): Promise<Record<string, unknown> | null> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const headers = sessionHeaders(sessionToken, {
    "content-type": "application/json",
    Origin: "https://cursor.com",
  });
  const range: Record<string, unknown> = {
    teamId: 0,
    startDate: String(startMs),
    endDate: String(endMs),
  };
  if (userId !== undefined) range.userId = userId;

  const hours: string[] = [];
  for (let stamp = startMs; stamp <= endMs; stamp += 3_600_000) {
    hours.push(localHourLabel(new Date(stamp)));
  }
  const tokensByHour = new Map<string, number>();
  const callsByHour = new Map<string, number>();
  const tokensByModel = new Map<string, number>();
  let sawEvent = false;

  for (let page = 1; page <= MODEL_USAGE_MAX_PAGES; page++) {
    let body: Record<string, unknown> | null = null;
    try {
      const res = await fetchFn(EVENTS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...range, page, pageSize: MODEL_USAGE_PAGE_SIZE }),
      });
      if (!res.ok) break;
      body = asRecord(await readJson(res));
    } catch {
      break;
    }
    const events = usageEventsFrom(body);
    if (events.length === 0) break;
    sawEvent = true;
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const stamp = numberOrNull(rec.timestamp);
      if (stamp === null || stamp < startMs || stamp > endMs) continue;
      const hour = localHourLabel(new Date(stamp));
      const tokens = eventTokens(rec);
      tokensByHour.set(hour, (tokensByHour.get(hour) ?? 0) + tokens);
      callsByHour.set(hour, (callsByHour.get(hour) ?? 0) + 1);
      addModelTokens(tokensByModel, rec.model, tokens);
    }
    const total = numberOrNull(body?.totalUsageEventsCount);
    if (events.length < MODEL_USAGE_PAGE_SIZE) break;
    if (total !== null && page * MODEL_USAGE_PAGE_SIZE >= total) break;
  }

  try {
    const res = await fetchFn(AGGREGATED_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(range),
    });
    if (res.ok) {
      const agg = asRecord(await readJson(res));
      const rows = Array.isArray(agg?.aggregations) ? agg.aggregations : [];
      if (rows.length > 0) {
        tokensByModel.clear();
        for (const item of rows) {
          const rec = asRecord(item);
          if (!rec) continue;
          addModelTokens(
            tokensByModel,
            rec.modelIntent ?? rec.model,
            eventTokens(rec),
          );
        }
      }
    }
  } catch {
    /* 按模型汇总失败则保留事件聚合 */
  }

  if (!sawEvent && tokensByModel.size === 0) return null;

  const tokensUsage = hours.map((hour) => tokensByHour.get(hour) ?? 0);
  const modelCallCount = hours.map((hour) => callsByHour.get(hour) ?? 0);
  if (!sawEvent && tokensByModel.size > 0 && hours[0]) {
    tokensUsage[0] = [...tokensByModel.values()].reduce((sum, tokens) => sum + tokens, 0);
  }
  const totalTokensUsage = tokensUsage.reduce((sum, tokens) => sum + tokens, 0);
  const totalModelCallCount = modelCallCount.reduce((sum, calls) => sum + calls, 0);
  if (totalTokensUsage === 0 && totalModelCallCount === 0 && tokensByModel.size === 0) return null;

  const modelDataList = [...tokensByModel.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([modelName, totalTokens]) => ({ modelName, totalTokens }));

  return {
    x_time: hours,
    tokensUsage,
    modelCallCount,
    totalUsage: { totalTokensUsage, totalModelCallCount },
    modelDataList,
  };
}

export const cursorAdapter: Adapter = {
  id: "cursor",
  name: "Cursor",
  unit: "percent",
  fields: [
    {
      key: "sessionToken",
      label: "WorkosCursorSessionToken",
      kind: "text",
      secret: true,
      placeholder: "Value of WorkosCursorSessionToken from cookies",
    },
  ],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const sessionToken = (ctx.credentials.sessionToken ?? "").trim();
    if (!sessionToken) throw new Error("Cursor: missing session token");
    const headers = sessionHeaders(sessionToken);

    const [usageRes, meRes, grokRes] = await Promise.all([
      ctx.fetchFn(USAGE_URL, { headers }),
      ctx.fetchFn(AUTH_ME_URL, { headers }).catch(() => null),
      ctx.fetchFn(SAND_USAGE_URL, {
        method: "POST",
        headers: sessionHeaders(sessionToken, {
          "content-type": "application/json",
          Origin: "https://cursor.com",
        }),
        body: "{}",
      }).catch(() => null),
    ]);
    if (!usageRes.ok) {
      throw new Error(`Cursor usage-summary HTTP ${usageRes.status}: ${(await usageRes.text()).slice(0, 300)}`);
    }
    const summary = asRecord(await readJson(usageRes)) ?? {};
    const individual = asRecord(summary.individualUsage) ?? {};
    const plan = asRecord(individual.plan) ?? {};
    const overall = asRecord(individual.overall);
    const pooled = asRecord(asRecord(summary.teamUsage)?.pooled);
    const resetAt = isoOrNull(summary.billingCycleEnd);

    let autoUsed = numberOrNull(plan.autoPercentUsed);
    let apiUsed = numberOrNull(plan.apiPercentUsed);
    if (autoUsed === null) autoUsed = usedPercentFromMessage(summary.autoModelSelectedDisplayMessage);
    if (apiUsed === null) apiUsed = usedPercentFromMessage(summary.namedModelSelectedDisplayMessage);

    const windows: Window[] = [];
    const auto = pctWindow("cursor_models", undefined, "percent", autoUsed, resetAt);
    const other = pctWindow("other_models", undefined, "percent", apiUsed, resetAt);
    if (auto) windows.push(auto);
    if (other) windows.push(other);

    if (windows.length === 0) {
      const money = windowFromMoney(plan, "monthly", resetAt)
        ?? windowFromMoney(overall ?? undefined, "monthly", resetAt)
        ?? windowFromMoney(pooled ?? undefined, "monthly", resetAt);
      if (money) windows.push(money);
    }
    if (windows.length === 0) {
      const total = pctWindow("monthly", undefined, "percent", numberOrNull(plan.totalPercentUsed), resetAt);
      if (total) windows.push(total);
    }

    if (grokRes?.ok) {
      const grok = parseGrokBot(await readJson(grokRes), resetAt);
      if (grok) windows.push(grok);
    }

    if (windows.length === 0) throw new Error("Cursor: usage-summary has no usable quota numbers");

    const meta: Record<string, unknown> = {};
    let userId: number | undefined;
    if (meRes?.ok) {
      const me = asRecord(await readJson(meRes));
      if (me) {
        meta.email = typeof me.email === "string" ? me.email : null;
        meta.name = typeof me.name === "string" ? me.name : null;
        const id = numberOrNull(me.id);
        if (id !== null) userId = id;
      }
    }
    if (typeof summary.membershipType === "string") meta.membershipType = summary.membershipType;

    try {
      const modelUsage = await fetchCursorModelUsage(ctx.fetchFn, sessionToken, ctx.now(), userId);
      if (modelUsage) meta.modelUsage = modelUsage;
    } catch {
      /* best-effort */
    }

    return { windows, meta };
  },
};
