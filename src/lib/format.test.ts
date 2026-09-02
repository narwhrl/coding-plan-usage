import { describe, expect, it } from "vitest";
import type { Window } from "./types";
import {
  compactNumber,
  monogram,
  quotaTone,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
} from "./format";

function window(overrides: Partial<Window> = {}): Window {
  return { kind: "daily", unit: "tokens", ...overrides };
}

const t = Object.assign((key: string) => key, {
  has: (key: string) => key === "window.daily" || key === "unit.tokens",
});

describe("compactNumber", () => {
  it("keeps integers and shortens large magnitudes", () => {
    expect(compactNumber(12)).toBe("12");
    expect(compactNumber(12_500)).toBe("12.5K");
    expect(compactNumber(1_230_000)).toBe("1.23M");
    expect(compactNumber(Number.NaN)).toBe("—");
  });
});

describe("windowPctText / windowAmountText", () => {
  it("does not append a percent unit onto a percentage window", () => {
    const percent = window({ unit: "percent", remainingPct: 45, remaining: 45, total: 100 });
    expect(windowPctText(percent)).toBe("45%");
    expect(windowAmountText(percent, "%")).toBeNull();
  });

  it("renders remaining/total for absolute windows", () => {
    const tokens = window({ remaining: 12_500, total: 40_000, remainingPct: 30 });
    expect(windowPctText(tokens)).toBe("30%");
    expect(windowAmountText(tokens, "tokens")).toBe("12.5K / 40.0K tokens");
  });

  it("falls back to used/total when remaining is absent", () => {
    expect(windowAmountText(window({ used: 80, total: 100 }), "credits")).toBe("80 / 100 credits");
  });
});

describe("quotaTone", () => {
  it("grades critical below the warn threshold and warning below twice that (capped at 50%)", () => {
    expect(quotaTone(10, 20)).toBe("critical");
    expect(quotaTone(30, 20)).toBe("warning");
    expect(quotaTone(60, 20)).toBe("normal");
    expect(quotaTone(55, 30)).toBe("normal");
    expect(quotaTone(undefined, 20)).toBe("normal");
  });
});

describe("windowName / unitName", () => {
  it("uses label, then a present catalog key, then the raw kind", () => {
    expect(windowName({ kind: "daily", label: "Custom" }, t)).toBe("Custom");
    expect(windowName({ kind: "daily" }, t)).toBe("window.daily");
    expect(windowName({ kind: "custom-kind" }, t)).toBe("custom-kind");
    expect(unitName("tokens", t)).toBe("unit.tokens");
    expect(unitName("widgets", t)).toBe("widgets");
  });
});

describe("monogram", () => {
  it("takes the first two letters, including CJK", () => {
    expect(monogram("Claude")).toBe("CL");
    expect(monogram("智谱 GLM")).toBe("智谱");
    expect(monogram("!!")).toBe("!!");
  });
});
