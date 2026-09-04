/**
 * 近期消耗速率与预计耗尽时刻。
 *
 * 入参用宽松形状：既接受 HistorySnapshot[]（windows: Window[]），也接受
 * server/spark.ts 里 parseWindows 的输出（Record<string, unknown> 交叉类型）。
 * 因此 kind/label/resetAt 声明为 unknown，读取时再逐个收窄。
 */
export type BurnSample = {
  fetchedAt: string;
  windows: { remainingPct?: number; minor?: boolean; kind?: unknown; label?: unknown; resetAt?: unknown }[];
};

export type BurnRate = {
  /** 每小时消耗的百分点；0 表示窗口内没有可观测的下降。 */
  pctPerHour: number;
  /** 最后一个样本的剩余百分比。 */
  currentPct: number;
  /** 参与计算的样本数。 */
  samples: number;
  /** 首末样本跨度（ms）。 */
  spanMs: number;
  /** 按当前速率耗尽的时刻（ISO UTC）；速率为 0 时 null。 */
  exhaustsAt: string | null;
  /** 预计耗尽早于该窗口重置 → true；无重置时间或不消耗 → null。 */
  beforeReset: boolean | null;
};

const DEFAULT_WINDOW_MS = 86_400_000;
const MIN_SAMPLES = 3;
const MIN_SPAN_MS = 3_600_000;
/** 剩余百分比回升超过这么多个百分点即视为重置/充值，而不是负消耗。 */
const RESET_EPSILON = 1;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 同一条车道的身份：kind + label。同 kind 多车道（模型额度）靠 label 区分。 */
function seriesKey(window: BurnSample["windows"][number]): string {
  return `${str(window.kind)}\u0000${str(window.label)}`;
}

/**
 * 按「相邻样本的下降量之和 / 有效时长」估算消耗速率。
 *
 * 不用线性回归：配额窗口会周期性重置，剩余百分比在重置点向上跳，
 * 回归会被跳变整体拉平甚至拉成负数。这里改为逐段累加，跳变段整段丢弃。
 * 样本不足、跨度过短或没有百分比车道时返回 null，由调用方决定占位。
 */
export function computeBurnRate(
  samples: BurnSample[],
  options: { windowMs?: number; now?: Date } = {},
): BurnRate | null {
  const now = options.now ?? new Date();
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const nowMs = now.getTime();
  const cutoff = nowMs - windowMs;

  const inWindow = samples
    .map((sample) => ({ sample, ts: Date.parse(sample.fetchedAt) }))
    .filter((entry) => Number.isFinite(entry.ts) && entry.ts <= nowMs && entry.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);
  if (inWindow.length === 0) return null;

  const last = inWindow[inWindow.length - 1].sample;
  let target: BurnSample["windows"][number] | null = null;
  for (const window of last.windows) {
    if (window.minor) continue;
    if (typeof window.remainingPct !== "number") continue;
    if (!target || (target.remainingPct as number) > window.remainingPct) target = window;
  }
  if (!target) return null;
  const targetKey = seriesKey(target);

  const points: { ts: number; pct: number }[] = [];
  for (const entry of inWindow) {
    const match = entry.sample.windows.find(
      (window) => seriesKey(window) === targetKey && typeof window.remainingPct === "number",
    );
    if (match) points.push({ ts: entry.ts, pct: match.remainingPct as number });
  }
  if (points.length < MIN_SAMPLES) return null;
  const spanMs = points[points.length - 1].ts - points[0].ts;
  if (spanMs < MIN_SPAN_MS) return null;

  let drop = 0;
  let elapsedMs = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const dt = current.ts - previous.ts;
    if (dt <= 0) continue;
    const delta = previous.pct - current.pct;
    // 回升 = 重置或充值：该段既不计消耗也不计时长，否则会把重置后的满额算成"没消耗"。
    if (delta < -RESET_EPSILON) continue;
    drop += Math.max(delta, 0);
    elapsedMs += dt;
  }
  if (elapsedMs < MIN_SPAN_MS) return null;

  const pctPerHour = drop / (elapsedMs / 3_600_000);
  const currentPct = points[points.length - 1].pct;
  const exhaustsInMs = pctPerHour > 0 ? (currentPct / pctPerHour) * 3_600_000 : null;
  const exhaustsAt = exhaustsInMs === null ? null : new Date(nowMs + exhaustsInMs).toISOString();

  const resetMs = Date.parse(str(target.resetAt));
  const beforeReset =
    exhaustsInMs !== null && Number.isFinite(resetMs) ? nowMs + exhaustsInMs < resetMs : null;

  return { pctPerHour, currentPct, samples: points.length, spanMs, exhaustsAt, beforeReset };
}
