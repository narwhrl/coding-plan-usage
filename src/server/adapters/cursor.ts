import { isoOrNull, numberOrNull, pctWindow, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Cursor（非官方）。
 * GET https://cursor.com/api/usage-summary（Cookie: WorkosCursorSessionToken=<用户粘贴值>）。
 * POST https://cursor.com/api/dashboard/get-sand-usage-status 取 Grok Bot（best-effort）。
 * GET https://cursor.com/api/auth/me 取套餐/账号名（best-effort）。
 * 解析规范：token-monitor cursorProbe.js + limitCollector.js fetchCursorAccountLimits（MIT）。
 * Spending 页三栏：Cursor Models = autoPercentUsed，Other Models = apiPercentUsed，
 * Grok Bot = sand usagePercent。金额 used/limit 经常是 0/0 或已用满，不能当主窗口。
 */

const USAGE_URL = "https://cursor.com/api/usage-summary";
const AUTH_ME_URL = "https://cursor.com/api/auth/me";
const SAND_USAGE_URL = "https://cursor.com/api/dashboard/get-sand-usage-status";

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
    if (meRes?.ok) {
      const me = asRecord(await readJson(meRes));
      if (me) {
        meta.email = typeof me.email === "string" ? me.email : null;
        meta.name = typeof me.name === "string" ? me.name : null;
      }
    }
    if (typeof summary.membershipType === "string") meta.membershipType = summary.membershipType;

    return { windows, meta };
  },
};
