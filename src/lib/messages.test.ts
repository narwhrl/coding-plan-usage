import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

/** 中英文案必须一一对应：缺键在 next-intl 里表现为渲染出原始 key。 */
describe("messages", () => {
  const zhKeys = flatten(zh as Tree).sort();
  const enKeys = flatten(en as Tree).sort();

  it("has the same keys in both locales", () => {
    expect(enKeys.filter((key) => !zhKeys.includes(key))).toEqual([]);
    expect(zhKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("has no blank strings", () => {
    for (const [locale, tree] of [
      ["zh", zh],
      ["en", en],
    ] as const) {
      const blanks = flatten(tree as Tree).filter((key) => {
        const value = key
          .split(".")
          .reduce<string | Tree>((node, part) => (node as Tree)[part], tree as Tree);
        return typeof value === "string" && value.trim() === "";
      });
      expect(blanks, locale).toEqual([]);
    }
  });
});
