import { describe, expect, it } from "vitest";
import { computeBurnRate, type BurnSample } from "./burn-rate";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

/** 每小时一个样本，pcts[0] 是最早的点。 */
function hourly(pcts: number[], extra?: Partial<BurnSample["windows"][number]>): BurnSample[] {
  const last = pcts.length - 1;
  return pcts.map((pct, index) => ({
    fetchedAt: hoursAgo(last - index),
    windows: [{ kind: "weekly", unit: "tokens", remainingPct: pct, ...extra }],
  }));
}

describe("computeBurnRate", () => {
  it("measures a steady decline and projects exhaustion", () => {
    // 24 小时从 100% 匀速降到 52% → 2 个百分点/小时，剩 52% 还能撑 26 小时。
    const samples = hourly(Array.from({ length: 25 }, (_, i) => 100 - i * 2));
    const burn = computeBurnRate(samples, { now: NOW })!;

    expect(burn.pctPerHour).toBeCloseTo(2, 6);
    expect(burn.currentPct).toBe(52);
    expect(burn.samples).toBe(25);
    expect(Date.parse(burn.exhaustsAt!) - NOW.getTime()).toBeCloseTo(26 * 3_600_000, -3);
  });

  it("ignores reset jumps instead of counting them as negative usage", () => {
    // 30% → 重置回 100% → 再降到 88%：只有下降段计入，速率不能被跳变污染。
    const samples = hourly([36, 33, 30, 100, 97, 94, 91, 88]);
    const burn = computeBurnRate(samples, { now: NOW })!;

    expect(burn.pctPerHour).toBeGreaterThan(0);
    expect(burn.pctPerHour).toBeCloseTo(3, 6);
    expect(burn.currentPct).toBe(88);
  });

  it("returns null when there are too few samples", () => {
    expect(computeBurnRate(hourly([80, 60]), { now: NOW })).toBeNull();
  });

  it("returns null when the observed span is shorter than an hour", () => {
    const samples: BurnSample[] = [0, 10, 20].map((minutes) => ({
      fetchedAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
      windows: [{ kind: "weekly", remainingPct: 90 - minutes / 10 }],
    }));
    expect(computeBurnRate(samples, { now: NOW })).toBeNull();
  });

  it("reports a zero rate with no projection when the quota is flat", () => {
    const burn = computeBurnRate(hourly([70, 70, 70, 70]), { now: NOW })!;
    expect(burn.pctPerHour).toBe(0);
    expect(burn.exhaustsAt).toBeNull();
    expect(burn.beforeReset).toBeNull();
  });

  it("flags whether exhaustion lands before the window reset", () => {
    const fast = computeBurnRate(hourly([100, 80, 60, 40], { resetAt: hoursAgo(-48) }), { now: NOW })!;
    // 20 点/小时、剩 40% → 2 小时后耗尽，远早于 48 小时后的重置。
    expect(fast.beforeReset).toBe(true);

    const slow = computeBurnRate(hourly([100, 99.5, 99, 98.5], { resetAt: hoursAgo(-2) }), { now: NOW })!;
    expect(slow.beforeReset).toBe(false);
  });

  it("tracks the tightest window of the latest sample across multiple lanes", () => {
    const samples: BurnSample[] = [0, 1, 2, 3].map((index) => ({
      fetchedAt: hoursAgo(3 - index),
      windows: [
        { kind: "weekly", remainingPct: 90 - index },
        { kind: "5h", remainingPct: 60 - index * 10 },
      ],
    }));
    const burn = computeBurnRate(samples, { now: NOW })!;
    // 最后一条样本里 5h 车道最紧（30%），速率应来自它而不是 weekly。
    expect(burn.currentPct).toBe(30);
    expect(burn.pctPerHour).toBeCloseTo(10, 6);
  });

  it("skips minor lanes when picking the target window", () => {
    const samples: BurnSample[] = [0, 1, 2, 3].map((index) => ({
      fetchedAt: hoursAgo(3 - index),
      windows: [
        { kind: "weekly", remainingPct: 90 - index },
        { kind: "daily", label: "model-a", remainingPct: 10 - index, minor: true },
      ],
    }));
    const burn = computeBurnRate(samples, { now: NOW })!;
    expect(burn.currentPct).toBe(87);
  });

  it("returns null when no window carries a percentage", () => {
    const samples: BurnSample[] = [0, 1, 2, 3].map((index) => ({
      fetchedAt: hoursAgo(3 - index),
      windows: [{ kind: "balance", unit: "usd" }],
    }));
    expect(computeBurnRate(samples, { now: NOW })).toBeNull();
  });

  it("drops samples outside the look-back window", () => {
    const stale = hourly([100, 90, 80]).map((sample) => ({
      ...sample,
      fetchedAt: new Date(Date.parse(sample.fetchedAt) - 10 * 86_400_000).toISOString(),
    }));
    expect(computeBurnRate(stale, { now: NOW })).toBeNull();
  });
});
