#!/usr/bin/env node
/**
 * 演示种子：node scripts/seed-demo.mjs <db路径>
 *
 * 自动应用同一组 Drizzle 迁移；demo 数据在单个事务中幂等重建。
 * 数据形状严格遵守 src/server/db/schema.ts 的 windows JSON 契约。
 * credentialsCipher 用 "v1:seed" 占位；config.demo=true 使手动刷新跳过真实采集。
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const arg = process.argv[2];
if (!arg) {
  console.error("用法: node scripts/seed-demo.mjs <db路径>");
  process.exit(1);
}
const dbPath = resolve(arg);
if (!existsSync(dbPath)) mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
try {
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
migrate(drizzle(db), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });

const HOUR = 3_600_000;
const DAY = 86_400_000;
const nowMs = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dayStart = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());

const seed = db.transaction(() => {
db.prepare("DELETE FROM accounts WHERE id LIKE 'demo-%'").run();

// providers：真实 builtin id（registry.ts 顺序），已存在则跳过。
const insertProvider = db.prepare(
  "INSERT OR IGNORE INTO providers (id, kind, name, unit, sort_order, created_at) VALUES (?, 'builtin', ?, ?, ?, ?)",
);
insertProvider.run("claude", "Claude", "percent", 1, iso(nowMs));
insertProvider.run("glm", "GLM Coding Plan", "tokens", 2, iso(nowMs));
insertProvider.run("cursor", "Cursor", "usd", 3, iso(nowMs));
insertProvider.run("deepseek", "DeepSeek API", "usd", 4, iso(nowMs));

const insertAccount = db.prepare(
  "INSERT INTO accounts (id, provider_id, label, credentials_cipher, config, enabled, next_fetch_at, sort_order, created_at) VALUES (?, ?, ?, 'v1:seed', '{\"demo\":true}', ?, ?, ?, ?)",
);
const insertSnapStmt = db.prepare(
  "INSERT INTO snapshots (account_id, fetched_at, status, error, windows, balance, raw) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

/** raw 默认 null；只有需要在详情页展示 meta 的快照才传。 */
const insertSnap = (accountId, fetchedAt, status, error, windows, balance, raw = null) =>
  insertSnapStmt.run(accountId, fetchedAt, status, error, windows, balance, raw);

const addAccount = (id, providerId, label, enabled, sortOrder) =>
  insertAccount.run(id, providerId, label, enabled ? 1 : 0, nowMs + 365 * DAY, sortOrder, iso(nowMs));

/** 每日 UTC 2/8/14/20 点的历史时刻（未来时刻剔除），升序。 */
function snapshotTimes() {
  const times = [];
  for (let d = 6; d >= 0; d--) {
    for (const h of [2, 8, 14, 20]) {
      const ms = dayStart - d * DAY + h * HOUR;
      if (ms <= nowMs) times.push(ms);
    }
  }
  return times;
}

/** 每日一条 12:00 UTC（今日若未到 12 点则取 now），升序。 */
function dailyTimes() {
  const times = [];
  for (let d = 6; d >= 0; d--) {
    const ms = dayStart - d * DAY + 12 * HOUR;
    times.push(ms <= nowMs ? ms : nowMs);
  }
  return times;
}

// ── demo-claude：7 天 5h 窗 60→8 线性（每日 4 条），weekly 45%；最新 ok 5h resetAt=now+3h；label 主力 ──
addAccount("demo-claude", "claude", "主力", true, 1);
const claudePct = (idx) => Math.round((60 - (52 * idx) / 27) * 10) / 10; // idx 0..27 → 60 → 8
{
  let idx = 0;
  for (const ms of snapshotTimes()) {
    insertSnap(
      "demo-claude",
      iso(ms),
      "ok",
      null,
      JSON.stringify([
        { kind: "5h", unit: "percent", remainingPct: claudePct(idx), resetAt: iso(ms + 5 * HOUR) },
        { kind: "weekly", unit: "percent", remainingPct: 45, resetAt: iso(nowMs + 7 * DAY) },
      ]),
      JSON.stringify({ amount: 12.34, currency: "USD" }),
    );
    idx += 1;
  }
  insertSnap(
    "demo-claude",
    iso(nowMs),
    "ok",
    null,
    JSON.stringify([
      { kind: "5h", unit: "percent", remainingPct: 8, resetAt: iso(nowMs + 3 * HOUR) },
      { kind: "weekly", unit: "percent", remainingPct: 45, resetAt: iso(nowMs + 7 * DAY) },
    ]),
    JSON.stringify({ amount: 12.34, currency: "USD" }),
  );
}

