import { describe, expect, it } from "vitest";
import { buildSparkSlots } from "./spark-strip";

describe("buildSparkSlots", () => {
  it("always returns seven UTC day slots with today on the right", () => {
    const now = new Date("2026-09-02T15:00:00Z");
    const slots = buildSparkSlots(
      [
        { d: "2026-08-28", pct: 80 },
        { d: "2026-09-02", pct: 12 },
      ],
      now,
    );

    expect(slots.map((s) => s.day)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
    expect(slots[0]?.pct).toBeNull();
    expect(slots[1]?.pct).toBe(80);
    expect(slots[6]?.pct).toBe(12);
  });

  it("clamps out-of-range percentages and ignores non-finite values", () => {
    const now = new Date("2026-09-02T00:00:00Z");
    const slots = buildSparkSlots(
      [
        { d: "2026-09-02", pct: 140 },
        { d: "2026-09-01", pct: Number.NaN },
      ],
      now,
    );
    expect(slots[6]?.pct).toBe(100);
    expect(slots[5]?.pct).toBeNull();
  });
});
