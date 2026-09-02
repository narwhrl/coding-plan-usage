import { describe, expect, it } from "vitest";
import { compactNumber, relativeTime, windowValueText } from "./format";
import type { Window } from "./types";

const baseWindow: Window = {
  kind: "weekly",
  unit: "percent",
  remainingPct: 45,
  resetAt: null,
};

describe("windowValueText", () => {
  it("returns only numeric values, never repeats the percentage", () => {
    expect(windowValueText(baseWindow, "%")).toBe("");
  });

  it("appends non-percent units to remaining", () => {
    const w: Window = { ...baseWindow, unit: "tokens", remaining: 42_000, remainingPct: 42 };
    expect(windowValueText(w, "tokens")).toBe("42.0K tokens");
  });

  it("renders used/total alongside remaining", () => {
    const w: Window = { ...baseWindow, unit: "usd", remaining: 5, used: 15, total: 20 };
    expect(windowValueText(w, "USD")).toBe("5 · 15 / 20 USD");
  });
});

describe("compactNumber", () => {
  it("compacts large numbers", () => {
    expect(compactNumber(1_234_567)).toBe("1.23M");
    expect(compactNumber(12_345)).toBe("12.3K");
    expect(compactNumber(42)).toBe("42");
  });
});

describe("relativeTime", () => {
  it("localizes via Intl.RelativeTimeFormat", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinAgo, "zh")).toBe("5分钟前");
    expect(relativeTime(fiveMinAgo, "en")).toBe("5 minutes ago");
  });

  it("handles invalid input", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime("not-a-date")).toBe("—");
  });
});
