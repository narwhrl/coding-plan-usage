import { eq } from "drizzle-orm";
import { redactProxySecrets } from "@/lib/proxy";
import { getDb } from "./db";
import { accounts, providers, snapshots } from "./db/schema";
import { getAdapter } from "./adapters/registry";
import { decryptStoredProxy, parseStoredConfig, type StoredAccountConfig } from "./account-config";
import { decryptSecret, encryptSecret } from "./crypto";
import { createAccountFetch } from "./proxy-fetch";
import { getNotifySettings, getSettings } from "./settings";
import {
  decideNotifyEvent,
  dispatchWebhook,
  evaluateAlertLevel,
  type AlertLevel,
  type NotifyPayload,
} from "./notify";
import type { Account, Provider } from "./db/schema";
import type { Window } from "./adapters/types";

/** 连续错误计数落在 accounts.consecutive_failures。达 3 → 退避 6h；成功清零；手动强刷不消费退避但仍按结果更新计数。 */
const FAILURE_BACKOFF_THRESHOLD = 3;
const FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

export function parseAccountConfig(account: Account): StoredAccountConfig {
  return parseStoredConfig(account.config);
}

export async function effectiveIntervalMinutes(account: Account): Promise<number> {
  const config = parseAccountConfig(account);
  if (typeof config.intervalMinutes === "number" && config.intervalMinutes > 0) {
    return config.intervalMinutes;
  }
  const settings = await getSettings();
  return settings.defaultIntervalMinutes;
}

/** 告警用：非 minor 车道里 remainingPct 最小的那条，随 payload 一起发出去。 */
function tightestForPayload(windows: Window[]): NotifyPayload["window"] {
  let best: Window | null = null;
  for (const window of windows) {
    if (window.minor) continue;
    if (typeof window.remainingPct !== "number") continue;
    if (!best || (best.remainingPct as number) > window.remainingPct) best = window;
  }
  if (!best) return null;
  return {
    kind: best.kind,
    label: best.label ?? null,
    remainingPct: best.remainingPct as number,
    remaining: best.remaining ?? null,
    total: best.total ?? null,
    unit: best.unit,
    resetAt: best.resetAt ?? null,
  };
}

/**
 * 判定告警电平并在迁移时投递 Webhook。
 *
 * alertLevel 无论投递成功与否都要写回，否则一次投递失败会让下一轮重复判定为「刚刚迁移」；
 * alertNotifiedAt 只在投递成功后写，最小重复间隔才是按「真的发出去过」计时。
 * 调用方必须把本函数包在 try/catch 里：告警失败不能影响采集结果。
 */
async function maybeNotify(args: {
  account: Account;
  provider: Provider;
  status: "ok" | "error";
  windows: Window[];
  isAvailable?: boolean;
  error: string | null;
  consecutiveFailures: number;
  nowIso: string;
}): Promise<void> {
  const notify = await getNotifySettings();
  if (!notify.enabled || !notify.url) return;

  const config = parseAccountConfig(args.account);
  const warnThreshold = config.warnPct ?? (await getSettings()).warnPct;
  const level = evaluateAlertLevel({
    status: args.status,
    windows: args.windows,
    warnThreshold,
    isAvailable: args.isAvailable,
  });
  const prev = (args.account.alertLevel ?? null) as AlertLevel | null;
  const now = new Date(args.nowIso);
  const event = decideNotifyEvent({
    prev,
    next: level,
    lastNotifiedAt: args.account.alertNotifiedAt,
    minIntervalMinutes: notify.minIntervalMinutes,
    consecutiveFailures: args.consecutiveFailures,
    events: notify.events,
    now,
  });

  const db = getDb();
  if (!event) {
    if (prev !== level) {
      db.update(accounts).set({ alertLevel: level }).where(eq(accounts.id, args.account.id)).run();
    }
    return;
  }

  const result = await dispatchWebhook(
    {
      version: 1,
      event,
      firedAt: args.nowIso,
      account: {
        id: args.account.id,
        label: args.account.label,
        providerId: args.provider.id,
        providerName: args.provider.name,
      },
      level,
      previousLevel: prev,
      threshold: warnThreshold,
      window: tightestForPayload(args.windows),
      error: args.error,
      consecutiveFailures: args.consecutiveFailures,
    },
    { url: notify.url, secret: notify.secret },
  );
  db.update(accounts)
    .set({ alertLevel: level, ...(result.ok ? { alertNotifiedAt: args.nowIso } : {}) })
    .where(eq(accounts.id, args.account.id))
    .run();
}

