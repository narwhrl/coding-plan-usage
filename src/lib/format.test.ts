import { describe, expect, it } from "vitest";
import {
  quotaTone,
  windowName,
  unitName,
  windowPctText,
  windowAmountText,
  resetText,
  type Translator,
} from "./format";
import type { Window } from "./types";

/** 模拟 next-intl：只知道 window.5h / window.weekly 与 unit.tokens / unit.percent。 */
const dict: Record<string, string> = {
  "window.5h": "5 小时窗口",
  "window.weekly": "周额度",
  "unit.tokens": "tokens",
  "unit.percent": "%",
};
const t = Object.assign(
  (key: string) => dict[key] ?? key,
  { has: (key: string) => key in dict },
) as Translator;

const w = (overrides: Partial<Window>): Window => ({ kind: "5h", unit: "percent", ...overrides });

describe("quotaTone", () => {
  it("低于阈值 → critical", () => {
    expect(quotaTone(9, 20)).toBe("critical");
  });
  it("介于阈值与两倍阈值之间 → warning", () => {
    expect(quotaTone(25, 20)).toBe("warning");
  });
  it("两倍阈值封顶 50%：阈值 30 时 55% 是 normal", () => {
    expect(quotaTone(55, 30)).toBe("normal");
    expect(quotaTone(45, 30)).toBe("warning");
  });
  it("其余 → normal", () => {
    expect(quotaTone(80, 20)).toBe("normal");
  });
});

describe("windowName / unitName", () => {
  it("自带 label 优先", () => {
    expect(windowName({ kind: "5h", label: "会话" }, t)).toBe("会话");
  });
  it("词条存在时用词条", () => {
    expect(windowName({ kind: "weekly" }, t)).toBe("周额度");
  });
  it("词条缺失时回退 kind 原文（自定义提供商）", () => {
    expect(windowName({ kind: "custom-kind" }, t)).toBe("custom-kind");
    expect(unitName("credits-x", t)).toBe("credits-x");
  });
});

describe("windowPctText / windowAmountText", () => {
  it("percent 单位的绝对量为 null，避免「45% 45%」", () => {
    const win = w({ remainingPct: 45, remaining: 45 });
    expect(windowPctText(win)).toBe("45%");
    expect(windowAmountText(win, "%")).toBeNull();
  });
  it("tokens 单位同时给出百分比与绝对量", () => {
    const win = w({ unit: "tokens", remainingPct: 45, remaining: 45000, used: 55000, total: 100000 });
    expect(windowAmountText(win, "tokens")).toBe("45.0K · 55.0K / 100.0K tokens");
  });
  it("无任何数值时绝对量为 null", () => {
    expect(windowAmountText(w({ unit: "tokens" }), "tokens")).toBeNull();
    expect(windowPctText(w({}))).toBeNull();
  });
});

describe("resetText", () => {
  const timeT = ((key: string, values?: Record<string, number>) =>
    `${key}:${values?.count ?? ""}`) as (key: string, values?: Record<string, string | number | Date>) => string;

  it("未来时刻 → 倒计时", () => {
    const future = new Date(Date.now() + 30 * 60000).toISOString();
    expect(resetText(future, timeT)).toBe("inMinutes:30");
  });
  it("已过时刻 → 相对时间（采集间隔内 resetAt 可能已过期）", () => {
    const past = new Date(Date.now() - 30 * 60000).toISOString();
    expect(resetText(past, timeT)).toBe("minutesAgo:30");
  });
  it("空值 → null", () => {
    expect(resetText(null, timeT)).toBeNull();
    expect(resetText("not-a-date", timeT)).toBeNull();
  });
});
