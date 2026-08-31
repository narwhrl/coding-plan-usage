import { and, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "./db";
import { accounts } from "./db/schema";
import { migrate } from "./db";
import { bootstrapProviders } from "./bootstrap";
import { pollAccount } from "./collector";

/**
 * 60s tick 调度器：查 enabled=1 且 nextFetchAt<=now（null 视为立即到期）的账户，
 * 经并发 3 的简单池跑 pollAccount。单账户错误不影响其它账户。
 */

const TICK_MS = 60_000;
const CONCURRENCY = 3;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // 上一轮未完成则跳过（池内任务可能超过 60s）
  running = true;
  try {
    const db = getDb();
    const now = Date.now();
    const due = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.enabled, 1), lte(accounts.nextFetchAt, now)))
      .all()
      .concat(db.select().from(accounts).where(and(eq(accounts.enabled, 1), isNull(accounts.nextFetchAt))).all());

    const queue = [...new Map(due.map((a) => [a.id, a])).values()];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const account = queue[cursor++];
        try {
          await pollAccount(account.id);
        } catch {
          /* pollAccount 已落 error 快照 */
        }
      }
    });
    await Promise.all(workers);
  } catch (error) {
    console.error("[scheduler] tick failed:", error);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (timer) return;
  migrate();
  bootstrapProviders();
  console.log("[scheduler] started: db migrated, providers bootstrapped, tick every 60s");
  void tick(); // 启动立即跑一轮
  timer = setInterval(() => void tick(), TICK_MS);
}

/** 测试/优雅停机用。 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
