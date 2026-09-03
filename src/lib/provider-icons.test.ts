import { describe, expect, it } from "vitest";
import { BUILTIN_ADAPTERS } from "@/server/adapters/registry";
import { PROVIDER_ICONS, providerIcon } from "./provider-icons";

describe("providerIcon", () => {
  it("covers every builtin adapter id with at least one path", () => {
    for (const adapter of BUILTIN_ADAPTERS) {
      const icon = providerIcon(adapter.id);
      expect(icon, adapter.id).toBeDefined();
      expect(icon!.paths.length, adapter.id).toBeGreaterThan(0);
    }
  });

  it("falls back for unknown and custom ids", () => {
    expect(providerIcon(undefined)).toBeUndefined();
    expect(providerIcon("custom:acme")).toBeUndefined();
    expect(providerIcon("not-a-provider")).toBeUndefined();
  });

  it("keeps the lookup table keyed only by adapter ids", () => {
    const adapterIds = new Set(BUILTIN_ADAPTERS.map((a) => a.id));
    expect(Object.keys(PROVIDER_ICONS).every((id) => adapterIds.has(id))).toBe(true);
  });
});
