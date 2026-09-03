import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * providers — 模板层（builtin 适配器或 custom declarative spec）。
 */
export const providers = sqliteTable("providers", {
  /** 同 adapter id（builtin）或 uuid（custom） */
  id: text("id").primaryKey(),
  /** 'builtin' | 'custom' */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  /** 原生单位：tokens/credits/requests/usd/... */
  unit: text("unit").notNull(),
  /** kind=custom 时的声明式 spec JSON（zod DeclarativeSpec） */
  declarativeSpec: text("declarative_spec"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

/**
 * accounts — 账户实例（同 provider 模板可多账户）。
 */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    label: text("label").notNull(),
    /** AES-256-GCM 密文，v1:<base64(salt|iv|tag|ct)> */
    credentialsCipher: text("credentials_cipher").notNull(),
    /** JSON: {intervalMinutes?:int, warnPct?:int, baseUrl?:string, displayCurrency?:"CNY"|"USD"} */
    config: text("config").notNull().default("{}"),
    enabled: integer("enabled").notNull().default(1),
    /** ms epoch；null 视为立即到期 */
    nextFetchAt: integer("next_fetch_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_accounts_provider").on(t.providerId)],
);

/**
 * snapshots — 每次采集一条，全量保留。
 *
 * windows JSON 元素统一形状（前后端契约）：
 *   { kind: '5h'|'weekly'|'monthly'|'credits'|'requests'|'balance'|'granted'|'topped_up'|'mcp'|'premium'|'chat'|'lifetime'|string,
 *     label?: string,
 *     used?: number, total?: number, remaining?: number, remainingPct?: number,
 *     unit: 'tokens'|'credits'|'requests'|'usd'|string,
 *     resetAt?: string|null, minor?: boolean }
 * remainingPct 统一 0-100；remaining 优先取 API 原值，否则 total-used。
 * minor=true 的车道只在详情页展示，聚合一律跳过。
 */
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** ISO UTC */
    fetchedAt: text("fetched_at").notNull(),
    /** 'ok' | 'error' */
    status: text("status").notNull(),
    error: text("error"),
    windows: text("windows"),
    /** JSON {amount:number, currency?:string} */
    balance: text("balance"),
    raw: text("raw"),
  },
  (t) => [
    index("idx_snapshots_account_time").on(t.accountId, t.fetchedAt),
    index("idx_snapshots_account_status").on(t.accountId, t.status),
  ],
);

/**
 * settings — 键值（JSON value）。已知键：
 *   'general': {defaultIntervalMinutes:15, warnPct:20}
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
