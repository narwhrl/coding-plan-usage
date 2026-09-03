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
  label: string,
): Window | null {
  if (parseNumberOrNull(item[statusField]) === 3) {
    const pct = parseNumberOrNull(item[percentField]);
    if (pct === null || pct >= 100) return null; // 占位 lane
  }
  const remainPct = parseNumberOrNull(item[percentField]);
  if (remainPct === null) return null;
  return {
    kind,
    label,
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
          laneWindow(general, "current_interval_remaining_percent", "current_interval_status", "end_time", "5h", "5h interval"),
          general,
          "current_interval_total_count",
        );
        const weekly = attachCounts(
          laneWindow(general, "current_weekly_remaining_percent", "current_weekly_status", "weekly_end_time", "weekly", "Weekly"),
          general,
          "current_weekly_total_count",
        );
        const generalWindows = [session, weekly].filter((w): w is Window => w !== null);
        if (generalWindows.length > 0) {
          const minorWindows = rows
            .filter((row) => row !== general)
            .map((row) => minorLane(row))
            .filter((w): w is Window => w !== null);
          return { windows: [...generalWindows, ...minorWindows] };
        }
        lastError = new Error("MiniMax: general row has no usable percents");
      }
    }
    throw lastError ?? new Error("MiniMax: all endpoints failed");
  },
};
