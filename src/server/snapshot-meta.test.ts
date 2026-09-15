import { describe, expect, it } from "vitest";
import {
  adapterMetaFromRaw,
  carryForwardAdapterMeta,
  extraCardMetaFromRecentRaw,
  needsExtraCardLookback,
} from "./snapshot-meta";

const tokenUsage = { lastDayTokens: 10, weekTokens: 20, monthTokens: 30, days: [] };
const modelUsage = {
  x_time: ["2026-09-01 08:00"],
  tokensUsage: [12],
  modelCallCount: [3],
};

describe("adapterMetaFromRaw", () => {
  it("returns only the adapter meta object", () => {
    const raw = JSON.stringify({
      meta: { modelUsage: [{ name: "glm" }], isAvailable: true },
      responses: { url: "https://api.example/usage", status: 200, body: '{"token":"secret"}' },
    });
    expect(adapterMetaFromRaw(raw)).toEqual({ modelUsage: [{ name: "glm" }], isAvailable: true });
  });

  it("returns null when raw is missing, invalid, or has no meta object", () => {
    expect(adapterMetaFromRaw(null)).toBeNull();
    expect(adapterMetaFromRaw("not-json")).toBeNull();
    expect(adapterMetaFromRaw(JSON.stringify({ responses: { body: "x" } }))).toBeNull();
    expect(adapterMetaFromRaw(JSON.stringify({ meta: "nope" }))).toBeNull();
  });
});

describe("carryForwardAdapterMeta", () => {
  it("fills missing tokenUsage and modelUsage from the previous snapshot", () => {
    const previous = JSON.stringify({ meta: { tokenUsage, modelUsage, isAvailable: true } });
    expect(carryForwardAdapterMeta({ isAvailable: true }, previous)).toEqual({
      isAvailable: true,
      tokenUsage,
      modelUsage,
    });
  });

  it("does not overwrite an explicit null tokenUsage (billing succeeded, no spend)", () => {
    const previous = JSON.stringify({ meta: { tokenUsage } });
    expect(carryForwardAdapterMeta({ tokenUsage: null }, previous)).toEqual({ tokenUsage: null });
  });

  it("returns the current meta unchanged when there is nothing to carry", () => {
    expect(carryForwardAdapterMeta({ isAvailable: true }, null)).toEqual({ isAvailable: true });
    expect(carryForwardAdapterMeta(undefined, null)).toBeUndefined();
  });
});

describe("extraCardMetaFromRecentRaw", () => {
  it("does not look back when lastOk already has parseable cards", () => {
    expect(needsExtraCardLookback({ tokenUsage, modelUsage })).toBe(false);
    expect(
      extraCardMetaFromRecentRaw({ tokenUsage, modelUsage }, [
        { raw: JSON.stringify({ meta: { tokenUsage: { lastDayTokens: 99, weekTokens: 99, monthTokens: 99, days: [] } } }) },
      ]),
    ).toBeUndefined();
  });

  it("does not look back a key the adapter explicitly stored as null", () => {
    expect(needsExtraCardLookback({ tokenUsage: null, modelUsage })).toBe(false);
    expect(
      extraCardMetaFromRecentRaw({ tokenUsage: null }, [{ raw: JSON.stringify({ meta: { tokenUsage } }) }]),
    ).toBeUndefined();
  });

  it("recovers tokenUsage and modelUsage from older snapshots", () => {
    expect(needsExtraCardLookback({})).toBe(true);
    expect(
      extraCardMetaFromRecentRaw({}, [
        { raw: JSON.stringify({ meta: null }) },
        { raw: JSON.stringify({ meta: { tokenUsage, modelUsage } }) },
        { raw: JSON.stringify({ meta: { tokenUsage: { lastDayTokens: 1 } } }) },
      ]),
    ).toEqual({ tokenUsage, modelUsage });
  });
});
