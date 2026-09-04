import { describe, expect, it } from "vitest";
import { wrapFetchWithTimeout } from "./fetch-timeout";

describe("wrapFetchWithTimeout", () => {
  it("aborts when the underlying fetch honors the signal", async () => {
    const hanging: typeof fetch = (async (_input, init) => {
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
    });
    const fetchFn = wrapFetchWithTimeout(hanging, 30);
    await expect(fetchFn("http://example.test/")).rejects.toBeTruthy();
  });

  it("forwards a successful response", async () => {
    const fetchFn = wrapFetchWithTimeout(async () => new Response("ok", { status: 200 }), 200);
    const res = await fetchFn("http://example.test/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
