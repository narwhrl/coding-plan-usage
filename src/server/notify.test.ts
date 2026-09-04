import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { decideNotifyEvent, dispatchWebhook, evaluateAlertLevel, type NotifyPayload } from "./notify";
import type { Window } from "./adapters/types";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const ALL_EVENTS = { low: true, recovered: true, error: true };

function decide(overrides: Partial<Parameters<typeof decideNotifyEvent>[0]>) {
  return decideNotifyEvent({
    prev: "ok",
    next: "ok",
    lastNotifiedAt: null,
    minIntervalMinutes: 360,
    consecutiveFailures: 0,
    events: ALL_EVENTS,
    now: NOW,
    ...overrides,
  });
}

describe("evaluateAlertLevel", () => {
  it("treats a failed poll as the error level regardless of windows", () => {
    expect(
      evaluateAlertLevel({ status: "error", windows: [{ remainingPct: 99 }], warnThreshold: 20 }),
    ).toBe("error");
  });

  it("flags low when any window sits below the threshold", () => {
    expect(
      evaluateAlertLevel({
        status: "ok",
        windows: [{ remainingPct: 80 }, { remainingPct: 12 }],
        warnThreshold: 20,
      }),
    ).toBe("low");
  });

  it("ignores minor lanes", () => {
    expect(
      evaluateAlertLevel({
        status: "ok",
        windows: [{ remainingPct: 4, minor: true }, { remainingPct: 70 }],
        warnThreshold: 20,
      }),
    ).toBe("ok");
  });

  it("flags low when the provider reports the balance as unusable", () => {
    // 和 /api/accounts 的 warn 判定对齐：界面亮黄灯时告警不能沉默。
    expect(
      evaluateAlertLevel({ status: "ok", windows: [], warnThreshold: 20, isAvailable: false }),
    ).toBe("low");
  });

  it("stays ok when no window carries a percentage", () => {
    // 预付费余额（DeepSeek 这类）没有百分比，不能当成 0% 报警。
    const balanceOnly: Window[] = [{ kind: "balance", unit: "usd", remaining: 5 }];
    expect(evaluateAlertLevel({ status: "ok", windows: balanceOnly, warnThreshold: 20 })).toBe("ok");
  });
});

describe("decideNotifyEvent", () => {
  it("fires on each abnormal transition", () => {
    expect(decide({ prev: "ok", next: "low" })).toBe("quota_low");
    expect(decide({ prev: "ok", next: "error", consecutiveFailures: 2 })).toBe("poll_error");
    expect(decide({ prev: "low", next: "ok" })).toBe("quota_recovered");
    expect(decide({ prev: "error", next: "ok" })).toBe("quota_recovered");
    expect(decide({ prev: "low", next: "error", consecutiveFailures: 3 })).toBe("poll_error");
  });

  it("stays silent when the first ever evaluation is healthy", () => {
    expect(decide({ prev: null, next: "ok" })).toBeNull();
    expect(decide({ prev: null, next: "low" })).toBe("quota_low");
  });

  it("waits for a second failure before reporting a polling error", () => {
    expect(decide({ prev: "ok", next: "error", consecutiveFailures: 1 })).toBeNull();
    expect(decide({ prev: "ok", next: "error", consecutiveFailures: 2 })).toBe("poll_error");
  });

  it("never repeats while the account stays healthy", () => {
    expect(decide({ prev: "ok", next: "ok" })).toBeNull();
  });

  it("re-notifies the same abnormal level only after the minimum interval", () => {
    const recent = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    const old = new Date(NOW.getTime() - 7 * 60 * 60_000).toISOString();
    expect(decide({ prev: "low", next: "low", lastNotifiedAt: recent })).toBeNull();
    expect(decide({ prev: "low", next: "low", lastNotifiedAt: old })).toBe("quota_low");
    // 从未成功推送过（上一次投递失败）时不该被间隔挡住。
    expect(decide({ prev: "low", next: "low", lastNotifiedAt: null })).toBe("quota_low");
  });

  it("respects the per-event toggles", () => {
    expect(decide({ prev: "ok", next: "low", events: { ...ALL_EVENTS, low: false } })).toBeNull();
    expect(
      decide({ prev: "low", next: "ok", events: { ...ALL_EVENTS, recovered: false } }),
    ).toBeNull();
    expect(
      decide({
        prev: "ok",
        next: "error",
        consecutiveFailures: 3,
        events: { ...ALL_EVENTS, error: false },
      }),
    ).toBeNull();
  });
});

function payload(): NotifyPayload {
  return {
    version: 1,
    event: "quota_low",
    firedAt: NOW.toISOString(),
    account: { id: "a1", label: "work", providerId: "glm", providerName: "GLM" },
    level: "low",
    previousLevel: "ok",
    threshold: 20,
    window: {
      kind: "weekly",
      label: null,
      remainingPct: 12,
      remaining: 120,
      total: 1000,
      unit: "tokens",
      resetAt: null,
    },
    error: null,
    consecutiveFailures: 0,
  };
}

describe("dispatchWebhook", () => {
  it("posts the payload with an event header and an HMAC signature", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    try {
      const result = await dispatchWebhook(payload(), {
        url: "https://hooks.example.com/abc",
        secret: "s3cret",
      });
      expect(result).toEqual({ ok: true, status: 204 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://hooks.example.com/abc");
      expect(calls[0].init.method).toBe("POST");
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers["x-cpu-event"]).toBe("quota_low");
      const body = calls[0].init.body as string;
      expect(headers["x-cpu-signature"]).toBe(
        `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`,
      );
      expect((JSON.parse(body) as NotifyPayload).account?.label).toBe("work");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("omits the signature header when no secret is configured", async () => {
    const originalFetch = globalThis.fetch;
    let headers: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await dispatchWebhook(payload(), { url: "https://hooks.example.com/abc", secret: "" });
      expect(headers["x-cpu-signature"]).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports a non-2xx response as a failure instead of throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      expect(await dispatchWebhook(payload(), { url: "https://x.example.com", secret: "" })).toEqual({
        ok: false,
        status: 500,
        error: "HTTP 500",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("swallows transport errors so a poll is never broken by notification", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      const result = await dispatchWebhook(payload(), { url: "https://x.example.com", secret: "" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
