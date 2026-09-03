import {
  fetchJson,
  httpError,
  numberOrNull,
  type Adapter,
  type AdapterResult,
  type Window,
} from "./types";

/**
 * DeepSeek API（官方预付费余额，不是 Coding Plan）。
 * 唯一账号级官方接口：GET https://api.deepseek.com/user/balance
 * 文档：https://api-docs.deepseek.com/api/get-user-balance
 *
 * 官方不提供 coding-plan 配额、重置窗口、账户级用量历史。
 * 计费按 token 从赠金/充值余额扣款（优先赠金）。此处只报余额组成，不编 remainingPct。
 */

const BALANCE_URL = "https://api.deepseek.com/user/balance";

type BalanceInfo = {
  currency?: unknown;
  total_balance?: unknown;
  granted_balance?: unknown;
  topped_up_balance?: unknown;
};

function currencyUnit(value: unknown): "cny" | "usd" {
  return typeof value === "string" && value.trim().toUpperCase() === "CNY" ? "cny" : "usd";
}

function currencyCode(unit: "cny" | "usd"): "CNY" | "USD" {
  return unit === "cny" ? "CNY" : "USD";
}

function moneyWindow(kind: string, unit: "cny" | "usd", remaining: number, currency?: string): Window {
  return currency ? { kind, unit, remaining, label: currency } : { kind, unit, remaining };
}

export const deepseekAdapter: Adapter = {
  id: "deepseek",
  name: "DeepSeek API",
  unit: "usd",
  billing: "api",
  displayCurrencies: ["CNY", "USD"],
  fields: [{ key: "apiKey", label: "API Key", kind: "text", secret: true, placeholder: "sk-..." }],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) throw new Error("DeepSeek: missing apiKey");

    const res = await fetchJson(ctx.fetchFn, BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw httpError("DeepSeek balance", res.status, res.text);

    const body = (res.json ?? {}) as {
      is_available?: boolean;
      balance_infos?: BalanceInfo[];
    };
    const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
    const usable = infos.filter((info) => numberOrNull(info.total_balance) !== null);
    if (usable.length === 0) throw new Error("DeepSeek: no usable balance_infos in response");

    const multi = usable.length > 1;
    const windows: Window[] = [];
    const balances: {
      currency: "CNY" | "USD";
      total: number;
      granted: number | null;
      toppedUp: number | null;
    }[] = [];

    for (const info of usable) {
      const unit = currencyUnit(info.currency);
      const code = currencyCode(unit);
      const total = numberOrNull(info.total_balance) as number;
      const granted = numberOrNull(info.granted_balance);
      const toppedUp = numberOrNull(info.topped_up_balance);
      windows.push(moneyWindow("balance", unit, total, multi ? code : undefined));
      if (granted !== null) {
        windows.push(moneyWindow("granted", unit, granted, multi ? code : undefined));
      }
      if (toppedUp !== null) {
        windows.push(moneyWindow("topped_up", unit, toppedUp, multi ? code : undefined));
      }
      balances.push({ currency: code, total, granted, toppedUp });
    }

    const primary = balances[0];
    return {
      windows,
      balance: { amount: primary.total, currency: primary.currency },
      meta: {
        isAvailable: typeof body.is_available === "boolean" ? body.is_available : null,
        balances,
      },
    };
  },
};
