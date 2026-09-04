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
  windowPrimaryText,
  fieldLabel,
  fieldPlaceholder,
  regionName,
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

describe("windowPrimaryText", () => {
  const t = makeT(["unit.usd", "unit.cny"]);

  it("prefers a remaining percentage, then a prepaid remaining amount", () => {
    expect(windowPrimaryText(win({ remainingPct: 40, remaining: 8 }), t)).toBe("40%");
    expect(windowPrimaryText(win({ remaining: 12.4, unit: "cny" }), t)).toBe("12.4 unit.cny");
    expect(windowPrimaryText(win(), t)).toBeNull();
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
  const t = makeT([
    "window.5h",
    "window.weekly",
    "window.monthly",
    "window.mcp",
    "window.premium",
    "window.chat",
    "window.balance",
    "window.cursor_models",
    "window.other_models",
    "window.grok_bot",
    "window.withCurrency",
    "unit.tokens",
  ]);

  it("uses the kind message for known windows and ignores English synonym labels", () => {
    expect(windowName({ kind: "5h", label: "Token usage (5h)" }, t)).toBe("window.5h");
    expect(windowName({ kind: "weekly", label: "Weekly quota" }, t)).toBe("window.weekly");
    expect(windowName({ kind: "weekly", label: "Weekly usage" }, t)).toBe("window.weekly");
    expect(windowName({ kind: "credits", label: "Weekly" }, t)).toBe("window.weekly");
    expect(windowName({ kind: "5h" }, t)).toBe("window.5h");
    expect(windowName({ kind: "mcp" }, t)).toBe("window.mcp");
    expect(windowName({ kind: "cursor_models", label: "Cursor Models" }, t)).toBe("window.cursor_models");
    expect(windowName({ kind: "other_models", label: "Other Models" }, t)).toBe("window.other_models");
    expect(windowName({ kind: "grok_bot", label: "Grok Bot" }, t)).toBe("window.grok_bot");
    expect(windowName({ kind: "custom-bucket" }, t)).toBe("custom-bucket");
  });

  it("keeps distinctive labels and localizes currency suffixes", () => {
    expect(windowName({ kind: "daily", label: "Hailuo-2.3" }, t)).toBe("Hailuo-2.3");
    expect(windowName({ kind: "5h", label: "GPT-5.3-Codex-Spark", minor: true }, t)).toBe("GPT-5.3-Codex-Spark");
    expect(windowName({ kind: "5h", label: "GPT-5.3-Codex-Spark" }, t)).toBe("window.5h");
    expect(windowName({ kind: "requests", label: "Premium requests" }, t)).toBe("window.premium");
    expect(windowName({ kind: "requests", label: "Chat" }, t)).toBe("window.chat");
    expect(windowName({ kind: "balance", label: "Balance (CNY)" }, t)).toBe("window.withCurrency(name=window.balance,currency=CNY)");
    expect(windowName({ kind: "balance", label: "CNY" }, t)).toBe("window.withCurrency(name=window.balance,currency=CNY)");
    expect(unitName("tokens", t)).toBe("unit.tokens");
    expect(unitName("widgets", t)).toBe("widgets");
  });
});

describe("fieldLabel / fieldPlaceholder / regionName", () => {
  const t = makeT([
    "fields.apiKey",
    "fields.cursor.sessionToken",
    "fields.cursor.sessionTokenPlaceholder",
    "region.zai",
  ]);

  it("prefers provider-specific field copy, then the generic key", () => {
    expect(fieldLabel("glm", { key: "apiKey", label: "API Key" }, t)).toBe("fields.apiKey");
    expect(fieldLabel("cursor", { key: "sessionToken", label: "WorkosCursorSessionToken" }, t)).toBe(
      "fields.cursor.sessionToken",
    );
    expect(fieldLabel("custom", { key: "other", label: "Secret" }, t)).toBe("Secret");
    expect(fieldPlaceholder("cursor", { key: "sessionToken", placeholder: "cookie" }, t)).toBe(
      "fields.cursor.sessionTokenPlaceholder",
    );
    expect(fieldPlaceholder("glm", { key: "apiKey", placeholder: "sk-..." }, t)).toBe("sk-...");
  });

  it("maps known region URLs and leaves unknown hosts alone", () => {
    expect(regionName({ label: "Z.ai (Global)", value: "https://api.z.ai" }, t)).toBe("region.zai");
    expect(regionName({ label: "Other", value: "https://example.com" }, t)).toBe("Other");
  });
});
