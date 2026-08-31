import { numberOrNull, type Adapter, type AdapterResult } from "./types";

/**
 * GLM Coding Plan（官方）。
 * 来源：zai-org/zai-coding-plugins 官方插件 query-usage.mjs。
 * - GET {base}/api/monitor/usage/quota/limit → data.limits[]
 *   TOKENS_LIMIT → 5 小时 token 窗口（percentage 为已用百分比）
 *   TIME_LIMIT   → 月度 MCP 窗口（percentage、currentValue=已用、usage=总量）
 * - GET {base}/api/monitor/usage/model-usage?startTime=..&endTime=..（yyyy-MM-dd HH:mm:ss URL 编码）
 *   窗口=昨天当前整点 → 今天当前整点末，汇总进 meta.modelUsage。
 * Authorization 头发原始 token（官方插件不带 Bearer；粘贴带前缀则剥离）。
 */

const BASE_URLS = [
  { label: "Z.ai (Global)", value: "https://api.z.ai" },
  { label: "BigModel (中国大陆)", value: "https://open.bigmodel.cn" },
];

/** yyyy-MM-dd HH:mm:ss（服务器本地时间，与官方插件一致）。 */
function formatDateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

type QuotaLimitItem = {
  type?: string;
  percentage?: unknown;
  currentValue?: unknown;
  usage?: unknown;
};

export const glmAdapter: Adapter = {
  id: "glm",
  name: "GLM Coding Plan",
  unit: "tokens",
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      kind: "text",
      secret: true,
      placeholder: "{apiKey}",
    },
  ],
  baseUrlOptions: BASE_URLS,
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) throw new Error("GLM: missing apiKey");
    const base = (ctx.config.baseUrl ?? BASE_URLS[0].value).replace(/\/+$/, "");
    const headers = {
      Authorization: apiKey,
      "Accept-Language": "en-US,en",
      "Content-Type": "application/json",
    };

    const limitRes = await ctx.fetchFn(`${base}/api/monitor/usage/quota/limit`, { headers });
    if (!limitRes.ok) {
      throw new Error(`GLM quota/limit HTTP ${limitRes.status}: ${(await limitRes.text()).slice(0, 300)}`);
    }
    const limitBody = (await limitRes.json()) as { data?: { limits?: QuotaLimitItem[] } };
    const limits = limitBody?.data?.limits ?? [];

    const windows = [];
    const meta: Record<string, unknown> = {};
    for (const item of limits) {
      if (item?.type === "TOKENS_LIMIT") {
        const pct = numberOrNull(item.percentage);
        if (pct !== null) {
          windows.push({
            kind: "5h",
            label: "Token usage (5h)",
            unit: "percent",
            remainingPct: Math.max(0, Math.min(100, 100 - pct)),
          });
        }
      } else if (item?.type === "TIME_LIMIT") {
        const pct = numberOrNull(item.percentage);
        const used = numberOrNull(item.currentValue);
        const total = numberOrNull(item.usage);
        if (pct !== null || (used !== null && total !== null)) {
          windows.push({
            kind: "monthly",
            label: "MCP usage (monthly)",
            unit: "requests",
            ...(used !== null ? { used } : {}),
            ...(total !== null ? { total } : {}),
            ...(pct !== null ? { remainingPct: Math.max(0, Math.min(100, 100 - pct)) } : {}),
          });
        }
      }
    }
    if (windows.length === 0) throw new Error("GLM: quota/limit response has no usable limits");

    // model-usage：昨天当前整点 → 今天当前整点末（失败不阻断主窗口）
    try {
      const now = ctx.now();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59, 999);
      const qs = `?startTime=${encodeURIComponent(formatDateTime(start))}&endTime=${encodeURIComponent(formatDateTime(end))}`;
      const modelRes = await ctx.fetchFn(`${base}/api/monitor/usage/model-usage${qs}`, { headers });
      if (modelRes.ok) {
        const modelBody = (await modelRes.json()) as { data?: unknown };
        meta.modelUsage = modelBody?.data ?? null;
      }
    } catch {
      /* best-effort */
    }

    return { windows, meta };
  },
};
