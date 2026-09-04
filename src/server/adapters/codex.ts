import { isoOrNull, numberOrNull, pctWindow, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Codex / ChatGPT（非官方）。
 * 凭证=粘贴 ~/.codex/auth.json：{tokens:{access_token, refresh_token, account_id, id_token?}}
 * （account_id 缺失时从 id_token JWT claim chatgpt_account_id 解）。
 * 刷新：POST https://auth.openai.com/oauth/token，JSON body
 *   {client_id:"app_EMoamEEZ73f0CkXaXp7hrann", grant_type:"refresh_token", refresh_token}
 * 用量：GET https://chatgpt.com/backend-api/wham/usage，
 *   Authorization: Bearer <access_token> + chatgpt-account-id: <account_id>。
 * 响应是 snake_case（rate_limit.primary_window / reset_at）；顺带接受旧 camelCase。
 * 解析规范：token-monitor limitCollector.js normalizeCodexUsage* / mapCodexRateLimitsToProvider（MIT）。
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

type CodexWindowRaw = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstDefined(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function pickWindow(rateLimit: Record<string, unknown>, keys: string[]): CodexWindowRaw | undefined {
  const value = firstDefined(rateLimit, keys);
  return asRecord(value) ?? undefined;
}

/** token-monitor codexWindowKind：按时长归类；本项目 5 小时窗用 kind=5h（不是 session）。 */
function windowKindFromSource(source: CodexWindowRaw, fallback: string): string {
  const seconds = numberOrNull(firstDefined(source, ["limitWindowSeconds", "limit_window_seconds"]));
  const minutes =
    seconds !== null && seconds > 0
      ? seconds / 60
      : numberOrNull(
          firstDefined(source, ["windowDurationMins", "window_duration_mins", "windowMinutes", "window_minutes"]),
        );
  if (minutes === null || minutes <= 0) return fallback;
  if (minutes === 30 * 24 * 60) return "billing";
  if (minutes >= 7 * 24 * 60) return "weekly";
  if (minutes >= 24 * 60) return "daily";
  if (minutes <= 6 * 60) return "5h";
  return fallback;
}

function resetAtFromWindow(source: CodexWindowRaw, now: Date): string | null {
  const direct = isoOrNull(firstDefined(source, ["resetsAt", "resetAt", "reset_at", "resets_at"]));
  if (direct) return direct;
  const after = numberOrNull(firstDefined(source, ["resetAfterSeconds", "reset_after_seconds"]));
  if (after === null || after < 0) return null;
  return new Date(now.getTime() + after * 1000).toISOString();
}

function normalizeWindow(
  source: CodexWindowRaw | undefined,
  fallbackKind: string,
  now: Date,
  extra?: { label?: string; minor?: boolean },
): Window | null {
  if (!source) return null;
  const usedPct = numberOrNull(firstDefined(source, ["usedPercent", "used_percent"]));
  const window = pctWindow(windowKindFromSource(source, fallbackKind), extra?.label, "percent", usedPct, resetAtFromWindow(source, now));
  if (!window) return null;
  return extra?.minor ? { ...window, minor: true } : window;
}

function rateLimitObject(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function mergeRateLimit(...values: unknown[]): Record<string, unknown> {
  return Object.assign({}, ...values.map(rateLimitObject));
}

function officialWindows(rateLimit: Record<string, unknown>, now: Date): Window[] {
  const primary = normalizeWindow(pickWindow(rateLimit, ["primaryWindow", "primary_window", "primary"]), "5h", now);
  const secondary = normalizeWindow(
    pickWindow(rateLimit, ["secondaryWindow", "secondary_window", "secondary"]),
    "weekly",
    now,
  );
  return [primary, secondary].filter((w): w is Window => w !== null);
}

function additionalWindows(usage: Record<string, unknown>, now: Date, minor: boolean): Window[] {
  const raw = usage.additionalRateLimits ?? usage.additional_rate_limits;
  if (!Array.isArray(raw)) return [];
  const out: Window[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const limitId = String(firstDefined(rec, ["meteredFeature", "metered_feature"]) ?? "").trim();
    if (!limitId || limitId === "codex") continue;
    const label = String(firstDefined(rec, ["limitName", "limit_name"]) ?? "").trim() || limitId;
    const rateLimit = mergeRateLimit(rec.rateLimit, rec.rate_limit);
    const extra = { label, minor };
    const primary = normalizeWindow(pickWindow(rateLimit, ["primaryWindow", "primary_window", "primary"]), "5h", now, extra);
    const secondary = normalizeWindow(
      pickWindow(rateLimit, ["secondaryWindow", "secondary_window", "secondary"]),
      "weekly",
      now,
      extra,
    );
    if (primary) out.push(primary);
    if (secondary) out.push(secondary);
  }
  return out;
}

function unwrapUsage(json: unknown): Record<string, unknown> {
  const rec = asRecord(json);
  if (!rec) return {};
  if (rec.rateLimit || rec.rate_limit || rec.additionalRateLimits || rec.additional_rate_limits) return rec;
  const nested = asRecord(rec.data);
  return nested ?? rec;
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

    const usage = unwrapUsage(await fetchUsageWithRefresh());
    const official = officialWindows(mergeRateLimit(usage.rateLimit, usage.rate_limit), ctx.now());
    const extras = additionalWindows(usage, ctx.now(), official.length > 0);
    const windows = [...official, ...extras];
    if (windows.length === 0) throw new Error("Codex: wham/usage response has no usable windows");
    return {
      windows,
      meta: { planType: usage.planType ?? usage.plan_type ?? null },
    };
  },
};
