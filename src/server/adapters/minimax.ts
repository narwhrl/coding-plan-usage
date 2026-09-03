import { numberOrNull, isoOrNull, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * MiniMax Coding Plan（官方 token_plan 端点，双区）。
 * GET {base}/v1/token_plan/remains（base = api.minimax.io 全球 / api.minimaxi.com 大陆），
 * 失败回退 {base}/v1/api/openplatform/coding_plan/remains（旧端点）。
 * 解析规范：token-monitor minimaxLimits.js（MIT）：
 * - data.model_remains[] 解析全部行；model_name === 'general' 行产 5h/weekly 窗口，非 general 行作为 minor 车道
 * - current_interval_remaining_percent / current_weekly_remaining_percent（字符串，0-100 剩余）
 * - current_interval_total_count / current_weekly_total_count > 0 时回填 requests 计数（remaining = round(total × 剩余% / 100)）
 * - status==3 且 (percent 缺失或>=100) 为占位 lane，跳过
 * - end_time / weekly_end_time 为 epoch 毫秒重置时间
 * - GET {www}/account/amount 分页聚合 meta.tokenUsage（昨日/近7天/当月/按天桶），best-effort
 */

const REGION_URLS: { label: string; value: string }[] = [
  { label: "Global (api.minimax.io)", value: "https://api.minimax.io" },
  { label: "China (api.minimaxi.com)", value: "https://api.minimaxi.com" },
];

const REMAINS_PATHS = ["/v1/token_plan/remains", "/v1/api/openplatform/coding_plan/remains"];

function parseNumberOrNull(value: unknown): number | null {
  return numberOrNull(value);
}

function laneWindow(
  item: Record<string, unknown>,
  percentField: string,
  statusField: string,
  resetField: string,
  kind: string,
): Window | null {
  if (parseNumberOrNull(item[statusField]) === 3) {
    const pct = parseNumberOrNull(item[percentField]);
    if (pct === null || pct >= 100) return null; // 占位 lane
  }
  const remainPct = parseNumberOrNull(item[percentField]);
  if (remainPct === null) return null;
  return {
    kind,
    unit: "percent",
    remainingPct: Math.max(0, Math.min(100, remainPct)),
    resetAt: isoOrNull(item[resetField]),
  };
}

/** total 次数可用时把 percent 窗口升级为 requests 计数（remaining = round(total × 剩余% / 100)）。 */
function attachCounts(w: Window | null, row: Record<string, unknown>, totalField: string): Window | null {
  if (!w || w.remainingPct === undefined) return w;
  const total = parseNumberOrNull(row[totalField]);
  if (total === null || total <= 0) return w;
  return { ...w, unit: "requests", total, remaining: Math.round((total * w.remainingPct) / 100) };
}

/** 非 general 模型行 → 次要车道窗口（仅详情页展示）；形状异常返回 null 跳过该行。 */
function minorLane(row: Record<string, unknown>): Window | null {
  if (parseNumberOrNull(row.current_interval_status) === 3) {
    const pct0 = parseNumberOrNull(row.current_interval_remaining_percent);
    if (pct0 === null || pct0 >= 100) return null; // 占位 lane
  }
  const pct = parseNumberOrNull(row.current_interval_remaining_percent);
  if (pct === null) return null;
  const clamped = Math.max(0, Math.min(100, pct));
  const total = parseNumberOrNull(row.current_interval_total_count);
  const hasCounts = total !== null && total > 0;
  const w: Window = {
    kind: "daily",
    label: String(row.model_name ?? "").trim() || "model",
    unit: hasCounts ? "requests" : "percent",
    remainingPct: clamped,
    resetAt: isoOrNull(row.end_time),
    minor: true,
  };
  if (hasCounts) {
    w.total = total as number;
    w.remaining = Math.round(((total as number) * clamped) / 100);
  }
  return w;
}

/** 账单记录 → 昨日/近7天/当月 token 消耗 + 按天桶（best-effort，任何失败返回 null）。 */
async function fetchTokenUsage(
  fetchFn: typeof fetch,
  webBase: string,
  apiKey: string,
  now: Date,
): Promise<Record<string, unknown> | null> {
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weekAgoMs = now.getTime() - 7 * 86_400_000;
  const cutoffMs = Math.min(monthStartMs, weekAgoMs);
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStartMs = todayStartMs - 86_400_000;
  const stats = { lastDayTokens: 0, weekTokens: 0, monthTokens: 0 };
  const byDay = new Map<string, number>();
  for (let page = 1; page <= 100; page++) {
    let rows: Record<string, unknown>[];
    try {
      const res = await fetchFn(`${webBase}/account/amount?page=${page}&limit=100&aggregate=false`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) break;
      const body = (await res.json()) as { charge_records?: unknown };
      if (!Array.isArray(body?.charge_records)) break;
      rows = body.charge_records as Record<string, unknown>[];
    } catch {
      break;
    }
    if (rows.length === 0) break;
    for (const row of rows) {
      const sec = numberOrNull(row.created_at);
      const tokens = numberOrNull(row.consume_token);
      if (sec === null || tokens === null || sec <= 0) continue;
      const ms = sec * 1000;
      if (ms >= yesterdayStartMs && ms < todayStartMs) stats.lastDayTokens += tokens;
      if (ms >= weekAgoMs) stats.weekTokens += tokens;
      if (ms >= monthStartMs) stats.monthTokens += tokens;
      if (ms >= cutoffMs) {
        const d = new Date(ms);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        byDay.set(day, (byDay.get(day) ?? 0) + tokens);
      }
    }
    const oldestSec = numberOrNull(rows[rows.length - 1].created_at) ?? 0;
    if (rows.length < 100 || oldestSec * 1000 < cutoffMs) break;
  }
  if (stats.lastDayTokens === 0 && stats.weekTokens === 0 && stats.monthTokens === 0) return null;
  const days = [...byDay.entries()].map(([d, tokens]) => ({ d, tokens })).sort((a, b) => (a.d < b.d ? -1 : 1));
  return { ...stats, days };
}

export const minimaxAdapter: Adapter = {
  id: "minimax",
  name: "MiniMax Coding Plan",
  unit: "percent",
  fields: [{ key: "apiKey", label: "API Key", kind: "text", secret: true }],
  baseUrlOptions: REGION_URLS,
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").trim();
    if (!apiKey) throw new Error("MiniMax: missing apiKey");
    const bases = [ctx.config.baseUrl?.replace(/\/+$/, ""), ...REGION_URLS.map((r) => r.value)]
      .filter((b): b is string => typeof b === "string" && b.length > 0)
      .filter((b, i, arr) => arr.indexOf(b) === i);

    let lastError: Error | null = null;
    for (const base of bases) {
      for (const path of REMAINS_PATHS) {
        let res: Response;
        try {
          res = await ctx.fetchFn(`${base}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(`MiniMax remains HTTP ${res.status}: credentials rejected`);
        }
        if (!res.ok) {
          lastError = new Error(`MiniMax remains HTTP ${res.status} at ${base}${path}`);
          continue;
        }
        const body = (await res.json()) as {
          data?: { model_remains?: Record<string, unknown>[] };
          model_remains?: Record<string, unknown>[];
        };
        const rows = body?.data?.model_remains ?? body?.model_remains;
        if (!Array.isArray(rows)) {
          lastError = new Error(`MiniMax: no model_remains in response from ${base}${path}`);
          continue;
        }
        const general = rows.find((row) => row?.model_name === "general");
        if (!general) {
          lastError = new Error("MiniMax: no model_name='general' row");
          continue;
        }
        const session = attachCounts(
          laneWindow(general, "current_interval_remaining_percent", "current_interval_status", "end_time", "5h"),
          general,
          "current_interval_total_count",
        );
        const weekly = attachCounts(
          laneWindow(general, "current_weekly_remaining_percent", "current_weekly_status", "weekly_end_time", "weekly"),
          general,
          "current_weekly_total_count",
        );
        const generalWindows = [session, weekly].filter((w): w is Window => w !== null);
        if (generalWindows.length > 0) {
          const minorWindows = rows
            .filter((row) => row !== general)
            .map((row) => minorLane(row))
            .filter((w): w is Window => w !== null);
          const windows = [...generalWindows, ...minorWindows];
          const webBase = base === "https://api.minimax.io" ? "https://www.minimax.io" : "https://www.minimaxi.com";
          let tokenUsage: Record<string, unknown> | null = null;
          try {
            tokenUsage = await fetchTokenUsage(ctx.fetchFn, webBase, apiKey, ctx.now());
          } catch {
            /* best-effort：账单失败不影响额度快照 */
          }
          return { windows, meta: tokenUsage ? { tokenUsage } : undefined };
        }
        lastError = new Error("MiniMax: general row has no usable percents");
      }
    }
    throw lastError ?? new Error("MiniMax: all endpoints failed");
  },
};
