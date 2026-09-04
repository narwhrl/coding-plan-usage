import { describe, expect, it } from "vitest";
import { adapterMetaFromRaw } from "./snapshot-meta";

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
