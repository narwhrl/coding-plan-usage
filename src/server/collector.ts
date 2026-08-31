import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { accounts, providers, snapshots } from "./db/schema";
import { getAdapter } from "./adapters/registry";
import { decryptSecret, encryptSecret } from "./crypto";
import { getSettings } from "./settings";
import type { Account } from "./db/schema";

/** 连续错误计数（内存）。达 3 → 退避 6h；成功清零；手动强刷不消费退避但仍按结果重置计数。 */
const consecutiveErrors = new Map<string, number>();
const FAILURE_BACKOFF_THRESHOLD = 3;
const FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

type AccountConfig = { intervalMinutes?: number; warnPct?: number; baseUrl?: string };

export function parseAccountConfig(account: Account): AccountConfig {
  try {
    const parsed = JSON.parse(account.config) as AccountConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function effectiveIntervalMinutes(account: Account): Promise<number> {
  const config = parseAccountConfig(account);
  if (typeof config.intervalMinutes === "number" && config.intervalMinutes > 0) {
    return config.intervalMinutes;
  }
  const settings = await getSettings();
  return settings.defaultIntervalMinutes;
}

/**
 * 采集单账户：读账户 → 解密 → adapter.fetchUsage → 写快照 → 推进 nextFetchAt。
 * 失败写 error 快照（message），保留最后一次成功快照（不删除）。
 */
export async function pollAccount(accountId: string, options: { manual?: boolean } = {}): Promise<void> {
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new Error(`pollAccount: account ${accountId} not found`);
  const provider = db.select().from(providers).where(eq(providers.id, account.providerId)).get();
  if (!provider) throw new Error(`pollAccount: provider ${account.providerId} not found`);
  const adapter = getAdapter(provider);
  if (!adapter) throw new Error(`pollAccount: no adapter for provider ${provider.id}`);

  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(decryptSecret(account.credentialsCipher)) as Record<string, string>;
  } catch (error) {
    // 解密失败也要落 error 快照（凭证损坏/换密钥），并推进 nextFetchAt 防打转
    const message = error instanceof Error ? error.message : String(error);
    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: new Date().toISOString(),
        status: "error",
        error: `credential decrypt failed: ${message}`,
      })
      .run();
    db.update(accounts).set({ nextFetchAt: Date.now() + FAILURE_BACKOFF_MS }).where(eq(accounts.id, accountId)).run();
    throw error;
  }

  const config = parseAccountConfig(account);
  const nowIso = new Date().toISOString();
  let rawResult: unknown = null;

  try {
    const result = await adapter.fetchUsage({
      credentials,
      config: { baseUrl: config.baseUrl },
      fetchFn: async (input, init) => {
        const response = await fetch(input, init);
        // raw 记录原始响应 JSON 便于排障（克隆读 body 不影响 adapter 自身读取）
        try {
          const clone = response.clone();
          const text = await clone.text();
          rawResult = { url: String(input), status: response.status, body: text.slice(0, 20_000) };
        } catch {
          /* ignore */
        }
        return response;
      },
      now: () => new Date(),
      onCredentialsRefreshed: (updated) => {
        try {
          db.update(accounts)
            .set({ credentialsCipher: encryptSecret(JSON.stringify(updated)) })
            .where(eq(accounts.id, accountId))
            .run();
        } catch {
          /* 失败不阻断当次结果展示 */
        }
      },
    });

    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: nowIso,
        status: "ok",
        error: null,
        windows: JSON.stringify(result.windows),
        balance: result.balance ? JSON.stringify(result.balance) : null,
        raw: JSON.stringify({ meta: result.meta ?? null, responses: rawResult }),
      })
      .run();
    consecutiveErrors.set(accountId, 0);
    const interval = await effectiveIntervalMinutes(account);
    db.update(accounts)
      .set({ nextFetchAt: Date.now() + interval * 60_000 })
      .where(eq(accounts.id, accountId))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: nowIso,
        status: "error",
        error: message.slice(0, 2000),
        raw: rawResult ? JSON.stringify({ responses: rawResult }) : null,
      })
      .run();
    const failures = (consecutiveErrors.get(accountId) ?? 0) + 1;
    consecutiveErrors.set(accountId, failures);
    const interval = await effectiveIntervalMinutes(account);
    // 手动强刷不消费退避（仍按结果更新计数），调度间隔按常规 interval 推进
    const delay =
      options.manual || failures < FAILURE_BACKOFF_THRESHOLD ? interval * 60_000 : FAILURE_BACKOFF_MS;
    db.update(accounts).set({ nextFetchAt: Date.now() + delay }).where(eq(accounts.id, accountId)).run();
    throw error;
  }
}

/** 测试用：清空连续错误计数。 */
export function _resetConsecutiveErrorsForTest(): void {
  consecutiveErrors.clear();
}
