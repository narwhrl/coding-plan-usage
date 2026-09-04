import { describe, expect, it } from "vitest";
import { createAccountFetch } from "./proxy-fetch";

describe("createAccountFetch", () => {
  it("reuses global fetch when no proxy is set", async () => {
    const { fetchFn, close } = createAccountFetch(undefined);
    expect(fetchFn).toBe(globalThis.fetch);
    await close();
  });

  it("builds http and socks5 fetch wrappers that can be closed", async () => {
    const http = createAccountFetch({ protocol: "http", host: "127.0.0.1", port: 9 });
    const socks = createAccountFetch({ protocol: "socks5", host: "127.0.0.1", port: 9, username: "u", password: "p" });
    expect(http.fetchFn).not.toBe(globalThis.fetch);
    expect(socks.fetchFn).not.toBe(globalThis.fetch);
    await http.close();
    await socks.close();
  });
});
