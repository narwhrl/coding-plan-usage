import { describe, it, expect } from "vitest";
import { dailyTightestSeries, parseWindows } from "./spark";

const NOW = new Date("2026-09-02T12:00:00Z");
describe("parseWindows", () => {
  it("keeps only object window entries", () => {
    expect(parseWindows('[null, 1, {}, {"remainingPct": 25}]')).toEqual([{ remainingPct: 25 }]);
  });

  it("returns an empty array for invalid, non-array, or null input", () => {
    expect(parseWindows("not-json")).toEqual([]);
    expect(parseWindows("{}")).toEqual([]);
    expect(parseWindows(null)).toEqual([]);
  });
});


describe("dailyTightestSeries", () => {
  it("takes the min across windows in one row", () => {
    const points = dailyTightestSeries(
      [{ fetchedAt: "2026-09-01T10:00:00Z", windows: [{ remainingPct: 60 }, { remainingPct: 42 }, {}] }],
      NOW,
    );
    expect(points).toEqual([{ d: "2026-09-01", pct: 42 }]);
  });

  it("takes the min across rows on the same day", () => {
    const points = dailyTightestSeries(
      [
        { fetchedAt: "2026-09-01T08:00:00Z", windows: [{ remainingPct: 70 }] },
        { fetchedAt: "2026-09-01T20:00:00Z", windows: [{ remainingPct: 35 }] },
      ],
      NOW,
    );
    expect(points).toEqual([{ d: "2026-09-01", pct: 35 }]);
  });

  it("omits days without data instead of zero-filling", () => {
    const points = dailyTightestSeries(
      [
        { fetchedAt: "2026-08-31T10:00:00Z", windows: [{ remainingPct: 50 }] },
        { fetchedAt: "2026-09-02T09:00:00Z", windows: [{ remainingPct: 20 }] },
      ],
      NOW,
    );
    expect(points).toEqual([
      { d: "2026-08-31", pct: 50 },
      { d: "2026-09-02", pct: 20 },
    ]);
  });

  it("excludes rows outside the 7-day window (both older and future)", () => {
    const points = dailyTightestSeries(
      [
        { fetchedAt: "2026-08-26T23:59:59Z", windows: [{ remainingPct: 10 }] },
        { fetchedAt: "2026-08-27T00:00:00Z", windows: [{ remainingPct: 30 }] },
        { fetchedAt: "2026-09-01T10:00:00Z", windows: [{ remainingPct: 60 }] },
        { fetchedAt: "2026-09-03T00:00:01Z", windows: [{ remainingPct: 5 }] },
        { fetchedAt: "2026-09-02T13:00:00Z", windows: [{ remainingPct: 4 }] },
        { fetchedAt: "not-a-date", windows: [{ remainingPct: 3 }] },
      ],
      NOW,
    );
    expect(points).toEqual([
      { d: "2026-08-27", pct: 30 },
      { d: "2026-09-01", pct: 60 },
    ]);
  });

  it("returns [] when no row has a numeric remainingPct", () => {
    const points = dailyTightestSeries(
      [
        { fetchedAt: "2026-09-01T10:00:00Z", windows: [{}] },
        { fetchedAt: "2026-09-01T11:00:00Z", windows: [] },
      ],
      NOW,
    );
    expect(points).toEqual([]);
  });

  it("sorts output ascending by day", () => {
    const points = dailyTightestSeries(
      [
        { fetchedAt: "2026-09-02T01:00:00Z", windows: [{ remainingPct: 15 }] },
        { fetchedAt: "2026-08-29T01:00:00Z", windows: [{ remainingPct: 80 }] },
        { fetchedAt: "2026-09-01T01:00:00Z", windows: [{ remainingPct: 45 }] },
      ],
      NOW,
    );
    expect(points.map((p) => p.d)).toEqual(["2026-08-29", "2026-09-01", "2026-09-02"]);
  });

  it("ignores minor windows when taking the daily min", () => {
    const points = dailyTightestSeries(
      [{ fetchedAt: "2026-09-01T10:00:00Z", windows: [{ remainingPct: 60 }, { minor: true, remainingPct: 2 }] }],
      NOW,
    );
    expect(points).toEqual([{ d: "2026-09-01", pct: 60 }]);
  });
});
