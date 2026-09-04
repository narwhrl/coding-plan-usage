import { getDb } from "./db";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";

export type GeneralSettings = {
  defaultIntervalMinutes: number;
  warnPct: number;
  /** 超过该天数的历史快照会被清理；0 = 永久保留。 */
  retentionDays: number;
  /** 超过该天数的快照清空 raw 列（仅排障用的原始响应体）。 */
  rawRetentionDays: number;
};

const KEY = "general";

const DEFAULTS: GeneralSettings = {
  defaultIntervalMinutes: 15,
  warnPct: 20,
  retentionDays: 90,
  rawRetentionDays: 7,
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
