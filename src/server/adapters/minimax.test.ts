import { describe, it, expect } from "vitest";
import { minimaxAdapter } from "./minimax";

/** stub fetch：按 URL 首段路由到 handler。 */
function routeFetch(routes: Record<string, (init?: RequestInit, url?: string) => Response>): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(init, url);
    }
    return new Response("no route for " + url, { status: 404 });
  }) as typeof fetch;
}

const ctxBase = {
  credentials: {} as Record<string, string>,
  config: {} as { baseUrl?: string },
  now: () => new Date("2026-08-31T09:00:00Z"),
};

const TOKEN_PLAN_URL = "https://api.minimax.io/v1/token_plan/remains";
const FALLBACK_URL = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";

function remainsResponse(rows: Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ data: { model_remains: rows } }), { status: 200 });
}

describe("minimax adapter", () => {
  it("maps general to 5h/weekly and every other row to a minor lane, skipping placeholders", async () => {
    const fetchFn = routeFetch({
      [TOKEN_PLAN_URL]: () =>
        remainsResponse([
          {
            model_name: "general",
            current_interval_remaining_percent: "41",
            current_interval_status: 1,
            current_interval_total_count: 0,
            end_time: 1780000000000,
            current_weekly_remaining_percent: "94",
            current_weekly_status: 1,
            current_weekly_total_count: 0,
            weekly_end_time: 1780500000000,
          },
          { model_name: "video", current_interval_remaining_percent: "100", current_interval_status: 1, current_interval_total_count: 3, end_time: 1780001200000 },
          { model_name: "Hailuo-2.3", current_interval_remaining_percent: 33, current_interval_total_count: 30, end_time: 1780002200000 },
          // status==3 占位 lane → 跳过
          { model_name: "music", current_interval_status: 3, current_interval_remaining_percent: "100", current_interval_total_count: 0 },
          // 无剩余百分比 → 跳过
          { model_name: "image", current_interval_total_count: 5 },
        ]),
    });

    const result = await minimaxAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "mm-key" },
      config: { baseUrl: "https://api.minimax.io" },
      fetchFn,
    });

    expect(result.windows).toHaveLength(4);
    const [w5h, weekly, video, hailuo] = result.windows;
    expect(w5h.kind).toBe("5h");
    expect(w5h.label).toBeUndefined();
    expect(w5h.remainingPct).toBe(41);
    expect(w5h.unit).toBe("percent");
    expect(w5h.resetAt).toBe(new Date(1780000000000).toISOString());
    expect(weekly.kind).toBe("weekly");
    expect(weekly.label).toBeUndefined();
    expect(weekly.remainingPct).toBe(94);
    expect(weekly.resetAt).toBe(new Date(1780500000000).toISOString());
    expect(video.label).toBe("video");
    expect(video.kind).toBe("daily");
    expect(video.minor).toBe(true);
    expect(video.unit).toBe("requests");
    expect(video.total).toBe(3);
    expect(video.remaining).toBe(3);
    expect(video.remainingPct).toBe(100);
    expect(hailuo.label).toBe("Hailuo-2.3");
    expect(hailuo.minor).toBe(true);
    expect(hailuo.remainingPct).toBe(33);
    expect(hailuo.total).toBe(30);
    expect(hailuo.remaining).toBe(10);
  });

  it("upgrades general windows to request counts when totals are present", async () => {
    const fetchFn = routeFetch({
      [TOKEN_PLAN_URL]: () =>
        remainsResponse([
          {
            model_name: "general",
            current_interval_remaining_percent: "41",
            current_interval_status: 1,
            current_interval_total_count: 200,
            current_weekly_remaining_percent: "94",
            current_weekly_status: 1,
            current_weekly_total_count: 1000,
          },
        ]),
    });

    const result = await minimaxAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "mm-key" },
      config: { baseUrl: "https://api.minimax.io" },
      fetchFn,
    });

    const [w5h, weekly] = result.windows;
    expect(w5h.unit).toBe("requests");
    expect(w5h.total).toBe(200);
    expect(w5h.remaining).toBe(82);
    expect(weekly.unit).toBe("requests");
    expect(weekly.total).toBe(1000);
    expect(weekly.remaining).toBe(940);
  });

  it("falls back to the legacy coding_plan endpoint when the preferred path 404s", async () => {
    const seen: string[] = [];
    const fetchFn = routeFetch({
      [TOKEN_PLAN_URL]: (_init, url) => {
        seen.push(String(url));
        return new Response("not found", { status: 404 });
      },
      [FALLBACK_URL]: (_init, url) => {
        seen.push(String(url));
        return remainsResponse([
          {
            model_name: "general",
            current_interval_remaining_percent: "55",
            current_interval_status: 1,
            current_interval_total_count: 0,
            current_weekly_remaining_percent: "77",
            current_weekly_status: 1,
            current_weekly_total_count: 0,
          },
        ]);
      },
    });

    const result = await minimaxAdapter.fetchUsage({
      ...ctxBase,
      credentials: { apiKey: "mm-key" },
      config: { baseUrl: "https://api.minimax.io" },
      fetchFn,
    });

    expect(seen).toEqual([TOKEN_PLAN_URL, FALLBACK_URL]);
    expect(result.windows.map((w) => w.remainingPct)).toEqual([55, 77]);
  });

  it("rejects immediately on 401 with the credentials error", async () => {
    const fetchFn = routeFetch({
      [TOKEN_PLAN_URL]: () => new Response("unauthorized", { status: 401 }),
    });

    await expect(
      minimaxAdapter.fetchUsage({
        ...ctxBase,
        credentials: { apiKey: "mm-key" },
        config: { baseUrl: "https://api.minimax.io" },
        fetchFn,
      }),
    ).rejects.toThrow("MiniMax remains HTTP 401: credentials rejected");
  });
});
