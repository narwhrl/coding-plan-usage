import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;
let _sqlite: Database.Database | null = null;

export function dbPath(): string {
  return process.env.SQLITE_PATH ?? "./data/app.db";
}

/** 进程级单例；自动创建父目录，开 WAL + foreign_keys。 */
export function getDb(): Db {
  if (_db) return _db;
  const p = dbPath();
  const dir = path.dirname(p);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  _sqlite = new Database(p);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _sqlite.pragma("busy_timeout = 5000");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

/** 顺序应用 drizzle/*.sql 中未应用的迁移（drizzle journal 表记录）。幂等。 */
export function migrate(): void {
  const db = getDb();
  drizzleMigrate(db, { migrationsFolder: "drizzle" });
}

/** 测试用：重置单例（仅测试进程调用）。 */
export function _resetForTest(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
