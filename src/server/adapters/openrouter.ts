import { numberOrNull, type Adapter, type AdapterResult } from "./types";

/**
 * OpenRouter（官方）：
 * - GET https://openrouter.ai/api/v1/key → {data:{usage, limit, limit_remaining, ...}}
 * - GET https://openrouter.ai/api/v1/credits → {data:{total_credits, total_usage}}
 */
export const openrouterAdapter: Adapter = {
  id: "openrouter",
  name: "OpenRouter",
  unit: "usd",
  billing: "api",
  fields: [{ key: "apiKey", label: "API Key (sk-or-...)", kind: "text", secret: true }],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const apiKey = (ctx.credentials.apiKey ?? "").trim();
    if (!apiKey) throw new Error("OpenRouter: missing apiKey");
    const headers = { Authorization: `Bearer ${apiKey}` };

    const keyRes = await ctx.fetchFn("https://openrouter.ai/api/v1/key", { headers });
    if (!keyRes.ok) {
      throw new Error(`OpenRouter key HTTP ${keyRes.status}: ${(await keyRes.text()).slice(0, 300)}`);
    }
    const keyBody = (await keyRes.json()) as {
      data?: { usage?: unknown; limit?: unknown; limit_remaining?: unknown };
    };
    const usage = numberOrNull(keyBody?.data?.usage);
    const limit = numberOrNull(keyBody?.data?.limit);
    const remaining = numberOrNull(keyBody?.data?.limit_remaining);

    const windows = [];
    let balanceAmount: number | undefined;
    if (limit !== null && (usage !== null || remaining !== null)) {
      const rem = remaining ?? (usage !== null ? limit - usage : null);
      windows.push({
        kind: "credits",
        unit: "usd",
        used: usage ?? undefined,
        total: limit,
        ...(rem !== null ? { remaining: rem, remainingPct: limit > 0 ? Math.max(0, Math.min(100, (rem / limit) * 100)) : undefined } : {}),
      });
      if (rem !== null) balanceAmount = rem;
    }

    // /credits 失败不阻断（/key 已足够）；成功则补全余额
    try {
      const creditsRes = await ctx.fetchFn("https://openrouter.ai/api/v1/credits", { headers });
      if (creditsRes.ok) {
        const creditsBody = (await creditsRes.json()) as {
          data?: { total_credits?: unknown; total_usage?: unknown };
        };
        const totalCredits = numberOrNull(creditsBody?.data?.total_credits);
        const totalUsage = numberOrNull(creditsBody?.data?.total_usage);
        if (totalCredits !== null && totalUsage !== null) {
          const rem = totalCredits - totalUsage;
          if (balanceAmount === undefined) {
            windows.push({
              kind: "lifetime",
              unit: "usd",
              used: totalUsage,
              total: totalCredits,
              remaining: rem,
              remainingPct: totalCredits > 0 ? Math.max(0, Math.min(100, (rem / totalCredits) * 100)) : undefined,
            });
            balanceAmount = rem;
          }
        }
      }
    } catch {
      /* best-effort */
    }

    if (windows.length === 0) throw new Error("OpenRouter: no usable key/credits data");
    return {
      windows,
      ...(balanceAmount !== undefined ? { balance: { amount: balanceAmount, currency: "USD" } } : {}),
    };
  },
};
