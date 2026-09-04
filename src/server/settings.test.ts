import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, migrate, _resetForTest } from "./db";
import { settings } from "./db/schema";
import {
  getNotifySettings,
  getSettings,
  InvalidWebhookUrlError,
  patchNotifySettings,
  patchSettings,
  redactNotifySettings,
} from "./settings";

process.env.APP_ENCRYPTION_KEY = "settings-test-key";
process.env.SQLITE_PATH = ":memory:";

const URL_A = "https://hooks.example.com/T0/B1/tok3n";
const SECRET_A = "sign-me-please";

function storedNotifyValue(): string {
  return getDb().select().from(settings).where(eq(settings.key, "notify")).get()?.value ?? "";
}

beforeEach(() => {
  migrate();
  getDb().delete(settings).run();
});

afterAll(() => {
  _resetForTest();
});

describe("general settings", () => {
  it("falls back to defaults on an empty table", async () => {
    expect(await getSettings()).toEqual({
      defaultIntervalMinutes: 15,
      warnPct: 20,
      retentionDays: 90,
      rawRetentionDays: 7,
    });
  });

  it("accepts 0 for retention as 'keep forever' instead of falling back", async () => {
    const next = await patchSettings({ retentionDays: 0, rawRetentionDays: 0 });
    expect(next.retentionDays).toBe(0);
    expect(next.rawRetentionDays).toBe(0);
  });

  it("rejects out-of-range retention values and keeps the current ones", async () => {
    await patchSettings({ retentionDays: 30 });
    const next = await patchSettings({ retentionDays: 99_999 });
    expect(next.retentionDays).toBe(30);
  });
});

describe("notify settings", () => {
  it("defaults to disabled with every event on", async () => {
    expect(await getNotifySettings()).toEqual({
      enabled: false,
      events: { low: true, recovered: true, error: true },
      minIntervalMinutes: 360,
      url: "",
      secret: "",
    });
  });

  it("never writes the url or the secret in plaintext", async () => {
    await patchNotifySettings({ enabled: true, url: URL_A, secret: SECRET_A });

    const raw = storedNotifyValue();
    expect(raw).not.toContain(URL_A);
    expect(raw).not.toContain("hooks.example.com");
    expect(raw).not.toContain(SECRET_A);
    expect(raw).toContain("v1:");

    const roundTripped = await getNotifySettings();
    expect(roundTripped.url).toBe(URL_A);
    expect(roundTripped.secret).toBe(SECRET_A);
    expect(roundTripped.enabled).toBe(true);
  });

  it("keeps the stored endpoint when the patch leaves the fields blank", async () => {
    await patchNotifySettings({ enabled: true, url: URL_A, secret: SECRET_A });
    await patchNotifySettings({ minIntervalMinutes: 30, url: "", secret: "" });

    const after = await getNotifySettings();
    expect(after.url).toBe(URL_A);
    expect(after.secret).toBe(SECRET_A);
    expect(after.minIntervalMinutes).toBe(30);
  });

  it("rejects non-http protocols", async () => {
    await expect(patchNotifySettings({ url: "file:///etc/passwd" })).rejects.toBeInstanceOf(
      InvalidWebhookUrlError,
    );
    await expect(patchNotifySettings({ url: "not a url" })).rejects.toBeInstanceOf(
      InvalidWebhookUrlError,
    );
    expect(storedNotifyValue()).toBe("");
  });

  it("only returns the host and a secret flag to callers", async () => {
    const view = await patchNotifySettings({ enabled: true, url: URL_A, secret: SECRET_A });
    expect(view).toEqual({
      enabled: true,
      events: { low: true, recovered: true, error: true },
      minIntervalMinutes: 360,
      urlHost: "hooks.example.com",
      hasSecret: true,
    });
    expect(JSON.stringify(view)).not.toContain(SECRET_A);
  });

  it("reports no secret when only a url is configured", async () => {
    await patchNotifySettings({ url: "http://localhost:9999/hook" });
    const view = redactNotifySettings(await getNotifySettings());
    expect(view.urlHost).toBe("localhost:9999");
    expect(view.hasSecret).toBe(false);
  });

  it("can turn individual events off", async () => {
    await patchNotifySettings({ url: URL_A, events: { recovered: false } });
    const after = await getNotifySettings();
    expect(after.events).toEqual({ low: true, recovered: false, error: true });
  });

  it("treats an undecryptable endpoint as not configured", async () => {
    await patchNotifySettings({ enabled: true, url: URL_A, secret: SECRET_A });
    // 模拟换过 APP_ENCRYPTION_KEY：密文解不开时不能抛错打断采集。
    const value = JSON.stringify({ enabled: true, endpointCipher: "v1:not-a-real-blob" });
    getDb().update(settings).set({ value }).where(eq(settings.key, "notify")).run();

    const after = await getNotifySettings();
    expect(after.url).toBe("");
    expect(after.enabled).toBe(true);
  });
});
