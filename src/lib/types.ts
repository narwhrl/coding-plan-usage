/** 前端消费的 API 形状（与 /api 路由响应同步）。 */

export type Window = {
  kind: string;
  label?: string;
  used?: number;
  total?: number;
  remaining?: number;
  remainingPct?: number;
  unit: string;
  resetAt?: string | null;
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

export type AccountConfig = {
  intervalMinutes?: number;
  warnPct?: number;
  baseUrl?: string;
};

export type AccountView = {
  id: string;
  providerId: string;
  providerName: string;
  providerKind: string;
  providerUnit: string;
  label: string;
  enabled: boolean;
  config: AccountConfig;
  nextFetchAt: number | null;
  createdAt: string;
  latestSnapshot: SnapshotView | null;
  lastOkSnapshot: SnapshotView | null;
  warn: boolean;
  warnThreshold: number;
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
};

export type GeneralSettings = {
  defaultIntervalMinutes: number;
  warnPct: number;
};

export type HistorySnapshot = {
  id: number;
  fetchedAt: string;
  windows: Window[];
  balance: { amount: number; currency?: string } | null;
};
