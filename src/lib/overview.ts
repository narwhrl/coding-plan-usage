import type { AccountView, SnapshotView, Window } from "./types";

/** 快照中数值型 remainingPct 最小的窗口；无数值窗口返回 null。 */
export function tightestWindow(s: SnapshotView | null | undefined): Window | null {
  if (!s) return null;
  let best: Window | null = null;
  for (const w of s.windows) {
    if (w.minor) continue;
    const pct = w.remainingPct;
    if (typeof pct !== "number") continue;
    if (!best || (best.remainingPct as number) > pct) best = w;
  }
  return best;
}

/** 单账户窗口里未来最近的一次重置；全部已过期或无 resetAt 返回 null。 */
export function nextResetWindow(windows: Window[]): Window | null {
  const now = Date.now();
  let best: Window | null = null;
  let bestMs = Infinity;
  for (const w of windows) {
    if (w.minor) continue;
    const ms = w.resetAt ? Date.parse(w.resetAt) : Number.NaN;
    if (!Number.isFinite(ms) || ms <= now || ms >= bestMs) continue;
    bestMs = ms;
    best = w;
  }
  return best;
}

/**
 * 卡片/详情主窗口：有 remainingPct 时取最紧配额；否则退回第一条带 remaining 的预付费窗口。
 * 预付费 API（如 DeepSeek）没有 coding-plan 百分比，不能编一个 100%。
 */
export function heroWindow(s: SnapshotView | null | undefined): Window | null {
  const tightest = tightestWindow(s);
  if (tightest) return tightest;
  if (!s) return null;
  return s.windows.find((w) => !w.minor && typeof w.remaining === "number") ?? null;
}

/** 展示快照（lastOk ?? latest）全窗口最小数值 pct；无数值窗口返回 undefined。 */
export function accountMinPct(a: AccountView): number | undefined {
  const w = tightestWindow(a.lastOkSnapshot ?? a.latestSnapshot);
  return w?.remainingPct;
}

/**
 * 紧急排序：error(0) → warn(1) → 正常(2)，禁用(3) 沉底。
 * 同 rank 内按 accountMinPct ?? Infinity 升序，平手保持原下标（error 与 warn 并存时 error 赢）。
 */
export function sortAccountsByUrgency(accounts: AccountView[]): AccountView[] {
  const rank = (a: AccountView) =>
    !a.enabled ? 3 : a.latestSnapshot?.status === "error" ? 0 : a.warn ? 1 : 2;
  return accounts
    .map((account, index) => ({ account, index, rank: rank(account), minPct: accountMinPct(account) }))
    .sort((x, y) => {
      if (x.rank !== y.rank) return x.rank - y.rank;
      const diff = (x.minPct ?? Infinity) - (y.minPct ?? Infinity);
      if (diff !== 0) return diff;
      return x.index - y.index;
    })
    .map((e) => e.account);
}

export type OverviewKpis = {
  /** 账户总数，和网格里的卡片数一致。 */
  total: number;
  enabledTotal: number;
  disabledCount: number;
  errorCount: number;
  /** 非 error 的 enabled 账户中全局最小 pct 的窗口。 */
  tightest: { account: AccountView; window: Window } | null;
  /** enabled 账户展示窗口中未来最近的一次重置；error 账户不参与 tightest，但经展示快照参与 nextReset。 */
  nextReset: { account: AccountView; window: Window } | null;
  /** enabled 且非 error 的账户中预计最先耗尽的那个（at 为 ISO 时刻）。 */
  firstExhaust: { account: AccountView; at: string } | null;
};

/** KPI 汇总：额度类指标只看 enabled 账户，计数则给出总数与停用数。 */
export function overviewKpis(accounts: AccountView[]): OverviewKpis {
  const enabled = accounts.filter((a) => a.enabled);
  const kpis: OverviewKpis = {
    total: accounts.length,
    enabledTotal: enabled.length,
    disabledCount: accounts.length - enabled.length,
    errorCount: 0,
    tightest: null,
    nextReset: null,
    firstExhaust: null,
  };
  let tightestPct = Infinity;
  let nextResetMs = Infinity;
  let firstExhaustMs = Infinity;
  for (const account of enabled) {
    const errored = account.latestSnapshot?.status === "error";
    if (errored) kpis.errorCount += 1;
    const exhaustsAt = account.burn?.exhaustsAt;
    if (!errored && exhaustsAt) {
      const exhaustMs = Date.parse(exhaustsAt);
      if (Number.isFinite(exhaustMs) && exhaustMs < firstExhaustMs) {
        firstExhaustMs = exhaustMs;
        kpis.firstExhaust = { account, at: exhaustsAt };
      }
    }
    const display = account.lastOkSnapshot ?? account.latestSnapshot;
    for (const w of display?.windows ?? []) {
      if (w.minor) continue;
      const pct = w.remainingPct;
      if (!errored && typeof pct === "number" && pct < tightestPct) {
        tightestPct = pct;
        kpis.tightest = { account, window: w };
      }
      const resetMs = w.resetAt ? Date.parse(w.resetAt) : NaN;
      if (Number.isFinite(resetMs) && resetMs > Date.now() && resetMs < nextResetMs) {
        nextResetMs = resetMs;
        kpis.nextReset = { account, window: w };
      }
    }
  }
  return kpis;
}
