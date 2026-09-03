import { clampPercent, numberOrNull, isoOrNull, type Adapter, type AdapterResult } from "./types";

/**
 * Cursor（非官方）。
 * GET https://cursor.com/api/usage-summary（Cookie: WorkosCursorSessionToken=<用户粘贴值>）。
 * GET https://cursor.com/api/auth/me 取套餐/账号名（best-effort）。
 * 解析规范：token-monitor cursorProbe.js parseUsageSummary（MIT）。
 * 金额为美分；plan 无量时回退 overall，再回退 teamPooled。
 */

const USAGE_URL = "https://cursor.com/api/usage-summary";
const AUTH_ME_URL = "https://cursor.com/api/auth/me";

type Moneyish = { used?: unknown; limit?: unknown; remaining?: unknown } | undefined;

function centsToUsd(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value) / 100;
}

function windowFromMoney(source: Moneyish, kind: string, resetAt: string | null) {
  const used = numberOrNull(source?.used);
  const limit = numberOrNull(source?.limit);
  const remaining = numberOrNull(source?.remaining);
  const usedUsd = centsToUsd(used);
  const limitUsd = centsToUsd(limit);
  const remainingUsd = centsToUsd(remaining);
  const pct =
    used !== null && limit !== null && limit > 0
      ? clampPercent((used / limit) * 100)
      : remaining !== null && limit !== null && limit > 0
        ? clampPercent(((limit - remaining) / limit) * 100)
        : null;
  if (usedUsd === null && limitUsd === null && remainingUsd === null && pct === null) return null;
  return {
    kind,
    unit: "usd",
    ...(usedUsd !== null ? { used: usedUsd } : {}),
    ...(limitUsd !== null ? { total: limitUsd } : {}),
    ...(remainingUsd !== null ? { remaining: remainingUsd } : {}),
    ...(pct !== null ? { remainingPct: Math.max(0, Math.min(100, 100 - pct)) } : {}),
    resetAt,
  };
}

export const cursorAdapter: Adapter = {
  id: "cursor",
  name: "Cursor",
  unit: "usd",
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
    const headers = {
      Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      accept: "application/json",
    };

    const usageRes = await ctx.fetchFn(USAGE_URL, { headers });
    if (!usageRes.ok) {
      throw new Error(`Cursor usage-summary HTTP ${usageRes.status}: ${(await usageRes.text()).slice(0, 300)}`);
    }
    const summary = (await usageRes.json()) as {
      individualUsage?: {
        plan?: { used?: unknown; limit?: unknown; remaining?: unknown; totalPercentUsed?: unknown };
        overall?: { used?: unknown; limit?: unknown; remaining?: unknown };
      };
      teamUsage?: { pooled?: { used?: unknown; limit?: unknown; remaining?: unknown } };
      billingCycleEnd?: unknown;
      membershipType?: unknown;
    };

    const individual = summary?.individualUsage ?? {};
    const plan = individual.plan ?? {};
    const overall = individual.overall;
    const pooled = summary?.teamUsage?.pooled;
    const resetAt = isoOrNull(summary?.billingCycleEnd);

    let window = windowFromMoney(plan, "monthly", resetAt);
    if (!window) window = windowFromMoney(overall, "monthly", resetAt);
    if (!window) window = windowFromMoney(pooled, "monthly", resetAt);
    if (!window) {
      const planPct = clampPercent(numberOrNull((plan as { totalPercentUsed?: unknown }).totalPercentUsed));
      if (planPct !== null) {
        window = { kind: "monthly", unit: "usd", remainingPct: Math.max(0, Math.min(100, 100 - planPct)), resetAt };
      }
    }
    if (!window) throw new Error("Cursor: usage-summary has no usable quota numbers");

    const meta: Record<string, unknown> = {};
    try {
      const meRes = await ctx.fetchFn(AUTH_ME_URL, { headers });
      if (meRes.ok) {
        const me = (await meRes.json()) as { email?: unknown; name?: unknown };
        meta.email = typeof me.email === "string" ? me.email : null;
        meta.name = typeof me.name === "string" ? me.name : null;
      }
    } catch {
      /* best-effort */
    }
    if (typeof summary?.membershipType === "string") meta.membershipType = summary.membershipType;

    return { windows: [window], meta };
  },
};
