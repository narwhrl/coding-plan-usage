import { clampPercent, numberOrNull, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Codex / ChatGPT（非官方）。
 * 凭证=粘贴 ~/.codex/auth.json：{tokens:{access_token, refresh_token, account_id, id_token?}}
 * （account_id 缺失时从 id_token JWT claim chatgpt_account_id 解）。
 * 刷新：POST https://auth.openai.com/oauth/token，JSON body
 *   {client_id:"app_EMoamEEZ73f0CkXaXp7hrann", grant_type:"refresh_token", refresh_token}
 * 用量：GET https://chatgpt.com/backend-api/wham/usage，
 *   Authorization: Bearer <access_token> + chatgpt-account-id: <account_id>。
 * 响应解析规范：token-monitor limitCollector.js codex* 函数（MIT）。
 */

const REFRESH_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

type CodexTokens = {
  access_token?: unknown;
  refresh_token?: unknown;
  account_id?: unknown;
  id_token?: unknown;
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return {};
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseAuthJson(raw: string): CodexTokens {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const tokens = (parsed?.tokens && typeof parsed.tokens === "object" ? parsed.tokens : parsed) as CodexTokens;
  if (!tokens || typeof tokens !== "object") throw new Error("Codex: auth.json has no tokens object");
  return { ...parsed, ...tokens } as CodexTokens;
}

function accountId(auth: CodexTokens): string {
  const direct = typeof auth.account_id === "string" ? auth.account_id.trim() : "";
  if (direct) return direct;
  const idToken = typeof auth.id_token === "string" ? auth.id_token : "";
  const claims = decodeJwtPayload(idToken);
  const nested = (claims["https://api.openai.com/auth"] ?? claims["https://api.openai.com/profile"] ?? {}) as
    | Record<string, unknown>
    | undefined;
  const claimed = typeof claims.chatgpt_account_id === "string" ? claims.chatgpt_account_id : "";
  const nestedClaimed = nested && typeof nested.chatgpt_account_id === "string" ? nested.chatgpt_account_id : "";
  const id = (claimed || nestedClaimed).trim();
  if (!id) throw new Error("Codex: no account_id and id_token carries no chatgpt_account_id claim — re-paste auth.json");
  return id;
}

type CodexWindowRaw = {
  used_percent?: unknown;
  usedPercent?: unknown;
  resets_at?: unknown;
  resetsAt?: unknown;
  resetAt?: unknown;
  limit_window_seconds?: unknown;
  limitWindowSeconds?: unknown;
};

function normalizeWindow(source: CodexWindowRaw | undefined, kind: string, label: string): Window | null {
  if (!source || typeof source !== "object") return null;
  const usedPct = clampPercent(numberOrNull(source.usedPercent ?? source.used_percent));
  if (usedPct === null) return null;
  const resetRaw = source.resetsAt ?? source.resetAt ?? source.resets_at;
  const resetMs = numberOrNull(resetRaw);
  const resetIso =
    typeof resetRaw === "string" && Number.isFinite(Date.parse(resetRaw))
      ? new Date(Date.parse(resetRaw)).toISOString()
      : resetMs !== null && resetMs > 1e9
        ? new Date(resetMs > 1e12 ? resetMs : resetMs * 1000).toISOString()
        : null;
  return {
    kind,
    label,
    unit: "percent",
    remainingPct: Math.max(0, Math.min(100, 100 - usedPct)),
    resetAt: resetIso,
  };
}

async function callUsage(
  fetchFn: typeof fetch,
  accessToken: string,
  chatgptAccountId: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetchFn(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "chatgpt-account-id": chatgptAccountId,
      accept: "application/json",
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
    const err = new Error(`Codex wham/usage HTTP ${res.status}: ${text.slice(0, 300)}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }
  return { status: res.status, json };
}

export const codexAdapter: Adapter = {
  id: "codex",
  name: "Codex / ChatGPT",
  unit: "percent",
  fields: [
    {
      key: "authJson",
      label: "auth.json (~/.codex/auth.json)",
      kind: "json",
      secret: true,
      placeholder: '{"tokens":{"access_token":"...","refresh_token":"...","account_id":"..."}}',
    },
  ],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const raw = ctx.credentials.authJson ?? "";
    if (!raw.trim()) throw new Error("Codex: missing auth.json");
    const auth = parseAuthJson(raw);
    const chatgptAccountId = accountId(auth);
    let accessToken = typeof auth.access_token === "string" ? auth.access_token : "";

    const fetchUsageWithRefresh = async (): Promise<unknown> => {
      if (!accessToken) await refresh();
      try {
        return (await callUsage(ctx.fetchFn, accessToken, chatgptAccountId)).json;
      } catch (error) {
        const status = (error as Error & { httpStatus?: number }).httpStatus;
        if (status !== 401 && status !== 403) throw error;
        await refresh();
        return (await callUsage(ctx.fetchFn, accessToken, chatgptAccountId)).json;
      }
    };

    async function refresh(): Promise<void> {
      const refreshTokenValue = typeof auth.refresh_token === "string" ? auth.refresh_token : "";
      if (!refreshTokenValue) throw new Error("Codex: no refresh_token — re-paste auth.json");
      const res = await ctx.fetchFn(REFRESH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: refreshTokenValue,
        }),
      });
      if (!res.ok) {
        throw new Error(`Codex oauth/token HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const json = (await res.json()) as { access_token?: unknown; refresh_token?: unknown; id_token?: unknown };
      accessToken = typeof json.access_token === "string" ? json.access_token : accessToken;
      if (typeof json.refresh_token === "string") auth.refresh_token = json.refresh_token;
      if (typeof json.id_token === "string") auth.id_token = json.id_token;
      auth.access_token = accessToken;
      // 写回账户凭证（失败不阻断当次结果展示）
      try {
        ctx.onCredentialsRefreshed?.({ authJson: JSON.stringify({ tokens: auth }) });
      } catch {
        /* ignore */
      }
    }

    const usage = (await fetchUsageWithRefresh()) as {
      rateLimit?: Record<string, unknown>;
      rate_limit?: Record<string, unknown>;
      planType?: unknown;
      plan_type?: unknown;
    };

    const rateLimit = { ...(usage?.rateLimit ?? {}), ...(usage?.rate_limit ?? {}) } as Record<string, unknown>;
    const primary = normalizeWindow(rateLimit.primaryWindow as CodexWindowRaw | undefined, "5h", "Primary (5h)");
    const secondary = normalizeWindow(rateLimit.secondaryWindow as CodexWindowRaw | undefined, "weekly", "Secondary (weekly)");
    const windows = [primary, secondary].filter((w): w is Window => w !== null);
    if (windows.length === 0) throw new Error("Codex: wham/usage response has no usable windows");
    return {
      windows,
      meta: { planType: usage?.planType ?? usage?.plan_type ?? null },
    };
  },
};