/**
 * GLM meta.modelUsage 形状（/api/monitor/usage/model-usage 的 data）：
 * 近 7 个本地自然日、每日 24 个整点桶；夜间低谷 + 白天双峰，便于肉眼校验图表。
 */
function modelUsage() {
  const pad = (n) => String(n).padStart(2, "0");
  const xTime = [];
  const tokensUsage = [];
  const modelCallCount = [];
  const today = new Date(nowMs);
  for (let d = 6; d >= 0; d--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const stamp = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    for (let h = 0; h < 24; h++) {
      xTime.push(`${stamp} ${pad(h)}:00`);
      // 10 点与 16 点双峰，深夜近零；乘上按天递增的负载系数。
      const shape = Math.exp(-((h - 10) ** 2) / 8) + 0.82 * Math.exp(-((h - 16) ** 2) / 10);
      const load = 0.6 + 0.07 * (6 - d);
      const tokens = Math.round(shape * load * 240_000);
      tokensUsage.push(tokens);
      modelCallCount.push(Math.round(tokens / 3200));
    }
  }
  const totalTokens = tokensUsage.reduce((a, b) => a + b, 0);
  return {
    x_time: xTime,
    tokensUsage,
    modelCallCount,
    totalUsage: {
      totalTokensUsage: totalTokens,
      totalModelCallCount: modelCallCount.reduce((a, b) => a + b, 0),
    },
    modelDataList: [
      { modelName: "glm-4.6", totalTokens: Math.round(totalTokens * 0.62) },
      { modelName: "glm-4.5-air", totalTokens: Math.round(totalTokens * 0.27) },
      { modelName: "glm-4.5-flash", totalTokens: Math.round(totalTokens * 0.11) },
    ],
  };
}

// ── demo-glm：7 天平稳 ~70（5h 70 / weekly 72），weekly resetAt=now+2d；label 备用 ──
// 最新一条带 meta.modelUsage，用于详情页的模型用量面板。
addAccount("demo-glm", "glm", "备用", true, 2);
{
  const times = dailyTimes();
  for (const [i, ms] of times.entries()) {
    const isLatest = i === times.length - 1;
    insertSnap(
      "demo-glm",
      iso(ms),
      "ok",
      null,
      JSON.stringify([
        { kind: "5h", unit: "percent", remainingPct: 70, resetAt: iso(ms + 5 * HOUR) },
        { kind: "weekly", unit: "percent", remainingPct: 72, resetAt: iso(nowMs + 2 * DAY) },
      ]),
      null,
      isLatest ? JSON.stringify({ meta: { modelUsage: modelUsage() }, responses: null }) : null,
    );
  }
}

// ── demo-cursor：7 天 ok ~50%，最后一条 error；label 备用额度 ──
addAccount("demo-cursor", "cursor", "备用额度", true, 3);
{
  const pcts = [52, 51, 50, 49, 50, 48, 47];
  for (const [i, ms] of dailyTimes().entries()) {
    const remaining = Math.round(20 * (pcts[i] / 100) * 100) / 100;
    insertSnap(
      "demo-cursor",
      iso(ms),
      "ok",
      null,
      JSON.stringify([
        { kind: "balance", unit: "usd", used: 20 - remaining, total: 20, remaining, remainingPct: pcts[i], resetAt: iso(nowMs + HOUR) },
      ]),
      null,
    );
  }
  insertSnap("demo-cursor", iso(nowMs), "error", "seed error", null, null);
}

// ── demo-deepseek：停用，官方预付费余额（无 coding-plan 百分比）──
addAccount("demo-deepseek", "deepseek", "停用示例", false, 4);
{
  const amounts = [18.2, 16.8, 15.1, 14.0, 13.3, 12.9, 12.4];
  for (const [i, ms] of dailyTimes().entries()) {
    const remaining = amounts[i];
    insertSnap(
      "demo-deepseek",
      iso(ms),
      "ok",
      null,
      JSON.stringify([
        { kind: "balance", unit: "cny", remaining },
        { kind: "granted", unit: "cny", remaining: 0 },
        { kind: "topped_up", unit: "cny", remaining },
      ]),
      JSON.stringify({ amount: remaining, currency: "CNY" }),
      JSON.stringify({ meta: { isAvailable: true }, responses: null }),
    );
  }
}
});
seed();

const counts = db
  .prepare("SELECT account_id, COUNT(*) AS n FROM snapshots WHERE account_id LIKE 'demo-%' GROUP BY account_id ORDER BY account_id")
  .all();
console.log("seeded demo accounts:");
for (const row of counts) console.log(`  ${row.account_id}: ${row.n} snapshots`);
} finally {
  db.close();
}
