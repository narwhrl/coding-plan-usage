import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb, migrate, _resetForTest } from "./db";
import { bootstrapProviders } from "./bootstrap";
import { pruneSnapshots } from "./prune";
import { accounts, snapshots } from "./db/schema";
import { encryptSecret } from "./crypto";

process.env.APP_ENCRYPTION_KEY = "prune-test-key";
process.env.SQLITE_PATH = ":memory:";

const NOW = new Date("2026-09-04T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function makeAccount(): string {
  const db = getDb();
  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      providerId: "glm",
      label: "Prune Account",
      credentialsCipher: encryptSecret(JSON.stringify({ apiKey: "k" })),
      config: "{}",
      enabled: 1,
      sortOrder: 0,
      createdAt: NOW.toISOString(),
    })
    .run();
  return id;
}

function makeSnapshot(accountId: string, days: number, status: "ok" | "error" = "ok"): number {
  const db = getDb();
  const row = db
    .insert(snapshots)
    .values({
      accountId,
      fetchedAt: daysAgo(days),
      status,
      error: status === "error" ? "boom" : null,
      windows: status === "ok" ? JSON.stringify([{ kind: "weekly", unit: "tokens", remainingPct: 50 }]) : null,
      raw: JSON.stringify({ meta: null, responses: { body: "x" } }),
    })
    .returning({ id: snapshots.id })
    .get()!;
  return row.id;
}

beforeEach(() => {
  migrate();
  bootstrapProviders();
  const db = getDb();
  db.delete(snapshots).run();
  db.delete(accounts).run();
});

afterAll(() => {
  _resetForTest();
});

describe("pruneSnapshots", () => {
  it("deletes expired rows but keeps the newest and the last successful snapshot", () => {
    const id = makeAccount();
    const oldOk = makeSnapshot(id, 200);
    const oldError = makeSnapshot(id, 150, "error");
    const keptOk = makeSnapshot(id, 120);
    const newestError = makeSnapshot(id, 100, "error");

    const result = pruneSnapshots({ retentionDays: 90, rawRetentionDays: 7, now: NOW });

    expect(result.deletedSnapshots).toBe(2);
    const remaining = getDb()
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eq(snapshots.accountId, id))
      .orderBy(asc(snapshots.id))
      .all()
      .map((r) => r.id);
    // 最后一次成功快照（详情页 meta 的来源）与最新快照（错误态）都必须留下。
    expect(remaining).toEqual([keptOk, newestError]);
    expect(remaining).not.toContain(oldOk);
    expect(remaining).not.toContain(oldError);
  });

  it("keeps everything when retentionDays is 0", () => {
    const id = makeAccount();
    makeSnapshot(id, 500);
    makeSnapshot(id, 400);
    makeSnapshot(id, 1);

    const result = pruneSnapshots({ retentionDays: 0, rawRetentionDays: 365, now: NOW });

    expect(result.deletedSnapshots).toBe(0);
    expect(getDb().select().from(snapshots).all()).toHaveLength(3);
  });

  it("strips raw from expired snapshots but not from the protected ones", () => {
    const id = makeAccount();
    const staleOk = makeSnapshot(id, 30);
    const lastOk = makeSnapshot(id, 20);
    const newestError = makeSnapshot(id, 10, "error");

    const result = pruneSnapshots({ retentionDays: 0, rawRetentionDays: 7, now: NOW });

    expect(result.strippedRaw).toBe(1);
    const byId = new Map(
      getDb()
        .select({ id: snapshots.id, raw: snapshots.raw })
        .from(snapshots)
        .all()
        .map((r) => [r.id, r.raw]),
    );
    expect(byId.get(staleOk)).toBeNull();
    expect(byId.get(lastOk)).toBeTruthy();
    expect(byId.get(newestError)).toBeTruthy();
  });

  it("scopes protection per account", () => {
    const a = makeAccount();
    const b = makeAccount();
    const aOld = makeSnapshot(a, 200);
    const aKept = makeSnapshot(a, 150);
    const bOld = makeSnapshot(b, 300);
    const bKept = makeSnapshot(b, 250);

    pruneSnapshots({ retentionDays: 90, rawRetentionDays: 7, now: NOW });

    const remaining = getDb()
      .select({ id: snapshots.id })
      .from(snapshots)
      .all()
      .map((r) => r.id);
    expect(remaining.sort()).toEqual([aKept, bKept].sort());
    expect(remaining).not.toContain(aOld);
    expect(remaining).not.toContain(bOld);
  });

  it("is a no-op on an empty database", () => {
    expect(pruneSnapshots({ retentionDays: 1, rawRetentionDays: 1, now: NOW })).toEqual({
      deletedSnapshots: 0,
      strippedRaw: 0,
    });
  });
});
