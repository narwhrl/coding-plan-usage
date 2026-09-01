/**
 * GLM `meta.modelUsage`（/api/monitor/usage/model-usage）的解析与聚合。
 * x_time 形如 "2026-09-01 01:00"（服务端查询窗口的本地时区）；全程字符串前缀切片，不做时区换算。
 */

export type ModelUsage = {
  /** 原样桶标签，"YYYY-MM-DD HH:mm" */
  xTime: string[];
  /** 每桶 token 用量（null/缺省按 0） */
  tokens: number[];
  /** 每桶调用次数（缺失则全 0） */
  calls: number[];
  /** totalUsage.totalTokensUsage，缺失则回退为 sum(tokens) */
  totalTokens: number;
  /** totalUsage.totalModelCallCount，缺失则回退为 sum(calls) */
  totalCalls: number;
  /** modelDataList 按服务端顺序；modelName 为空的条目跳过 */
  models: { name: string; totalTokens: number }[];
};

export type UsagePoint = { label: string; tokens: number; calls: number };

/** 数值清洗：null/undefined/NaN/负数 → 0。 */
function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Math.max(0, Number(value));
  }
  return 0;
}

function numArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(num) : [];
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** 解析快照 meta 里的 modelUsage；形状不符返回 null（详情页据此整卡隐藏）。 */
export function parseModelUsage(input: unknown): ModelUsage | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.x_time) || raw.x_time.length === 0) return null;
  if (!raw.x_time.every((value): value is string => typeof value === "string")) return null;
  if (!Array.isArray(raw.tokensUsage)) return null;

  const xTime = raw.x_time;
  const tokens = numArray(raw.tokensUsage);
  const calls = numArray(raw.modelCallCount);
  const n = Math.min(xTime.length, tokens.length);
  const fxTime = xTime.slice(0, n);
  const ftokens = tokens.slice(0, n);
  const fcalls = calls.slice(0, n).concat(Array(Math.max(0, n - calls.length)).fill(0));

  const totalUsage = (typeof raw.totalUsage === "object" && raw.totalUsage !== null ? raw.totalUsage : {}) as Record<
    string,
    unknown
  >;
  const declaredTokens = num(totalUsage.totalTokensUsage);
  const declaredCalls = num(totalUsage.totalModelCallCount);
  const hasDeclaredTokens = Object.prototype.hasOwnProperty.call(totalUsage, "totalTokensUsage");
  const hasDeclaredCalls = Object.prototype.hasOwnProperty.call(totalUsage, "totalModelCallCount");

  const models: ModelUsage["models"] = [];
  if (Array.isArray(raw.modelDataList)) {
    for (const item of raw.modelDataList) {
      if (typeof item !== "object" || item === null) continue;
      const m = item as Record<string, unknown>;
      if (typeof m.modelName !== "string" || m.modelName.trim() === "") continue;
      models.push({ name: m.modelName, totalTokens: num(m.totalTokens) });
    }
  }

  return {
    xTime: fxTime,
    tokens: ftokens,
    calls: fcalls,
    totalTokens: hasDeclaredTokens ? declaredTokens : sum(ftokens),
    totalCalls: hasDeclaredCalls ? declaredCalls : sum(fcalls),
    models,
  };
}

/** 近 7 天按天聚合：label = "MM-DD"，按 x_time 出现顺序分组求和。 */
export function dailySeries(u: ModelUsage): UsagePoint[] {
  const out: UsagePoint[] = [];
  const byDate = new Map<string, UsagePoint>();
  for (let i = 0; i < u.xTime.length; i++) {
    const date = u.xTime[i].slice(0, 10);
    if (date === "") continue;
    const label = date.slice(5, 10);
    let point = byDate.get(date);
    if (!point) {
      point = { label, tokens: 0, calls: 0 };
      byDate.set(date, point);
      out.push(point);
    }
    point.tokens += u.tokens[i] ?? 0;
    point.calls += u.calls[i] ?? 0;
  }
  return out;
}

/** 最近一天（date 前缀等于最后一个桶）的逐小时序列：label = "HH:mm"。 */
export function latestDaySeries(u: ModelUsage): UsagePoint[] {
  if (u.xTime.length === 0) return [];
  const lastDate = u.xTime[u.xTime.length - 1].slice(0, 10);
  const out: UsagePoint[] = [];
  for (let i = 0; i < u.xTime.length; i++) {
    if (u.xTime[i].slice(0, 10) !== lastDate) continue;
    out.push({ label: u.xTime[i].slice(11, 16), tokens: u.tokens[i] ?? 0, calls: u.calls[i] ?? 0 });
  }
  return out;
}

/** token 峰值小时：label = "MM-DD HH:mm"；空数据返回 null。 */
export function peakHour(u: ModelUsage): { tokens: number; label: string } | null {
  let best = -1;
  let bestIndex = -1;
  for (let i = 0; i < u.tokens.length; i++) {
    const v = u.tokens[i] ?? 0;
    if (v > best) {
      best = v;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || best <= 0) return null;
  return { tokens: best, label: u.xTime[bestIndex].slice(5, 16) };
}
