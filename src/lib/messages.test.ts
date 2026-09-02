import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  it("keeps zh and en keys in sync", () => {
    const zh = JSON.parse(readFileSync(join(root, "messages/zh.json"), "utf8"));
    const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8"));
    expect(keys(zh).sort()).toEqual(keys(en).sort());
  });
});
