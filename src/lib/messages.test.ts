import { describe, expect, it } from "vitest";
import zh from "../../messages/zh.json";
import en from "../../messages/en.json";

type Messages = Record<string, unknown>;

function flatten(obj: Messages, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? flatten(value as Messages, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** zh/en 键集合必须一致——缺键的语言会在运行时抛 MISSING_MESSAGE。 */
describe("messages parity", () => {
  it("zh 与 en 键集合一致", () => {
    const zhKeys = flatten(zh).sort();
    const enKeys = flatten(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});
