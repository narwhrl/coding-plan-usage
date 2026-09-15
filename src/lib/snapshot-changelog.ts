import { compactNumber } from "./format";
import type { HistorySnapshot, Window } from "./types";

export type WindowChangeKind = "changed" | "appeared" | "disappeared";
export type WindowChangeMetric = "percent" | "amount";

/** 一条窗口变化：身份字段留给 windowName，数值留给展示层做本地化。 */
export type WindowChange = {
  key: string;
  window: Pick<Window, "kind" | "label" | "minor" | "unit">;
  change: WindowChangeKind;
  metric: WindowChangeMetric;
  from: number | null;
  to: number | null;
  delta: number | null;
};

/** 一次采集里发生的全部窗口变化；最新事件在数组前部。 */
export type ChangeEvent = {
  snapshotId: number;
  fetchedAt: string;
  changes: WindowChange[];
};

type WindowMetric = {
  metric: WindowChangeMetric;
  value: number;
};

/** kind + label + unit：同 kind 的模型车道、多币种余额靠后两段区分。 */
export function windowKey(w: Pick<Window, "kind" | "label" | "unit">): string {
  return `${w.kind}\0${w.label ?? ""}\0${w.unit}`;
}

/** 主读数：百分比优先，与卡片/趋势图同一口径。 */
export function windowMetric(w: Window): WindowMetric | null {
  if (typeof w.remainingPct === "number" && Number.isFinite(w.remainingPct)) {
    return { metric: "percent", value: w.remainingPct };
  }
  if (typeof w.remaining === "number" && Number.isFinite(w.remaining)) {
    return { metric: "amount", value: w.remaining };
  }
  if (typeof w.used === "number" && Number.isFinite(w.used)) {
    return { metric: "amount", value: w.used };
  }
  return null;
}

/**
 * 按展示精度比较：百分比四舍五入到整数（与 windowPctText 默认一致），
 * 绝对量用 compactNumber，避免 60.4→60.4 或 12.400→12.4 这种噪声行。
 */
export function metricsEqual(a: WindowMetric, b: WindowMetric): boolean {
  if (a.metric !== b.metric) return false;
  if (a.metric === "percent") return Math.round(a.value) === Math.round(b.value);
  if (Math.abs(a.value - b.value) < 0.005) return true;
  return compactNumber(a.value) === compactNumber(b.value);
}

/** 带符号的紧凑数：正数显式 +，负数用减号，0 不带符号。 */
export function formatSigned(value: number): string {
  if (value > 0) return `+${compactNumber(value)}`;
  if (value < 0) return `−${compactNumber(Math.abs(value))}`;
  return compactNumber(value);
}

function identityOf(w: Window): Pick<Window, "kind" | "label" | "minor" | "unit"> {
  return { kind: w.kind, label: w.label, minor: w.minor, unit: w.unit };
}

/** 在旧窗口上取与新窗口同一口径的读数，口径对不上再退回它自己的主读数。 */
function metricOn(w: Window, metric: WindowChangeMetric): number | null {
  if (metric === "percent") {
    return typeof w.remainingPct === "number" && Number.isFinite(w.remainingPct)
      ? w.remainingPct
      : null;
  }
  if (typeof w.remaining === "number" && Number.isFinite(w.remaining)) return w.remaining;
  if (typeof w.used === "number" && Number.isFinite(w.used)) return w.used;
  return null;
}

function sortHistory(history: HistorySnapshot[]): HistorySnapshot[] {
  return history.slice().sort((a, b) => {
    const byTime = Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt);
    return Number.isFinite(byTime) && byTime !== 0 ? byTime : a.id - b.id;
  });
}

function diffWindows(prev: Window[], next: Window[]): WindowChange[] {
  const prevByKey = new Map(prev.map((w) => [windowKey(w), w]));
  const nextKeys = new Set<string>();
  const changes: WindowChange[] = [];

  for (const w of next) {
    const key = windowKey(w);
    nextKeys.add(key);
    const current = windowMetric(w);
    if (!current) continue;
    const older = prevByKey.get(key);
    if (!older) {
      changes.push({
        key,
        window: identityOf(w),
        change: "appeared",
        metric: current.metric,
        from: null,
        to: current.value,
        delta: null,
      });
      continue;
    }
    const previous = windowMetric(older);
    if (!previous) {
      changes.push({
        key,
        window: identityOf(w),
        change: "appeared",
        metric: current.metric,
        from: null,
        to: current.value,
        delta: null,
      });
      continue;
    }
    if (metricsEqual(previous, current)) continue;
    const from = metricOn(older, current.metric) ?? previous.value;
    changes.push({
      key,
      window: identityOf(w),
      change: "changed",
      metric: current.metric,
      from,
      to: current.value,
      delta: current.value - from,
    });
  }

  for (const w of prev) {
    const key = windowKey(w);
    if (nextKeys.has(key)) continue;
    const previous = windowMetric(w);
    if (!previous) continue;
    changes.push({
      key,
      window: identityOf(w),
      change: "disappeared",
      metric: previous.metric,
      from: previous.value,
      to: null,
      delta: null,
    });
  }

  return changes;
}

/**
 * 把升序快照压成变化日志：相邻两次采集之间没动过的窗口丢掉。
 * 第一条是基线，不单独成行。返回最新在前，给表格直接渲染。
 */
export function buildChangeLog(history: HistorySnapshot[] | null): ChangeEvent[] {
  const ordered = sortHistory(history ?? []);
  const events: ChangeEvent[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const prev = ordered[index - 1];
    const next = ordered[index];
    const changes = diffWindows(prev.windows ?? [], next.windows ?? []);
    if (changes.length === 0) continue;
    events.push({
      snapshotId: next.id,
      fetchedAt: next.fetchedAt,
      changes,
    });
  }
  events.reverse();
  return events;
}
