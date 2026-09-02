import { describe, expect, it } from "vitest";
import { sparkSlots } from "./spark-strip";

describe("sparkSlots", () => {
  const now = new Date("2026-09-02T10:00:00Z");

  it("固定 7 个日槽，最右为今天", () => {
    const slots = sparkSlots([], now);
    expect(slots).toHaveLength(7);
    expect(slots[6].day).toBe("2026-09-02");
    expect(slots[0].day).toBe("2026-08-27");
  });

  it("有数据的日期填值，缺测为空槽", () => {
    const slots = sparkSlots([{ d: "2026-09-01", pct: 42 }], now);
    expect(slots[5]).toEqual({ day: "2026-09-01", pct: 42 });
    expect(slots[6].pct).toBeNull();
  });

  it("pct 截断到 0–100", () => {
    const slots = sparkSlots([{ d: "2026-09-02", pct: 130 }], now);
    expect(slots[6].pct).toBe(100);
  });

  it("窗口外的点被忽略", () => {
    const slots = sparkSlots([{ d: "2026-08-01", pct: 10 }], now);
    expect(slots.every((s) => s.pct === null)).toBe(true);
  });
});
