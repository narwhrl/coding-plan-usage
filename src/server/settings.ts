import { getDb } from "./db";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";

export type GeneralSettings = {
  defaultIntervalMinutes: number;
  warnPct: number;
};

const KEY = "general";

const DEFAULTS: GeneralSettings = {
  defaultIntervalMinutes: 15,
  warnPct: 20,
};

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
  };
  const db = getDb();
  db.insert(settings)
    .values({ key: KEY, value: JSON.stringify(next) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(next) } })
    .run();
  return next;
}
