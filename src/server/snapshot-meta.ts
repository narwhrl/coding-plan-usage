/**
 * 快照 raw 列形状：{ meta: 适配器 meta, responses?: { url, status, body } }。
 * API 只回传 meta，responses 是排障切片，不进浏览器。
 */
export function adapterMetaFromRaw(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const meta = (parsed as { meta?: unknown }).meta;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
}

/** 详情页卡片用的 best-effort 字段：新一轮没采到时沿用上一张成功快照，避免整卡消失。 */
const CARRY_FORWARD_META_KEYS = ["tokenUsage", "modelUsage"] as const;

/**
 * 当前 meta 没写这些 key 时，从上一张成功快照 raw 补上。
 * 适配器显式写出 `tokenUsage: null`（账单成功但无消耗）时不覆盖。
 */
export function carryForwardAdapterMeta(
  current: Record<string, unknown> | undefined,
  previousRaw: string | null,
): Record<string, unknown> | undefined {
  const prev = adapterMetaFromRaw(previousRaw);
  if (!prev) return current;
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  let added = false;
  for (const key of CARRY_FORWARD_META_KEYS) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
    if (prev[key] != null) {
      merged[key] = prev[key];
      added = true;
    }
  }
  if (!added) return current;
  return merged;
}

/** 从近到远找第一条能用的 tokenUsage（详情页首次进入时 lastOk 可能刚好没采到账单）。 */
export function tokenUsageFromRecentRaw(rows: { raw: string | null }[]): unknown | undefined {
  for (const row of rows) {
    const tokenUsage = adapterMetaFromRaw(row.raw)?.tokenUsage;
    if (tokenUsage && typeof tokenUsage === "object" && !Array.isArray(tokenUsage)) return tokenUsage;
  }
  return undefined;
}
