import { parseModelUsage } from "@/lib/model-usage";
import { parseTokenUsage } from "@/lib/token-usage";

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

function hasOwn(meta: Record<string, unknown> | null, key: string): boolean {
  return !!meta && Object.prototype.hasOwnProperty.call(meta, key);
}

export type ExtraCardLookback = { token?: boolean; model?: boolean };

export function needsExtraCardLookback(
  lastOkMeta: Record<string, unknown> | null,
  want: ExtraCardLookback = { token: true, model: true },
): boolean {
  const needToken = !!want.token && !parseTokenUsage(lastOkMeta?.tokenUsage) && !hasOwn(lastOkMeta, "tokenUsage");
  const needModel = !!want.model && !parseModelUsage(lastOkMeta?.modelUsage) && !hasOwn(lastOkMeta, "modelUsage");
  return needToken || needModel;
}

/**
 * lastOk 缺 Token 消耗 / 用量卡时，从近到远找第一条能解析的 meta。
 * 适配器显式写了 null 的 key 不回看（表示这次采到了「没有」）。
 */
export function extraCardMetaFromRecentRaw(
  lastOkMeta: Record<string, unknown> | null,
  rows: { raw: string | null }[],
  want: ExtraCardLookback = { token: true, model: true },
): Record<string, unknown> | undefined {
  const needToken = !!want.token && !parseTokenUsage(lastOkMeta?.tokenUsage) && !hasOwn(lastOkMeta, "tokenUsage");
  const needModel = !!want.model && !parseModelUsage(lastOkMeta?.modelUsage) && !hasOwn(lastOkMeta, "modelUsage");
  if (!needToken && !needModel) return undefined;

  let tokenUsage: unknown | undefined;
  let modelUsage: unknown | undefined;
  for (const row of rows) {
    const meta = adapterMetaFromRaw(row.raw);
    if (needToken && tokenUsage === undefined && parseTokenUsage(meta?.tokenUsage)) {
      tokenUsage = meta!.tokenUsage;
    }
    if (needModel && modelUsage === undefined && parseModelUsage(meta?.modelUsage)) {
      modelUsage = meta!.modelUsage;
    }
    if ((!needToken || tokenUsage !== undefined) && (!needModel || modelUsage !== undefined)) break;
  }

  const extra: Record<string, unknown> = {};
  if (needToken && tokenUsage !== undefined) extra.tokenUsage = tokenUsage;
  if (needModel && modelUsage !== undefined) extra.modelUsage = modelUsage;
  return Object.keys(extra).length > 0 ? extra : undefined;
}
