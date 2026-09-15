import { describe, expect, it } from "vitest";
import { adapterMetaFromRaw, carryForwardAdapterMeta, tokenUsageFromRecentRaw } from "./snapshot-meta";

const tokenUsage = { lastDayTokens: 10, weekTokens: 20, monthTokens: 30, days: [] };

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
    const previous = JSON.stringify({ meta: { tokenUsage, modelUsage: { x_time: [] }, isAvailable: true } });
    expect(carryForwardAdapterMeta({ isAvailable: true }, previous)).toEqual({
      isAvailable: true,
      tokenUsage,
      modelUsage: { x_time: [] },
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

describe("tokenUsageFromRecentRaw", () => {
  it("returns the newest parseable tokenUsage", () => {
    expect(
      tokenUsageFromRecentRaw([
        { raw: JSON.stringify({ meta: null }) },
        { raw: JSON.stringify({ meta: { tokenUsage } }) },
        { raw: JSON.stringify({ meta: { tokenUsage: { lastDayTokens: 1 } } }) },
      ]),
    ).toEqual(tokenUsage);
  });
});
