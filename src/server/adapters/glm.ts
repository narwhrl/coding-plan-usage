import { numberOrNull, type Adapter, type AdapterResult } from "./types";

/**
 * GLM Coding Plan（官方）。
 * 来源：zai-org/zai-coding-plugins 官方插件 query-usage.mjs。
 *   TOKENS_LIMIT：第一个 → 5h，第二个 → weekly；TIME_LIMIT → mcp（percentage 为已用百分比）
 * - GET {base}/api/monitor/usage/model-usage?startTime=..&endTime=..（yyyy-MM-dd HH:mm:ss URL 编码）
 *   窗口=近 7 个本地自然日（00:00:00 → 23:59:59.999），汇总进 meta.modelUsage。
 * Authorization 头发原始 token（官方插件不带 Bearer；粘贴带前缀则剥离）。
 */

const BASE_URLS = [
  { label: "Z.ai (Global)", value: "https://api.z.ai" },
  { label: "BigModel (China)", value: "https://open.bigmodel.cn" },
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
    let tokensLimitCount = 0;
    const meta: Record<string, unknown> = {};
    for (const item of limits) {
      if (item?.type === "TOKENS_LIMIT") {
        const pct = numberOrNull(item.percentage);
        const isFirst = tokensLimitCount === 0;
        tokensLimitCount++;
        if (pct !== null) {
          windows.push({
            kind: isFirst ? "5h" : "weekly",
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
            kind: "mcp",
            unit: "requests",
            ...(used !== null ? { used } : {}),
            ...(total !== null ? { total } : {}),
            ...(pct !== null ? { remainingPct: Math.max(0, Math.min(100, 100 - pct)) } : {}),
          });
        }
      }
    }
    if (windows.length === 0) throw new Error("GLM: quota/limit response has no usable limits");

    // model-usage：近 7 个本地自然日（社区插件 7 天窗口，失败不阻断主窗口）
    try {
      const now = ctx.now();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
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
