import { describe, it, expect } from "vitest";
import { parseModelUsage, dailySeries, latestDaySeries, peakHour } from "./model-usage";

const fixture = {
  x_time: [
    "2026-08-31 08:00",
    "2026-08-31 09:00",
    "2026-09-01 08:00",
    "2026-09-01 09:00",
  ],
  tokensUsage: [100, null, 300, 50],
  modelCallCount: [1, 2, 3, 4],
  totalUsage: { totalTokensUsage: 450, totalModelCallCount: 10 },
  modelDataList: [
    { modelName: "GLM-5.3", totalTokens: 400 },
    { modelName: "", totalTokens: 30 },
    { modelName: "GLM-5.3-Flash", totalTokens: 50 },
  ],
};

describe("parseModelUsage", () => {
  it("returns null for invalid input", () => {
    expect(parseModelUsage(null)).toBeNull();
    expect(parseModelUsage("x")).toBeNull();
    expect(parseModelUsage({})).toBeNull();
    expect(parseModelUsage({ x_time: [], tokensUsage: [] })).toBeNull();
    expect(parseModelUsage({ x_time: ["2026-09-01 08:00"] })).toBeNull();
  });

  it("rejects non-string timestamps instead of misaligning buckets", () => {
    expect(
      parseModelUsage({
        x_time: ["2026-09-01 08:00", null, "2026-09-01 10:00"],
        tokensUsage: [100, 200, 300],
        modelCallCount: [1, 2, 3],
      }),
    ).toBeNull();
  });

  it("parses buckets, coerces nulls, skips unnamed models", () => {
    const u = parseModelUsage(fixture);
    expect(u).not.toBeNull();
    expect(u!.xTime).toHaveLength(4);
    expect(u!.tokens).toEqual([100, 0, 300, 50]);
    expect(u!.calls).toEqual([1, 2, 3, 4]);
    expect(u!.totalTokens).toBe(450);
    expect(u!.totalCalls).toBe(10);
    expect(u!.models).toEqual([
      { name: "GLM-5.3", totalTokens: 400 },
      { name: "GLM-5.3-Flash", totalTokens: 50 },
    ]);
  });

  it("truncates mismatched array lengths and fills missing calls with zeros", () => {
    const u = parseModelUsage({
      x_time: ["2026-09-01 08:00", "2026-09-01 09:00", "2026-09-01 10:00"],
      tokensUsage: [5, 7],
    });
    expect(u!.xTime).toHaveLength(2);
    expect(u!.tokens).toEqual([5, 7]);
    expect(u!.calls).toEqual([0, 0]);
  });

  it("falls back to array sums when totalUsage is absent", () => {
    const u = parseModelUsage({ x_time: ["2026-09-01 08:00"], tokensUsage: [12], modelCallCount: [3] });
    expect(u!.totalTokens).toBe(12);
    expect(u!.totalCalls).toBe(3);
  });

  it("honors explicitly declared zero totals", () => {
    const u = parseModelUsage({
      x_time: ["2026-09-01 08:00"],
      tokensUsage: [12],
      modelCallCount: [3],
      totalUsage: { totalTokensUsage: 0, totalModelCallCount: 0 },
    });
    expect(u!.totalTokens).toBe(0);
    expect(u!.totalCalls).toBe(0);
  });
});

describe("dailySeries", () => {
  it("aggregates per day with MM-DD labels in first-seen order", () => {
    const u = parseModelUsage(fixture)!;
    expect(dailySeries(u)).toEqual([
      { label: "08-31", tokens: 100, calls: 3 },
      { label: "09-01", tokens: 350, calls: 7 },
    ]);
  });
});

describe("latestDaySeries", () => {
  it("keeps only buckets of the last day with HH:mm labels", () => {
    const u = parseModelUsage(fixture)!;
    expect(latestDaySeries(u)).toEqual([
      { label: "08:00", tokens: 300, calls: 3 },
      { label: "09:00", tokens: 50, calls: 4 },
    ]);
  });
});

describe("peakHour", () => {
  it("returns the max token bucket with its label", () => {
    const u = parseModelUsage(fixture)!;
    expect(peakHour(u)).toEqual({ tokens: 300, label: "09-01 08:00" });
  });

  it("returns null when all buckets are zero", () => {
    const u = parseModelUsage({ x_time: ["2026-09-01 08:00"], tokensUsage: [0] })!;
    expect(peakHour(u)).toBeNull();
  });
});
