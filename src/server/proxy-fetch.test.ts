import { describe, expect, it } from "vitest";
import { createAccountFetch } from "./proxy-fetch";

describe("createAccountFetch", () => {
  it("wraps global fetch when no proxy is set", async () => {
    const original = globalThis.fetch;
    let seen = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response("ok");
    }) as typeof fetch;
    try {
      const { fetchFn, close } = createAccountFetch(undefined);
      expect(fetchFn).not.toBe(globalThis.fetch);
      const res = await fetchFn("http://example.test/quota");
      expect(seen).toBe("http://example.test/quota");
      expect(res.status).toBe(200);
      await close();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("builds http and socks5 fetch wrappers that can be closed", async () => {
    const http = createAccountFetch({ protocol: "http", host: "127.0.0.1", port: 9 });
    const socks = createAccountFetch({ protocol: "socks5", host: "127.0.0.1", port: 9, username: "u", password: "p" });
    expect(http.fetchFn).not.toBe(globalThis.fetch);
    expect(socks.fetchFn).not.toBe(globalThis.fetch);
    await http.close();
    await socks.close();
  });

  it("times out a hanging upstream when the stub honors AbortSignal", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      await new Promise<void>((_, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason));
      });
      return new Response();
    }) as typeof fetch;
    try {
      const { fetchFn, close } = createAccountFetch(undefined, { timeoutMs: 40 });
      await expect(fetchFn("http://example.test/hang")).rejects.toBeTruthy();
      await close();
    } finally {
      globalThis.fetch = original;
    }
  });
});
