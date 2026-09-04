import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, migrate, _resetForTest } from "./db";
import { bootstrapProviders } from "./bootstrap";
import { pollAccount } from "./collector";
import { accounts, providers, snapshots } from "./db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "./crypto";
import { DeclarativeSpecSchema } from "./adapters/declarative";

process.env.APP_ENCRYPTION_KEY = "collector-test-key";
process.env.SQLITE_PATH = ":memory:";

const SPEC = {
  baseUrl: "http://localhost:9898",
  method: "GET",
  path: "/",
  auth: { type: "bearer" },
  mapping: { total: "data.total", remaining: "data.remaining" },
  unit: "credits",
};

function makeAccount(overrides: Partial<typeof accounts.$inferInsert> = {}): string {
  const db = getDb();
  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      providerId: "custom-test",
      label: "Test Account",
      credentialsCipher: encryptSecret(JSON.stringify({ apiKey: "k" })),
      config: "{}",
      enabled: 1,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      ...overrides,
    })
    .run();
  return id;
}

beforeEach(() => {
  migrate();
  bootstrapProviders();
  const db = getDb();
  db.insert(providers)
    .values({
      id: "custom-test",
      kind: "custom",
      name: "Mock Custom",
      unit: "credits",
      declarativeSpec: JSON.stringify(DeclarativeSpecSchema.parse(SPEC)),
      sortOrder: 100,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({ target: providers.id, set: { declarativeSpec: JSON.stringify(SPEC) } })
    .run();
});

afterAll(() => {
  _resetForTest();
});

describe("collector", () => {
  it("writes an ok snapshot and advances nextFetchAt", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ data: { total: 100, remaining: 75 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn as typeof fetch;
    try {
      const id = makeAccount();
      await pollAccount(id);
      const db = getDb();
      const snap = db.select().from(snapshots).where(eq(snapshots.accountId, id)).all();
      expect(snap).toHaveLength(1);
      expect(snap[0].status).toBe("ok");
      const windows = JSON.parse(snap[0].windows!);
      expect(windows[0].remaining).toBe(75);
      expect(windows[0].total).toBe(100);
      expect(windows[0].remainingPct).toBe(75);
      const account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.nextFetchAt).toBeGreaterThan(Date.now());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("writes an error snapshot on failure and keeps last success", async () => {
    const originalFetch = globalThis.fetch;
    const id = makeAccount();
    // 先成功一次
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { total: 10, remaining: 5 } }), { status: 200 })) as typeof fetch;
    await pollAccount(id);
    // 再失败
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await expect(pollAccount(id)).rejects.toThrow(/HTTP 500/);
    globalThis.fetch = originalFetch;

    const db = getDb();
    const snaps = db.select().from(snapshots).where(eq(snapshots.accountId, id)).orderBy(snapshots.id).all();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].status).toBe("ok");
    expect(snaps[1].status).toBe("error");
    expect(snaps[1].error).toContain("500");
  });

  it("backs off 6h after 3 consecutive failures", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
    const id = makeAccount({ config: JSON.stringify({ intervalMinutes: 15 }) });
    const before = Date.now();
    try {
      await expect(pollAccount(id)).rejects.toThrow();
      await expect(pollAccount(id)).rejects.toThrow();
      const db = getDb();
      let account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.nextFetchAt!).toBeLessThan(before + 20 * 60_000); // 常规间隔
      await expect(pollAccount(id)).rejects.toThrow();
      account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.nextFetchAt!).toBeGreaterThan(before + 5 * 60 * 60_000); // 退避 6h
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("persists the failure counter and last error time", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
    const id = makeAccount();
    try {
      await expect(pollAccount(id)).rejects.toThrow();
      await expect(pollAccount(id)).rejects.toThrow();
      await expect(pollAccount(id)).rejects.toThrow();
      const db = getDb();
      let account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.consecutiveFailures).toBe(3);
      expect(account.lastErrorAt).toBeTruthy();
      const failedAt = account.lastErrorAt;

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { total: 1, remaining: 1 } }), { status: 200 })) as typeof fetch;
      await pollAccount(id);
      account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.consecutiveFailures).toBe(0);
      // 成功不清空最后失败时间：设置页仍要能显示「上次何时坏过」。
      expect(account.lastErrorAt).toBe(failedAt);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("backs off immediately when a restart left the counter at the threshold", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
    // 计数落库后，重启不再清零：残留 2 次时下一次失败就该直接进 6h 退避。
    const id = makeAccount({ config: JSON.stringify({ intervalMinutes: 15 }), consecutiveFailures: 2 });
    const before = Date.now();
    try {
      await expect(pollAccount(id)).rejects.toThrow();
      const db = getDb();
      const account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      expect(account.consecutiveFailures).toBe(3);
      expect(account.nextFetchAt!).toBeGreaterThan(before + 5 * 60 * 60_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("clears the failure counter after a success", async () => {
    const originalFetch = globalThis.fetch;
    const id = makeAccount({ config: JSON.stringify({ intervalMinutes: 15 }) });
    const before = Date.now();
    try {
      globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
      await expect(pollAccount(id)).rejects.toThrow();
      await expect(pollAccount(id)).rejects.toThrow();
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { total: 1, remaining: 1 } }), { status: 200 })) as typeof fetch;
      await pollAccount(id);
      globalThis.fetch = (async () => new Response("err", { status: 503 })) as typeof fetch;
      await expect(pollAccount(id)).rejects.toThrow();
      const db = getDb();
      const account = db.select().from(accounts).where(eq(accounts.id, id)).get()!;
      // 成功清零后单次失败应走常规间隔而非 6h 退避
      expect(account.nextFetchAt!).toBeLessThan(before + 20 * 60_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
