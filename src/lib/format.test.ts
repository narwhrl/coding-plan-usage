import { describe, expect, it } from "vitest";
import {
  compactNumber,
  countdownText,
  quotaTone,
  relativeTimeText,
  resetText,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
  type Translate,
} from "./format";
import type { Window } from "./types";

/** 词条替身：返回 "key(a=1)" 便于断言取到了哪个词条。 */
function makeT(known: string[]): Translate {
  const t = ((key: string, values?: Record<string, string | number | Date>) => {
    const args = values
      ? Object.entries(values)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(",")
      : "";
    return args ? `${key}(${args})` : key;
  }) as Translate;
  t.has = (key: string) => known.includes(key);
  return t;
}

const win = (over: Partial<Window> = {}): Window => ({ kind: "5h", unit: "tokens", ...over });

describe("compactNumber", () => {
  it("scales by magnitude and trims trailing zeros", () => {
    expect(compactNumber(1_234_567_890)).toBe("1.23B");
    expect(compactNumber(1_234_567)).toBe("1.23M");
    expect(compactNumber(12_345)).toBe("12.3K");
    expect(compactNumber(999)).toBe("999");
    expect(compactNumber(1.5)).toBe("1.5");
    expect(compactNumber(Number.NaN)).toBe("—");
  });
});

describe("windowPctText", () => {
  it("renders at the requested precision, null when absent", () => {
    expect(windowPctText(win({ remainingPct: 8.04 }))).toBe("8%");
    expect(windowPctText(win({ remainingPct: 8.04 }), 1)).toBe("8.0%");
    expect(windowPctText(win())).toBeNull();
  });
});

describe("windowAmountText", () => {
  it("suppresses percent-unit windows so the percentage is not printed twice", () => {
    expect(windowAmountText(win({ unit: "percent", remainingPct: 45 }), "%")).toBeNull();
  });

  it("reads as remaining/total whenever remaining is known", () => {
    expect(windowAmountText(win({ remaining: 9.4 }), "USD")).toBe("9.4 USD");
    expect(windowAmountText(win({ remaining: 9.4, total: 20 }), "USD")).toBe("9.4 / 20 USD");
    expect(windowAmountText(win({ remaining: 3, used: 7, total: 10 }), "USD")).toBe("3 / 10 USD");
  });

  it("falls back to used/total, marks an unknown total, drops an empty unit", () => {
    expect(windowAmountText(win({ used: 7, total: 10 }), "USD")).toBe("7 / 10 USD");
    expect(windowAmountText(win({ used: 7 }), "")).toBe("7 / ?");
  });

  it("returns null when only a percentage is known", () => {
    expect(windowAmountText(win({ remainingPct: 45 }), "tokens")).toBeNull();
  });
});

describe("quotaTone", () => {
  it("grades against the warn threshold and a doubled soft band", () => {
    expect(quotaTone(8, 20)).toBe("critical");
    expect(quotaTone(20, 20)).toBe("warning");
    expect(quotaTone(39, 20)).toBe("warning");
    expect(quotaTone(40, 20)).toBe("normal");
    expect(quotaTone(undefined, 20)).toBe("normal");
  });

  it("caps the soft band at 50% for high thresholds", () => {
    expect(quotaTone(55, 40)).toBe("normal");
    expect(quotaTone(49, 40)).toBe("warning");
  });
});

describe("countdownText", () => {
  const t = makeT([]);

  it("picks a unit by distance and clamps the past to zero", () => {
    const now = Date.now();
    expect(countdownText(new Date(now + 30 * 60_000).toISOString(), t)).toBe("inMinutes(count=30)");
    expect(countdownText(new Date(now + 5 * 3_600_000).toISOString(), t)).toBe("inHours(count=5)");
    expect(countdownText(new Date(now + 5 * 86_400_000).toISOString(), t)).toBe("inDays(count=5)");
    expect(countdownText(new Date(now - 60_000).toISOString(), t)).toBe("inMinutes(count=0)");
  });

  it("returns null for missing or unparsable input", () => {
    expect(countdownText(null, t)).toBeNull();
    expect(countdownText("not-a-date", t)).toBeNull();
  });
});

describe("resetText", () => {
  const t = makeT([]);

  it("counts down to a future reset and looks back at a past one", () => {
    const now = Date.now();
    expect(resetText(new Date(now + 90 * 60_000).toISOString(), t)).toBe("inHours(count=2)");
    expect(resetText(new Date(now - 3 * 3_600_000).toISOString(), t)).toBe("ago(time=hours(count=3))");
  });

  it("returns null for missing or unparsable input", () => {
    expect(resetText(null, t)).toBeNull();
    expect(resetText("not-a-date", t)).toBeNull();
  });
});

describe("relativeTimeText", () => {
  const t = makeT([]);

  it("localizes instead of hardcoding English suffixes", () => {
    const now = Date.now();
    expect(relativeTimeText(new Date(now).toISOString(), t)).toBe("justNow");
    expect(relativeTimeText(new Date(now - 5 * 60_000).toISOString(), t)).toBe("ago(time=minutes(count=5))");
    expect(relativeTimeText(new Date(now - 3 * 3_600_000).toISOString(), t)).toBe("ago(time=hours(count=3))");
    expect(relativeTimeText(new Date(now - 2 * 86_400_000).toISOString(), t)).toBe("ago(time=days(count=2))");
    expect(relativeTimeText(null, t)).toBeNull();
  });
});

describe("windowName / unitName", () => {
  const t = makeT(["window.5h", "unit.tokens"]);

  it("prefers the adapter label, then the message, then the raw key", () => {
    expect(windowName({ kind: "5h", label: "Session" }, t)).toBe("Session");
    expect(windowName({ kind: "5h" }, t)).toBe("window.5h");
    expect(windowName({ kind: "custom-bucket" }, t)).toBe("custom-bucket");
    expect(unitName("tokens", t)).toBe("unit.tokens");
    expect(unitName("widgets", t)).toBe("widgets");
  });
});
