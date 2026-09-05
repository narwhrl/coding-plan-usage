import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { getDb, migrate, _resetForTest } from "./index";
import { accounts } from "./schema";

const SQL_0000 = readFileSync(path.join(process.cwd(), "drizzle/0000_sturdy_slayback.sql"), "utf8");
const WHEN_0000 = 1788167400997;

describe("migrations", () => {
  let dir = "";
  const previousPath = process.env.SQLITE_PATH;

  afterEach(() => {
    _resetForTest();
    if (previousPath === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = previousPath;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("adds alert columns to an existing 0000 database without dropping rows", () => {
    dir = mkdtempSync(path.join(tmpdir(), "cpu-mig-"));
    const dbFile = path.join(dir, "app.db");
    process.env.SQLITE_PATH = dbFile;

    const sqlite = new Database(dbFile);
    for (const stmt of SQL_0000.split("--> statement-breakpoint")) {
      sqlite.exec(stmt);
    }
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      )
    `);
    sqlite
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(createHash("sha256").update(SQL_0000).digest("hex"), WHEN_0000);
    sqlite.exec(`
      INSERT INTO providers (id, kind, name, unit, sort_order, created_at)
      VALUES ('glm', 'builtin', 'GLM', 'tokens', 0, '2026-01-01T00:00:00.000Z');
      INSERT INTO accounts (id, provider_id, label, credentials_cipher, config, enabled, sort_order, created_at)
      VALUES ('acc-1', 'glm', 'pre-upgrade', 'cipher', '{}', 1, 0, '2026-01-01T00:00:00.000Z');
    `);
    sqlite.close();

    migrate();
    const account = getDb().select().from(accounts).where(eq(accounts.id, "acc-1")).get();
    expect(account?.label).toBe("pre-upgrade");
    expect(account?.consecutiveFailures).toBe(0);
    expect(account?.lastErrorAt).toBeNull();
    expect(account?.alertLevel).toBeNull();
    expect(account?.alertNotifiedAt).toBeNull();
  });
});
