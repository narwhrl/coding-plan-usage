import { describe, expect, it } from "vitest";
import { formatProxyUrl, parseProxyUrl, redactProxySecrets, sameProxyEndpoint } from "./proxy";

describe("parseProxyUrl", () => {
  it("parses http/https/socks5 and socks5h", () => {
    expect(parseProxyUrl("http://127.0.0.1:7890")).toEqual({
      ok: true,
      value: { protocol: "http", host: "127.0.0.1", port: 7890 },
    });
    expect(parseProxyUrl("https://proxy.example:8443")).toEqual({
      ok: true,
      value: { protocol: "https", host: "proxy.example", port: 8443 },
    });
    expect(parseProxyUrl("socks5://127.0.0.1:1080")).toEqual({
      ok: true,
      value: { protocol: "socks5", host: "127.0.0.1", port: 1080 },
    });
    expect(parseProxyUrl("socks5h://10.0.0.2:1080")).toEqual({
      ok: true,
      value: { protocol: "socks5", host: "10.0.0.2", port: 1080 },
    });
  });

  it("fills default ports", () => {
    expect(parseProxyUrl("http://127.0.0.1")).toMatchObject({
      ok: true,
      value: { port: 80 },
    });
    expect(parseProxyUrl("https://proxy.example")).toMatchObject({
      ok: true,
      value: { port: 443 },
    });
    expect(parseProxyUrl("socks5://127.0.0.1")).toMatchObject({
      ok: true,
      value: { port: 1080 },
    });
  });

  it("decodes userinfo and keeps IPv6 host without brackets", () => {
    expect(parseProxyUrl("http://user%40name:p%40ss@127.0.0.1:7890")).toEqual({
      ok: true,
      value: { protocol: "http", host: "127.0.0.1", port: 7890, username: "user@name", password: "p@ss" },
    });
    expect(parseProxyUrl("http://[::1]:7890")).toEqual({
      ok: true,
      value: { protocol: "http", host: "::1", port: 7890 },
    });
  });

  it("rejects empty, non-URL, and unsupported schemes", () => {
    expect(parseProxyUrl("")).toEqual({ ok: false, error: "invalid_url" });
    expect(parseProxyUrl("  ")).toEqual({ ok: false, error: "invalid_url" });
    expect(parseProxyUrl("127.0.0.1:7890")).toEqual({ ok: false, error: "invalid_url" });
    expect(parseProxyUrl("ftp://127.0.0.1:21")).toEqual({ ok: false, error: "unsupported_protocol" });
    expect(parseProxyUrl("socks://127.0.0.1:1080")).toEqual({ ok: false, error: "unsupported_protocol" });
  });
});

describe("formatProxyUrl", () => {
  it("redacts the password unless asked", () => {
    const proxy = {
      protocol: "socks5" as const,
      host: "127.0.0.1",
      port: 1080,
      username: "user",
      password: "s3cret",
    };
    expect(formatProxyUrl(proxy)).toBe("socks5://user@127.0.0.1:1080");
    expect(formatProxyUrl(proxy, { includePassword: true })).toBe("socks5://user:s3cret@127.0.0.1:1080");
  });

  it("brackets IPv6 hosts and encodes userinfo", () => {
    expect(
      formatProxyUrl(
        { protocol: "http", host: "::1", port: 7890, username: "user@name", password: "p@ss" },
        { includePassword: true },
      ),
    ).toBe("http://user%40name:p%40ss@[::1]:7890");
  });
});

describe("sameProxyEndpoint", () => {
  it("ignores password and compares protocol/host/port/user", () => {
    const a = { protocol: "http" as const, host: "127.0.0.1", port: 7890, username: "u", password: "old" };
    const b = { protocol: "http" as const, host: "127.0.0.1", port: 7890, username: "u", password: "new" };
    expect(sameProxyEndpoint(a, b)).toBe(true);
    expect(sameProxyEndpoint(a, { ...b, username: "other" })).toBe(false);
    expect(sameProxyEndpoint(a, { ...b, port: 7891 })).toBe(false);
  });
});

describe("redactProxySecrets", () => {
  it("strips plaintext and percent-encoded passwords", () => {
    const proxy = { protocol: "http" as const, host: "h", port: 1, password: "p@ss" };
    expect(redactProxySecrets("connect http://u:p@ss@h:1 failed p%40ss", proxy)).toBe(
      "connect http://u:***@h:1 failed ***",
    );
  });
});
