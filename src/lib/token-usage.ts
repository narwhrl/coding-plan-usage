/**
 * MiniMax `meta.tokenUsage`（{www}/account/amount 账单聚合）的解析。
 * 日桶 d 形如 "YYYY-MM-DD"（采集进程本地时区），全程原样字符串，不做时区换算。
 */

export type TokenUsage = {
  lastDayTokens: number;
  weekTokens: number;
  monthTokens: number;
  /** 本地日桶（YYYY-MM-DD），升序 */
  days: { d: string; tokens: number }[];
};

/** 数值清洗：有限数且 ≥ 0 → 原值，否则 null。 */
function stat(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** 解析快照 meta 里的 tokenUsage；形状不符返回 null（详情页据此整卡隐藏）。 */
export function parseTokenUsage(input: unknown): TokenUsage | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const lastDayTokens = stat(raw.lastDayTokens);
  const weekTokens = stat(raw.weekTokens);
  const monthTokens = stat(raw.monthTokens);
  if (lastDayTokens === null || weekTokens === null || monthTokens === null) return null;
  if (!Array.isArray(raw.days)) return null;

  const days: TokenUsage["days"] = [];
  for (const item of raw.days) {
    if (typeof item !== "object" || item === null) continue;
    const day = item as Record<string, unknown>;
    if (typeof day.d !== "string" || day.d.trim() === "") continue;
    const tokens = stat(day.tokens);
    if (tokens === null) continue;
    days.push({ d: day.d, tokens });
  }
  days.sort((a, b) => (a.d < b.d ? -1 : 1));

  return { lastDayTokens, weekTokens, monthTokens, days };
}
