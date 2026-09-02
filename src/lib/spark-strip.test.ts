import { describe, expect, it } from "vitest";
import { buildSparkSlots } from "./spark-strip";

const NOW = new Date("2026-03-10T08:00:00Z");

describe("buildSparkSlots", () => {
  it("always returns seven slots ending today", () => {
    const slots = buildSparkSlots([], NOW);
    expect(slots).toHaveLength(7);
    expect(slots[0].day).toBe("2026-03-04");
    expect(slots[6].day).toBe("2026-03-10");
    expect(slots.every((slot) => slot.pct === null)).toBe(true);
  });

  it("places each point on its own day and leaves gaps empty", () => {
    const slots = buildSparkSlots(
      [
        { d: "2026-03-05", pct: 80 },
        { d: "2026-03-10", pct: 12 },
      ],
      NOW,
    );
    expect(slots.map((slot) => slot.pct)).toEqual([null, 80, null, null, null, null, 12]);
  });

  it("drops points outside the window", () => {
    const slots = buildSparkSlots(
      [
        { d: "2026-03-01", pct: 90 },
        { d: "2026-03-07", pct: 55 },
      ],
      NOW,
    );
    expect(slots.filter((slot) => slot.pct !== null)).toEqual([{ day: "2026-03-07", pct: 55 }]);
  });

  it("clamps out-of-range percentages and ignores non-finite ones", () => {
    const slots = buildSparkSlots(
      [
        { d: "2026-03-08", pct: 140 },
        { d: "2026-03-09", pct: -20 },
        { d: "2026-03-10", pct: Number.NaN },
      ],
      NOW,
    );
    expect(slots.slice(4).map((slot) => slot.pct)).toEqual([100, 0, null]);
  });
});
