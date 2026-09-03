import type { AccountView, DisplayCurrency, HistorySnapshot, SnapshotView, Window } from "./types";

export type { DisplayCurrency };

const MONEY_UNITS = new Set(["cny", "usd"]);

export function parseDisplayCurrency(value: unknown): DisplayCurrency | undefined {
  return value === "CNY" || value === "USD" ? value : undefined;
}

function unitOf(currency: DisplayCurrency): "cny" | "usd" {
  return currency === "CNY" ? "cny" : "usd";
}

function currencyOf(unit: string): DisplayCurrency | undefined {
  if (unit === "cny") return "CNY";
  if (unit === "usd") return "USD";
  return undefined;
}

/**
 * 多币种快照只留下偏好币种的窗口；快照里没有该币种时退回另一种。
 * 单币种或非金额窗口原样返回。
 */
export function windowsForCurrency(windows: Window[], preferred?: DisplayCurrency): Window[] {
  const money = windows.filter((w) => MONEY_UNITS.has(w.unit));
  if (money.length === 0) return windows;
  const present = new Set(money.map((w) => w.unit));
  if (present.size < 2) return windows;
  const want = unitOf(preferred ?? "CNY");
  const picked = present.has(want) ? want : want === "cny" ? "usd" : "cny";
  return windows.filter((w) => !MONEY_UNITS.has(w.unit) || w.unit === picked);
}

function applyCurrency<T extends { windows: Window[]; balance: SnapshotView["balance"] }>(
  snapshot: T,
  preferred?: DisplayCurrency,
): T {
  const windows = windowsForCurrency(snapshot.windows, preferred);
  const hero = windows.find((w) => w.kind === "balance" && typeof w.remaining === "number");
  const currency = hero ? currencyOf(hero.unit) : undefined;
  return {
    ...snapshot,
    windows,
    balance: hero
      ? { amount: hero.remaining as number, ...(currency ? { currency } : {}) }
      : snapshot.balance,
  };
}

export function snapshotForCurrency(
  snapshot: SnapshotView | null | undefined,
  preferred?: DisplayCurrency,
): SnapshotView | null {
  if (!snapshot) return null;
  return applyCurrency(snapshot, preferred);
}

export function historyForCurrency(
  history: HistorySnapshot[] | null,
  preferred?: DisplayCurrency,
): HistorySnapshot[] | null {
  if (!history) return null;
  return history.map((snap) => applyCurrency(snap, preferred));
}

/** 按账户设置的展示币种收窄快照，供卡片/详情共用。 */
export function accountForDisplay(account: AccountView): AccountView {
  const preferred = parseDisplayCurrency(account.config.displayCurrency);
  return {
    ...account,
    latestSnapshot: snapshotForCurrency(account.latestSnapshot, preferred),
    lastOkSnapshot: snapshotForCurrency(account.lastOkSnapshot, preferred),
  };
}
