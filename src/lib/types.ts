/** 前端消费的 API 形状（与 /api 路由响应同步）。 */

import type { BurnRate } from "./burn-rate";

export type Window = {
  kind: string;
  label?: string;
  used?: number;
  total?: number;
  remaining?: number;
  remainingPct?: number;
  unit: string;
  resetAt?: string | null;
  /** 次要车道：仅详情页展示，不参与概览 hero/warn/spark/KPI 聚合 */
  minor?: boolean;
};

export type SnapshotView = {
  id: number;
  fetchedAt: string;
  status: "ok" | "error";
  error: string | null;
  windows: Window[];
  balance: { amount: number; currency?: string } | null;
  meta?: Record<string, unknown> | null;
};

/** 概览 7 日柱条的一个点：UTC 日期(YYYY-MM-DD) + 当日最紧 remainingPct。 */
export type SparkPoint = { d: string; pct: number };

export type ProviderLane = "plan" | "api";
export type DisplayCurrency = "CNY" | "USD";

export type AccountConfig = {
  intervalMinutes?: number;
  warnPct?: number;
  baseUrl?: string;
  /** DeepSeek 等多币种余额：卡片/详情只展示选中的币种。 */
  displayCurrency?: DisplayCurrency;
  /** 脱敏后的代理 URL（不含密码）。采集走该账户的 HTTP(S)/SOCKS5 代理。 */
  proxyUrl?: string;
  /** 种子演示账户标记：手动刷新跳过真实采集（仅脚本写入，API schema 剥离该键）。 */
  demo?: boolean;
};

export type AccountView = {
  id: string;
  providerId: string;
  providerName: string;
  providerKind: string;
  providerUnit: string;
  /** 订阅配额 vs 预付费 API，概览分栏用。 */
  lane: ProviderLane;
  label: string;
  enabled: boolean;
  config: AccountConfig;
  nextFetchAt: number | null;
  /** 连续采集失败次数（落库，进程重启后仍有效）。 */
  consecutiveFailures: number;
  /** 最近一次采集失败时刻（ISO UTC）；成功后不清空。 */
  lastErrorAt: string | null;
  createdAt: string;
  latestSnapshot: SnapshotView | null;
  lastOkSnapshot: SnapshotView | null;
  warn: boolean;
  warnThreshold: number;
  /** 近 7 天每日最紧 remainingPct（服务端聚合，可选以兼容旧响应）。 */
  spark?: SparkPoint[];
  /** 近 24h 消耗速率与预计耗尽（服务端聚合；样本不足为 null）。 */
  burn?: BurnRate | null;
};
export type CredentialFieldView = {
  key: string;
  label: string;
  kind: "text" | "json";
  secret: boolean;
  placeholder?: string;
};

export type ProviderView = {
  id: string;
  kind: string;
  name: string;
  unit: string;
  sortOrder: number;
  fields: CredentialFieldView[];
  baseUrlOptions: { label: string; value: string }[] | null;
  hasSpec: boolean;
  lane: ProviderLane;
  displayCurrencies: DisplayCurrency[] | null;
};

export type GeneralSettings = {
  defaultIntervalMinutes: number;
  warnPct: number;
  /** 超过该天数的历史快照会被清理；0 = 永久保留。 */
  retentionDays: number;
  /** 超过该天数的快照清空 raw 列（仅排障用的原始响应体）。 */
  rawRetentionDays: number;
};

/** 出站 Webhook 告警设置的脱敏形状：地址与密钥不回传明文，只给 host 与是否已设。 */
export type NotifySettingsView = {
  enabled: boolean;
  events: { low: boolean; recovered: boolean; error: boolean };
  minIntervalMinutes: number;
  urlHost: string | null;
  hasSecret: boolean;
};

export type HistorySnapshot = {
  id: number;
  fetchedAt: string;
  windows: Window[];
  balance: { amount: number; currency?: string } | null;
};
