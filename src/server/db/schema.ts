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
    /** JSON: {intervalMinutes?:int, warnPct?:int, baseUrl?:string, displayCurrency?:"CNY"|"USD", proxyCipher?:string} */
    config: text("config").notNull().default("{}"),
    enabled: integer("enabled").notNull().default(1),
    /** ms epoch；null 视为立即到期 */
    nextFetchAt: integer("next_fetch_at"),
    /** 连续采集失败次数；成功归零。进程重启后仍生效，用于 6h 退避与设置页展示。 */
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** 最近一次采集失败时刻（ISO UTC）；成功后不清空，仅用于展示。 */
    lastErrorAt: text("last_error_at"),
    /** 告警状态机上一次判定的电平：'ok' | 'low' | 'error'；null = 尚未判定过。 */
    alertLevel: text("alert_level"),
    /** 上次就该电平推送成功的时刻（ISO UTC），用于最小重复间隔抑制。 */
    alertNotifiedAt: text("alert_notified_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_accounts_provider").on(t.providerId)],
);

/**
 * snapshots — 每次采集一条。留存按设置里的 retentionDays（默认 90 天）清理，
 * raw 列按 rawRetentionDays（默认 7 天）清空；每账户的最新快照与最后一次成功快照
 * 永不删除且保留 raw（详情页的 meta 住在那条 raw 里）。见 server/prune.ts。
 * API 只回传 raw.meta（适配器元数据），responses 排障切片不进浏览器。
 *
 * windows JSON 元素统一形状（前后端契约）：
 *   { kind: '5h'|'weekly'|'monthly'|'credits'|'requests'|'balance'|'granted'|'topped_up'|'mcp'|'premium'|'chat'|'lifetime'|'cursor_models'|'other_models'|'grok_bot'|string,
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
