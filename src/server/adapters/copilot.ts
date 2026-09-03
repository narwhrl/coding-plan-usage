import { numberOrNull, isoOrNull, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * GitHub Copilot（非官方 internal API）。
 * GET https://api.github.com/copilot_internal/user + GET /user，Bearer token。
 * 解析规范：token-monitor copilotLimits.js（MIT）：
 * - quota_snapshots.{premium_interactions, chat}：{entitlement, remaining, percent_remaining, unlimited}
 * - 回退 monthly_quotas/limited_user_quotas 计数推导
 * - quota_reset_date（ISO 或 YYYY-MM-DD）为重置时间
 */

const USAGE_URL = "https://api.github.com/copilot_internal/user";
const USER_URL = "https://api.github.com/user";

type QuotaSnapshot = {
  entitlement: number;
  remaining: number;
  percentRemaining: number;
  hasPercentRemaining: boolean;
  unlimited: boolean;
};

function parseQuotaSnapshot(raw: Record<string, unknown> | null | undefined): QuotaSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const entitlement = numberOrNull(raw.entitlement) ?? 0;
  const remaining = numberOrNull(raw.remaining) ?? 0;
  const unlimited = raw.unlimited === true;
  let percentRemaining = 0;
  let hasPercentRemaining = false;
  const decodedPercent = numberOrNull(raw.percent_remaining ?? raw.percentRemaining);
  if (unlimited) {
    percentRemaining = 100;
    hasPercentRemaining = true;
  } else if (decodedPercent !== null) {
    percentRemaining = decodedPercent;
    hasPercentRemaining = true;
  } else if (numberOrNull(raw.entitlement) !== null && entitlement > 0 && numberOrNull(raw.remaining) !== null) {
    percentRemaining = (remaining / entitlement) * 100;
    hasPercentRemaining = true;
  }
  return { entitlement, remaining, percentRemaining, hasPercentRemaining, unlimited };
}

function isPlaceholder(s: QuotaSnapshot | null): boolean {
  if (!s) return true;
  if (s.unlimited) return false;
  return !s.hasPercentRemaining && s.entitlement === 0 && s.remaining === 0;
}

function usableSnapshot(raw: Record<string, unknown> | null | undefined): QuotaSnapshot | null {
  const snapshot = parseQuotaSnapshot(raw);
  if (!snapshot || isPlaceholder(snapshot) || !snapshot.hasPercentRemaining) return null;
  return snapshot;
}

function snapshotFromCounts(monthly: number | null, limited: number | null): QuotaSnapshot | null {
  if (monthly === null || limited === null) return null;
  const entitlement = Math.max(0, monthly);
  if (entitlement <= 0) return null;
  const remaining = Math.max(0, limited);
  return {
    entitlement,
    remaining,
    percentRemaining: Math.max(0, Math.min(100, (remaining / entitlement) * 100)),
    hasPercentRemaining: true,
    unlimited: false,
  };
}

function copilotWindow(snapshot: QuotaSnapshot | null, kind: string, resetAt: string | null): Window | null {
  if (!snapshot) return null;
  return {
    kind,
    unit: "requests",
    ...(snapshot.entitlement > 0 ? { total: snapshot.entitlement, used: Math.max(0, snapshot.entitlement - snapshot.remaining) } : {}),
    ...(snapshot.remaining > 0 || snapshot.entitlement > 0 ? { remaining: snapshot.remaining } : {}),
    remainingPct: Math.max(0, Math.min(100, snapshot.percentRemaining)),
    resetAt,
  };
}

function classifyDynamicQuotaKey(key: string): "chat" | "premium" | "other" {
  const name = key.toLowerCase();
  if (name.includes("chat")) return "chat";
  if (name.includes("premium") || name.includes("completion") || name.includes("code")) return "premium";
  return "other";
}

function parseQuotaResetDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const date = new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export const copilotAdapter: Adapter = {
  id: "copilot",
  name: "GitHub Copilot",
  unit: "requests",
  fields: [
    {
      key: "token",
      label: "GitHub Token (OAuth / PAT with Copilot)",
      kind: "text",
      secret: true,
    },
  ],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const token = (ctx.credentials.token ?? "").trim();
    if (!token) throw new Error("Copilot: missing token");
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
    } as Record<string, string>;

    const usageRes = await ctx.fetchFn(USAGE_URL, { headers });
    if (!usageRes.ok) {
      throw new Error(`Copilot usage HTTP ${usageRes.status}: ${(await usageRes.text()).slice(0, 300)}`);
    }
    const body = (await usageRes.json()) as Record<string, unknown>;

    const rawSnapshots = (body.quota_snapshots ?? body.quotaSnapshots) as Record<string, unknown> | undefined;
    let premium = usableSnapshot(rawSnapshots?.premium_interactions as Record<string, unknown>);
    let chat = usableSnapshot(rawSnapshots?.chat as Record<string, unknown>);
    if (!premium && !chat && rawSnapshots && typeof rawSnapshots === "object") {
      // 动态键回退
      let firstUsable: QuotaSnapshot | null = null;
      for (const [key, value] of Object.entries(rawSnapshots)) {
        const snapshot = usableSnapshot(value as Record<string, unknown>);
        if (!snapshot) continue;
        if (!firstUsable) firstUsable = snapshot;
        const kind = classifyDynamicQuotaKey(key);
        if (kind === "chat" && !chat) chat = snapshot;
        if (kind === "premium" && !premium) premium = snapshot;
      }
      if (!premium && !chat && firstUsable) chat = firstUsable;
    }

    // 计数回退
    if (!premium || !chat) {
      const monthly = (body.monthly_quotas ?? body.monthlyQuotas) as Record<string, unknown> | undefined;
      const limited = (body.limited_user_quotas ?? body.limitedUserQuotas) as Record<string, unknown> | undefined;
      const fallbackPremium = snapshotFromCounts(numberOrNull(monthly?.completions), numberOrNull(limited?.completions));
      const fallbackChat = snapshotFromCounts(numberOrNull(monthly?.chat), numberOrNull(limited?.chat));
      premium = premium ?? fallbackPremium;
      chat = chat ?? fallbackChat;
    }

    const resetAt = parseQuotaResetDate(body.quota_reset_date ?? body.quotaResetDate);
    const windows = [copilotWindow(premium, "premium", resetAt), copilotWindow(chat, "chat", resetAt)].filter(
      (w): w is Window => w !== null,
    );
    if (windows.length === 0) throw new Error("Copilot: usage response has no usable quota snapshots");

    const meta: Record<string, unknown> = {
      copilotPlan: typeof (body.copilot_plan ?? body.copilotPlan) === "string" ? (body.copilot_plan ?? body.copilotPlan) : "unknown",
    };
    try {
      const userRes = await ctx.fetchFn(USER_URL, { headers });
      if (userRes.ok) {
        const user = (await userRes.json()) as { login?: unknown; name?: unknown };
        meta.login = typeof user.login === "string" ? user.login : null;
        meta.name = typeof user.name === "string" ? user.name : null;
      }
    } catch {
      /* best-effort */
    }
    return { windows, meta };
  },
};
