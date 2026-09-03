import { clampPercent, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Claude（非官方）。
 * 凭证=粘贴 ~/.claude/.credentials.json：{claudeAiOauth:{accessToken, refreshToken, expiresAt, scopes}}
 * （根级同字段两种都接受）。
 * 刷新：POST https://console.anthropic.com/v1/oauth/token，URLSearchParams
 *   {grant_type:'refresh_token', refresh_token, client_id:'9d1c250a-e61b-44d9-88ed-5944d1962f5e'}
 * 用量：GET https://api.anthropic.com/api/oauth/usage（+ /api/oauth/profile best-effort），
 *   Authorization: Bearer <accessToken> + anthropic-beta: oauth-2025-04-20。
 * 窗口：five_hour 会话 + seven_day 周额度；usedPercent 别名 used_percent/utilization/percent。
 * 解析规范：token-monitor limitCollector.js mapClaudeUsageToProvider（MIT）。
 */

const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";

type ClaudeOauth = {
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresAt?: unknown;
};

function parseCredentials(raw: string): { oauth: ClaudeOauth; shape: "claudeAiOauth" | "root" } {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const nested =
    parsed?.claudeAiOauth && typeof parsed.claudeAiOauth === "object"
      ? (parsed.claudeAiOauth as ClaudeOauth)
      : (parsed?.oauth && typeof parsed.oauth === "object" ? (parsed.oauth as ClaudeOauth) : null);
  if (nested) return { oauth: nested, shape: "claudeAiOauth" };
  if (parsed && typeof parsed.accessToken === "string") return { oauth: parsed as ClaudeOauth, shape: "root" };
  throw new Error("Claude: credentials JSON has neither claudeAiOauth nor root-level accessToken");
}

function serializeBack(oauth: ClaudeOauth, shape: "claudeAiOauth" | "root"): string {
  if (shape === "claudeAiOauth") return JSON.stringify({ claudeAiOauth: oauth });
  return JSON.stringify(oauth);
}

type UsageWindowRaw = {
  used_percent?: unknown;
  usedPercent?: unknown;
  utilization?: unknown;
  percent?: unknown;
  resets_at?: unknown;
  resetsAt?: unknown;
};

function normalizeClaudeWindow(source: UsageWindowRaw | undefined, kind: string): Window | null {
  if (!source || typeof source !== "object") return null;
  const usedPct = clampPercent(
    source.used_percent !== undefined && source.used_percent !== null
      ? Number(source.used_percent)
      : source.usedPercent !== undefined && source.usedPercent !== null
        ? Number(source.usedPercent)
        : source.utilization !== undefined && source.utilization !== null
          ? Number(source.utilization)
          : source.percent !== undefined && source.percent !== null
            ? Number(source.percent)
            : null,
  );
  if (usedPct === null) return null;
  const resetRaw = source.resetsAt ?? source.resets_at;
  const resetIso =
    typeof resetRaw === "string" && Number.isFinite(Date.parse(resetRaw))
      ? new Date(Date.parse(resetRaw)).toISOString()
      : null;
  return {
    kind,
    unit: "percent",
    remainingPct: Math.max(0, Math.min(100, 100 - usedPct)),
    resetAt: resetIso,
  };
}

async function callUsageApi(
  fetchFn: typeof fetch,
  url: string,
  accessToken: string,
  betaHeader: boolean,
): Promise<{ status: number; text: string; json: unknown }> {
  const res = await fetchFn(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(betaHeader ? { "anthropic-beta": "oauth-2025-04-20" } : {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep */
  }
  if (!res.ok) {
    const err = new Error(`Claude ${url} HTTP ${res.status}: ${text.slice(0, 300)}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }
  return { status: res.status, text, json };
}

export const claudeAdapter: Adapter = {
  id: "claude",
  name: "Claude",
  unit: "percent",
  fields: [
    {
      key: "credentialsJson",
      label: ".credentials.json (~/.claude/.credentials.json)",
      kind: "json",
      secret: true,
      placeholder: '{"claudeAiOauth":{"accessToken":"...","refreshToken":"..."}}',
    },
  ],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const raw = ctx.credentials.credentialsJson ?? "";
    if (!raw.trim()) throw new Error("Claude: missing credentials JSON");
    const { oauth, shape } = parseCredentials(raw);
    let accessToken = typeof oauth.accessToken === "string" ? oauth.accessToken : "";
    const refreshTokenValue = typeof oauth.refreshToken === "string" ? oauth.refreshToken : "";
    const expiresAtMs = Number(oauth.expiresAt);
    const nowMs = ctx.now().getTime();
    const expired = Number.isFinite(expiresAtMs) && expiresAtMs > 0 && expiresAtMs - 60_000 <= nowMs;

    const refresh = async (): Promise<void> => {
      if (!refreshTokenValue) throw new Error("Claude: no refreshToken — re-paste .credentials.json");
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshTokenValue,
        client_id: CLIENT_ID,
      });
      const res = await ctx.fetchFn(TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: body.toString(),
      });
      if (!res.ok) {
        throw new Error(`Claude oauth/token HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        access_token?: unknown;
        refresh_token?: unknown;
        expires_in?: unknown;
      };
      accessToken = typeof json.access_token === "string" ? json.access_token : accessToken;
      oauth.accessToken = accessToken;
      if (typeof json.refresh_token === "string") oauth.refreshToken = json.refresh_token;
      const lifetime = Math.max(60, Number(json.expires_in) || 3600);
      oauth.expiresAt = String(nowMs + lifetime * 1000);
      try {
        ctx.onCredentialsRefreshed?.({ credentialsJson: serializeBack(oauth, shape) });
      } catch {
        /* ignore */
      }
    };

    const fetchUsage = async (): Promise<unknown> => {
      if (!accessToken || expired) await refresh();
      try {
        return (await callUsageApi(ctx.fetchFn, USAGE_URL, accessToken, true)).json;
      } catch (error) {
        const status = (error as Error & { httpStatus?: number }).httpStatus;
        if (status !== 401 && status !== 403) throw error;
        await refresh();
        return (await callUsageApi(ctx.fetchFn, USAGE_URL, accessToken, true)).json;
      }
    };

    const usage = (await fetchUsage()) as {
      five_hour?: UsageWindowRaw;
      fiveHour?: UsageWindowRaw;
      seven_day?: UsageWindowRaw;
      sevenDay?: UsageWindowRaw;
    };
    const session = normalizeClaudeWindow(usage?.five_hour ?? usage?.fiveHour, "5h");
    const weekly = normalizeClaudeWindow(usage?.seven_day ?? usage?.sevenDay, "weekly");
    const windows = [session, weekly].filter((w): w is Window => w !== null);
    if (windows.length === 0) throw new Error("Claude: usage response has no usable windows");

    const meta: Record<string, unknown> = {};
    try {
      const profile = (await callUsageApi(ctx.fetchFn, PROFILE_URL, accessToken, false)).json as {
        email?: unknown;
        account?: { email?: unknown; memberships?: unknown[] };
        organizations?: { uuid?: unknown; name?: unknown }[];
      };
      const email =
        typeof profile?.email === "string"
          ? profile.email
          : typeof profile?.account?.email === "string"
            ? profile.account.email
            : null;
      const org = Array.isArray(profile?.organizations) ? profile.organizations[0] : null;
      meta.email = email;
      meta.organization = org ? { name: typeof org.name === "string" ? org.name : null } : null;
    } catch {
      /* best-effort */
    }

    return { windows, meta };
  },
};
