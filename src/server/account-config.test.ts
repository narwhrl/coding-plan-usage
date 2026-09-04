import { describe, expect, it } from "vitest";
import {
  applyProxyUrl,
  decryptStoredProxy,
  mergeAccountConfig,
  parseStoredConfig,
  toPublicConfig,
} from "./account-config";

process.env.APP_ENCRYPTION_KEY = "account-config-test-key";

describe("parseStoredConfig", () => {
  it("picks known fields and drops plaintext proxy leftovers", () => {
    expect(
      parseStoredConfig(
        JSON.stringify({
          intervalMinutes: 15,
          warnPct: 20,
          baseUrl: "https://api.example",
          displayCurrency: "USD",
          demo: true,
          proxyUrl: "http://user:pass@127.0.0.1:7890",
          proxyCipher: "v1:abc",
          extra: true,
        }),
      ),
    ).toEqual({
      intervalMinutes: 15,
      warnPct: 20,
      baseUrl: "https://api.example",
      displayCurrency: "USD",
      demo: true,
      proxyCipher: "v1:abc",
    });
  });

  it("returns empty on invalid JSON", () => {
    expect(parseStoredConfig("nope")).toEqual({});
  });
});

describe("applyProxyUrl / toPublicConfig", () => {
  it("encrypts the proxy and never returns the password or cipher", () => {
    const applied = applyProxyUrl({}, "socks5://user:s3cret@127.0.0.1:1080");
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.stored.proxyCipher?.startsWith("v1:")).toBe(true);
    const publicConfig = toPublicConfig(applied.stored);
    expect(publicConfig.proxyUrl).toBe("socks5://user@127.0.0.1:1080");
    expect(JSON.stringify(publicConfig)).not.toContain("s3cret");
    expect(JSON.stringify(publicConfig)).not.toContain("proxyCipher");
    expect(decryptStoredProxy(applied.stored.proxyCipher)).toMatchObject({
      protocol: "socks5",
      host: "127.0.0.1",
      port: 1080,
      username: "user",
      password: "s3cret",
    });
  });

  it("keeps the stored password when the redacted URL is saved again", () => {
    const first = applyProxyUrl({}, "http://user:s3cret@127.0.0.1:7890");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = applyProxyUrl(first.stored, "http://user@127.0.0.1:7890");
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(decryptStoredProxy(again.stored.proxyCipher)?.password).toBe("s3cret");
  });

  it("does not keep the password when the endpoint changes", () => {
    const first = applyProxyUrl({}, "http://user:s3cret@127.0.0.1:7890");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const moved = applyProxyUrl(first.stored, "http://user@127.0.0.1:7891");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(decryptStoredProxy(moved.stored.proxyCipher)?.password).toBeUndefined();
  });

  it("clears the proxy on empty input", () => {
    const first = applyProxyUrl({}, "http://127.0.0.1:7890");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const cleared = applyProxyUrl(first.stored, "  ");
    expect(cleared).toEqual({ ok: true, stored: {} });
  });

  it("rejects unsupported schemes", () => {
    expect(applyProxyUrl({}, "ftp://127.0.0.1:21")).toEqual({ ok: false, error: "unsupported_protocol" });
  });
});

describe("mergeAccountConfig", () => {
  it("keeps an existing proxy when proxyUrl is omitted", () => {
    const created = mergeAccountConfig("{}", { intervalMinutes: 15, proxyUrl: "http://127.0.0.1:7890" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const merged = mergeAccountConfig(JSON.stringify(created.stored), { warnPct: 10 });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.stored.intervalMinutes).toBe(15);
    expect(merged.stored.warnPct).toBe(10);
    expect(merged.stored.proxyCipher).toBe(created.stored.proxyCipher);
  });
});
