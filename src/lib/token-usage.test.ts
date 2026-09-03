import { describe, it, expect } from "vitest";
import { parseTokenUsage } from "./token-usage";

const valid = {
  lastDayTokens: 1200,
  weekTokens: 1700,
  monthTokens: 2500,
  days: [
    { d: "2026-08-30", tokens: 500 },
    { d: "2026-08-29", tokens: 800 },
    { d: "2026-08-31", tokens: 1200 },
  ],
};

describe("parseTokenUsage", () => {
  it("passes a valid object through with days sorted ascending", () => {
    expect(parseTokenUsage(valid)).toEqual({
      lastDayTokens: 1200,
      weekTokens: 1700,
      monthTokens: 2500,
      days: [
        { d: "2026-08-29", tokens: 800 },
        { d: "2026-08-30", tokens: 500 },
        { d: "2026-08-31", tokens: 1200 },
      ],
    });
  });

  it("accepts an empty days array", () => {
    expect(parseTokenUsage({ ...valid, days: [] })).toEqual({
      lastDayTokens: 1200,
      weekTokens: 1700,
      monthTokens: 2500,
      days: [],
    });
  });

  it("returns null when a stat key is missing, NaN, or negative", () => {
    expect(parseTokenUsage({ weekTokens: 1, monthTokens: 2, days: [] })).toBeNull();
    expect(parseTokenUsage({ lastDayTokens: NaN, weekTokens: 1, monthTokens: 2, days: [] })).toBeNull();
    expect(parseTokenUsage({ lastDayTokens: -1, weekTokens: 1, monthTokens: 2, days: [] })).toBeNull();
    expect(parseTokenUsage({ lastDayTokens: "1200", weekTokens: 1, monthTokens: 2, days: [] })).toBeNull();
    expect(parseTokenUsage({ lastDayTokens: Infinity, weekTokens: 1, monthTokens: 2, days: [] })).toBeNull();
  });

  it("returns null for non-objects and arrays", () => {
    expect(parseTokenUsage(null)).toBeNull();
    expect(parseTokenUsage(undefined)).toBeNull();
    expect(parseTokenUsage("nope")).toBeNull();
    expect(parseTokenUsage(42)).toBeNull();
    expect(parseTokenUsage([valid])).toBeNull();
  });

  it("returns null when days is not an array", () => {
    expect(parseTokenUsage({ ...valid, days: "2026-08-31" })).toBeNull();
    expect(parseTokenUsage({ ...valid, days: null })).toBeNull();
  });

  it("drops day elements that are malformed, keeping valid ones", () => {
    const input = {
      ...valid,
      days: [
        { d: "2026-08-31", tokens: 10 },
        { tokens: 20 }, // 缺 d
        { d: "", tokens: 20 }, // 空 d
        { d: "2026-08-30", tokens: -5 }, // 负 tokens
        { d: "2026-08-29", tokens: "30" }, // tokens 非数值
        { d: "2026-08-28" }, // 缺 tokens
        "junk", // 非对象元素
        null,
      ],
    };
    expect(parseTokenUsage(input)?.days).toEqual([{ d: "2026-08-31", tokens: 10 }]);
  });
});
