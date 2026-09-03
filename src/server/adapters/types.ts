/** 适配器契约 —— 一切采集的接口点。新增提供商只动 src/server/adapters/。 */

/** 快照 windows JSON 元素统一形状（与 src/server/db/schema.ts 注释同步）。 */
export type Window = {
  /** '5h'|'weekly'|'monthly'|'credits'|'requests'|'balance'|'session'|'daily'|'billing'|string */
  kind: string;
  label?: string;
  used?: number;
  total?: number;
  remaining?: number;
  /** 0-100 剩余百分比 */
  remainingPct?: number;
  /** 'tokens'|'credits'|'requests'|'usd'|'percent'|string */
  unit: string;
  resetAt?: string | null;
  /** 次要车道：仅详情页展示，不参与概览 hero/warn/spark/KPI 聚合 */
  minor?: boolean;
};

/** 添加账户表单的动态字段描述。kind:'json' 渲染 textarea，存解析后的对象。 */
export type CredentialField = {
  key: string;
  label: string;
  kind: "text" | "json";
  secret: boolean;
  placeholder?: string;
};

export type AdapterResult = {
  windows: Window[];
  balance?: { amount: number; currency?: string };
  meta?: Record<string, unknown>;
};

export type AdapterContext = {
  credentials: Record<string, string>;
  config: { baseUrl?: string };
  fetchFn: typeof fetch;
  now: () => Date;
  /** OAuth 刷新得到新 tokens 后回写账户凭证（collector 注入；失败不阻断当次结果）。 */
  onCredentialsRefreshed?: (credentials: Record<string, string>) => void;
};

export type Adapter = {
  id: string;
  name: string;
  unit: string;
  fields: CredentialField[];
  baseUrlOptions?: { label: string; value: string }[];
  fetchUsage: (ctx: AdapterContext) => Promise<AdapterResult>;
};

/* ---------- 共享小工具（token-monitor 同款防御式解析，TS 化） ---------- */

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function clampPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const n = Number(value);
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

export function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // epoch 毫秒/秒兼容
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
    return ms !== null && ms > 0 ? new Date(ms).toISOString() : null;
  }
  if (typeof value !== "string") return null;
  const num = Number(value);
  if (Number.isFinite(num) && value.trim() !== "" && num > 1e9) {
    const ms = num > 1e12 ? num : num * 1000;
    return ms > 0 ? new Date(ms).toISOString() : null;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : null;
}

/** 剩余百分比窗口（token-monitor 的 usedPercent 形状 → 本项目 remainingPct 契约）。 */
export function pctWindow(
  kind: string,
  label: string,
  unit: string,
  usedPercent: number | null,
  resetAt?: string | null,
): Window | null {
  const used = clampPercent(usedPercent);
  if (used === null) return null;
  return {
    kind,
    label,
    unit,
    remainingPct: Math.max(0, Math.min(100, 100 - used)),
    resetAt: resetAt ?? null,
  };
}

export async function fetchJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; ok: boolean; json: unknown; text: string }> {
  const response = await fetchFn(url, init);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: response.status, ok: response.ok, json, text };
}

export function httpError(label: string, status: number, body: string): Error {
  const err = new Error(`${label} HTTP ${status}: ${body.slice(0, 300)}`);
  (err as Error & { httpStatus?: number }).httpStatus = status;
  return err;
}

/** 非 2xx 且有 JSON body 时抛错（带状态码）。 */
export function ensureOk(label: string, res: { status: number; ok: boolean; text: string }): void {
  if (!res.ok) throw httpError(label, res.status, res.text);
}
