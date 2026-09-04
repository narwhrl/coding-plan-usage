import { getDb } from "./db";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";

export type GeneralSettings = {
  defaultIntervalMinutes: number;
  warnPct: number;
  /** 超过该天数的历史快照会被清理；0 = 永久保留。 */
  retentionDays: number;
  /** 超过该天数的快照清空 raw 列（仅排障用的原始响应体）。 */
  rawRetentionDays: number;
};

/** 出站 Webhook 告警配置。url/secret 视同凭证，只以密文落库，绝不出现在响应或日志里。 */
export type NotifySettings = {
  enabled: boolean;
  events: { low: boolean; recovered: boolean; error: boolean };
  /** 同一账户停留在同一异常电平时的重复提醒间隔。 */
  minIntervalMinutes: number;
  url: string;
  /** 空串 = 不签名。 */
  secret: string;
};

/** PATCH 入参：events 可逐项给，未给的项保持原值。 */
export type NotifySettingsPatch = {
  enabled?: boolean;
  events?: { low?: boolean; recovered?: boolean; error?: boolean };
  minIntervalMinutes?: number;
  /** 空串或省略 = 保持原值。 */
  url?: string;
  secret?: string;
};

/** 给前端的脱敏形状：只回显 host，让用户能确认配的是哪个 endpoint。 */
export type NotifySettingsView = {
  enabled: boolean;
  events: { low: boolean; recovered: boolean; error: boolean };
  minIntervalMinutes: number;
  urlHost: string | null;
  hasSecret: boolean;
};

const KEY = "general";
const NOTIFY_KEY = "notify";

const DEFAULTS: GeneralSettings = {
  defaultIntervalMinutes: 15,
  warnPct: 20,
  retentionDays: 90,
  rawRetentionDays: 7,
};

const NOTIFY_DEFAULTS: NotifySettings = {
  enabled: false,
  events: { low: true, recovered: true, error: true },
  minIntervalMinutes: 360,
  url: "",
  secret: "",
};

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : fallback;
}

export async function getSettings(): Promise<GeneralSettings> {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(row.value) as Partial<GeneralSettings>;
    return {
      defaultIntervalMinutes:
        typeof parsed.defaultIntervalMinutes === "number" && parsed.defaultIntervalMinutes > 0
          ? parsed.defaultIntervalMinutes
          : DEFAULTS.defaultIntervalMinutes,
      warnPct:
        typeof parsed.warnPct === "number" && parsed.warnPct >= 0 && parsed.warnPct <= 100
          ? parsed.warnPct
          : DEFAULTS.warnPct,
      retentionDays: intInRange(parsed.retentionDays, 0, 3650, DEFAULTS.retentionDays),
      rawRetentionDays: intInRange(parsed.rawRetentionDays, 0, 365, DEFAULTS.rawRetentionDays),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function patchSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
  const current = await getSettings();
  const next: GeneralSettings = {
    defaultIntervalMinutes:
      typeof patch.defaultIntervalMinutes === "number" && patch.defaultIntervalMinutes > 0
        ? Math.round(patch.defaultIntervalMinutes)
        : current.defaultIntervalMinutes,
    warnPct:
      typeof patch.warnPct === "number" && patch.warnPct >= 0 && patch.warnPct <= 100
        ? Math.round(patch.warnPct)
        : current.warnPct,
    retentionDays: intInRange(patch.retentionDays, 0, 3650, current.retentionDays),
    rawRetentionDays: intInRange(patch.rawRetentionDays, 0, 365, current.rawRetentionDays),
  };
  const db = getDb();
  db.insert(settings)
    .values({ key: KEY, value: JSON.stringify(next) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(next) } })
    .run();
  return next;
}

/** 落库形状：url/secret 合成一个密文 blob，其余字段明文（无敏感信息）。 */
type StoredNotify = {
  enabled?: boolean;
  events?: { low?: boolean; recovered?: boolean; error?: boolean };
  minIntervalMinutes?: number;
  endpointCipher?: string;
};

export class InvalidWebhookUrlError extends Error {
  constructor() {
    super("webhook url must use http or https");
  }
}

/** http/https 之外的协议一律拒绝：file:/ 之类没有意义且是额外的攻击面。 */
function assertWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidWebhookUrlError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new InvalidWebhookUrlError();
}

export async function getNotifySettings(): Promise<NotifySettings> {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, NOTIFY_KEY)).get();
  if (!row) return { ...NOTIFY_DEFAULTS, events: { ...NOTIFY_DEFAULTS.events } };
  let stored: StoredNotify = {};
  try {
    const parsed = JSON.parse(row.value) as StoredNotify;
    if (parsed && typeof parsed === "object") stored = parsed;
  } catch {
    /* 坏数据按未配置处理 */
  }
  let url = "";
  let secret = "";
  if (stored.endpointCipher) {
    try {
      // 换过 APP_ENCRYPTION_KEY 时解不开：按未配置处理，不抛错打断采集。
      const endpoint = JSON.parse(decryptSecret(stored.endpointCipher)) as { url?: string; secret?: string };
      url = typeof endpoint.url === "string" ? endpoint.url : "";
      secret = typeof endpoint.secret === "string" ? endpoint.secret : "";
    } catch {
      /* ignore */
    }
  }
  return {
    enabled: stored.enabled === true,
    events: {
      low: stored.events?.low !== false,
      recovered: stored.events?.recovered !== false,
      error: stored.events?.error !== false,
    },
    minIntervalMinutes: intInRange(
      stored.minIntervalMinutes,
      5,
      10_080,
      NOTIFY_DEFAULTS.minIntervalMinutes,
    ),
    url,
    secret,
  };
}

export function redactNotifySettings(notify: NotifySettings): NotifySettingsView {
  let urlHost: string | null = null;
  if (notify.url) {
    try {
      urlHost = new URL(notify.url).host;
    } catch {
      urlHost = null;
    }
  }
  return {
    enabled: notify.enabled,
    events: { ...notify.events },
    minIntervalMinutes: notify.minIntervalMinutes,
    urlHost,
    hasSecret: notify.secret.length > 0,
  };
}

/**
 * url/secret 传空或省略即保持原值（同「编辑账户」里凭证留空即保留的约定）；
 * 要停用请把 enabled 置 false。返回脱敏形状，调用方不会拿到明文。
 */
export async function patchNotifySettings(patch: NotifySettingsPatch): Promise<NotifySettingsView> {
  const current = await getNotifySettings();
  const url = patch.url && patch.url.trim() !== "" ? patch.url.trim() : current.url;
  if (url) assertWebhookUrl(url);
  const secret = patch.secret && patch.secret !== "" ? patch.secret : current.secret;
  const next: NotifySettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    events: {
      low: typeof patch.events?.low === "boolean" ? patch.events.low : current.events.low,
      recovered:
        typeof patch.events?.recovered === "boolean" ? patch.events.recovered : current.events.recovered,
      error: typeof patch.events?.error === "boolean" ? patch.events.error : current.events.error,
    },
    minIntervalMinutes: intInRange(patch.minIntervalMinutes, 5, 10_080, current.minIntervalMinutes),
    url,
    secret,
  };
  const stored: StoredNotify = {
    enabled: next.enabled,
    events: next.events,
    minIntervalMinutes: next.minIntervalMinutes,
    endpointCipher:
      next.url || next.secret
        ? encryptSecret(JSON.stringify({ url: next.url, secret: next.secret }))
        : undefined,
  };
  const value = JSON.stringify(stored);
  const db = getDb();
  db.insert(settings)
    .values({ key: NOTIFY_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
  return redactNotifySettings(next);
}
