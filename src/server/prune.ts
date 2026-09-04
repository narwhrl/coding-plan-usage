import { and, eq, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { snapshots } from "./db/schema";

export type PruneResult = {
  deletedSnapshots: number;
  strippedRaw: number;
};

/**
 * 必须保留的快照 id：每账户的最新快照（卡片错误态读它）与最后一次成功快照
 * （lastOkSnapshot + 详情页 GLM/MiniMax 的 meta 都住在它的 raw 里）。
 * 这两条既不能删，也不能剥离 raw，否则界面会在清理后突然失去当前额度。
 */
function protectedSnapshotIds(db: ReturnType<typeof getDb>): Set<number> {
  const keep = new Set<number>();
  const latest = db
    .select({ id: sql<number>`max(${snapshots.id})` })
    .from(snapshots)
    .groupBy(snapshots.accountId)
    .all();
  for (const row of latest) keep.add(row.id);
  const latestOk = db
    .select({ id: sql<number>`max(${snapshots.id})` })
    .from(snapshots)
    .where(eq(snapshots.status, "ok"))
    .groupBy(snapshots.accountId)
    .all();
  for (const row of latestOk) keep.add(row.id);
  return keep;
}

function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * 快照留存清理：删除超期行，并清空更早那批的 raw 列。
 * retentionDays=0 表示永久保留（不删除）；rawRetentionDays=0 表示除受保护的两条以外全部剥离 raw。
 * fetchedAt 是 ISO UTC 字符串，字典序即时间序，可直接和 cutoff 比较（同 spark.ts）。
 */
export function pruneSnapshots(options: {
  retentionDays: number;
  rawRetentionDays: number;
  now?: Date;
}): PruneResult {
  const db = getDb();
  const now = options.now ?? new Date();
  const keep = protectedSnapshotIds(db);
  if (keep.size === 0) return { deletedSnapshots: 0, strippedRaw: 0 };
  const keepIds = [...keep];

  let deletedSnapshots = 0;
  if (options.retentionDays > 0) {
    deletedSnapshots = db
      .delete(snapshots)
      .where(
        and(
          lt(snapshots.fetchedAt, cutoffIso(now, options.retentionDays)),
          notInArray(snapshots.id, keepIds),
        ),
      )
      .returning({ id: snapshots.id })
      .all().length;
  }

  const strippedRaw = db
    .update(snapshots)
    .set({ raw: null })
    .where(
      and(
        isNotNull(snapshots.raw),
        lt(snapshots.fetchedAt, cutoffIso(now, options.rawRetentionDays)),
        notInArray(snapshots.id, keepIds),
      ),
    )
    .returning({ id: snapshots.id })
    .all().length;

  return { deletedSnapshots, strippedRaw };
}
