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
