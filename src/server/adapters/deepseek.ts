import { numberOrNull, type Adapter, type AdapterResult } from "./types";

/**
 * DeepSeek（官方）：GET https://api.deepseek.com/user/balance，Bearer。
 * 返回 {is_available, balance_infos:[{total_balance, currency}]}。
 * 日消耗由相邻 ok 快照余额差分得出（collector 层），此处只报余额。
 */
export const deepseekAdapter: Adapter = {
  id: "deepseek",
  name: "DeepSeek",
  unit: "usd",
  fields: [{ key: "apiKey", label: "API Key", kind: "text", secret: true }],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").trim();
    if (!apiKey) throw new Error("DeepSeek: missing apiKey");
    const res = await ctx.fetchFn("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`DeepSeek balance HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { total_balance?: unknown; currency?: unknown }[];
    };
    const info = body?.balance_infos?.find((b) => numberOrNull(b?.total_balance) !== null);
    const amount = numberOrNull(info?.total_balance);
    if (amount === null) throw new Error("DeepSeek: no usable balance_infos in response");
    return {
      windows: [
        {
          kind: "balance",
          label: "Balance",
          unit: "usd",
          remaining: amount,
          total: amount,
          remainingPct: 100,
        },
      ],
      balance: {
        amount,
        currency: typeof info?.currency === "string" ? info.currency : undefined,
      },
      meta: { isAvailable: body?.is_available ?? null },
    };
  },
};