/**
 * 采集单账户：读账户 → 解密 → adapter.fetchUsage → 写快照 → 推进 nextFetchAt → 按电平迁移告警。
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
    const failedAt = new Date().toISOString();
    const failures = account.consecutiveFailures + 1;
    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: failedAt,
        status: "error",
        error: `credential decrypt failed: ${message}`,
      })
      .run();
    db.update(accounts)
      .set({
        nextFetchAt: Date.now() + FAILURE_BACKOFF_MS,
        consecutiveFailures: failures,
        lastErrorAt: failedAt,
      })
      .where(eq(accounts.id, accountId))
      .run();
    try {
      await maybeNotify({
        account,
        provider,
        status: "error",
        windows: [],
        error: `credential decrypt failed: ${message}`,
        consecutiveFailures: failures,
        nowIso: failedAt,
      });
    } catch {
      /* 告警失败不影响采集结果 */
    }
    throw error;
  }

  const config = parseAccountConfig(account);
  let proxy;
  try {
    proxy = decryptStoredProxy(config.proxyCipher);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    const failures = account.consecutiveFailures + 1;
    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: failedAt,
        status: "error",
        error: `proxy decrypt failed: ${message}`.slice(0, 2000),
      })
      .run();
    db.update(accounts)
      .set({
        nextFetchAt: Date.now() + FAILURE_BACKOFF_MS,
        consecutiveFailures: failures,
        lastErrorAt: failedAt,
      })
      .where(eq(accounts.id, accountId))
      .run();
    try {
      await maybeNotify({
        account,
        provider,
        status: "error",
        windows: [],
        error: `proxy decrypt failed: ${message}`.slice(0, 2000),
        consecutiveFailures: failures,
        nowIso: failedAt,
      });
    } catch {
      /* 告警失败不影响采集结果 */
    }
    throw error;
  }

  const { fetchFn, close } = createAccountFetch(proxy);
  const nowIso = new Date().toISOString();
  let rawResult: unknown = null;

  try {
    const result = await adapter.fetchUsage({
      credentials,
      config: { baseUrl: config.baseUrl },
      fetchFn: async (input, init) => {
        const response = await fetchFn(input, init);
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
    const interval = await effectiveIntervalMinutes(account);
    db.update(accounts)
      .set({ nextFetchAt: Date.now() + interval * 60_000, consecutiveFailures: 0 })
      .where(eq(accounts.id, accountId))
      .run();
    try {
      await maybeNotify({
        account,
        provider,
        status: "ok",
        windows: result.windows,
        isAvailable: result.meta?.isAvailable === false ? false : undefined,
        error: null,
        consecutiveFailures: 0,
        nowIso,
      });
    } catch {
      /* 告警失败不影响采集结果 */
    }
  } catch (error) {
    const message = redactProxySecrets(error instanceof Error ? error.message : String(error), proxy);
    db.insert(snapshots)
      .values({
        accountId,
        fetchedAt: nowIso,
        status: "error",
        error: message.slice(0, 2000),
        raw: rawResult ? JSON.stringify({ responses: rawResult }) : null,
      })
      .run();
    const failures = account.consecutiveFailures + 1;
    const interval = await effectiveIntervalMinutes(account);
    // 手动强刷不消费退避（仍按结果更新计数），调度间隔按常规 interval 推进
    const delay =
      options.manual || failures < FAILURE_BACKOFF_THRESHOLD ? interval * 60_000 : FAILURE_BACKOFF_MS;
    db.update(accounts)
      .set({ nextFetchAt: Date.now() + delay, consecutiveFailures: failures, lastErrorAt: nowIso })
      .where(eq(accounts.id, accountId))
      .run();
    try {
      await maybeNotify({
        account,
        provider,
        status: "error",
        windows: [],
        error: message.slice(0, 2000),
        consecutiveFailures: failures,
        nowIso,
      });
    } catch {
      /* 告警失败不影响采集结果：原始错误必须原样抛出 */
    }
    throw error;
  } finally {
    await close();
  }
}
