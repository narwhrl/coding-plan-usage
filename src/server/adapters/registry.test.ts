import { describe, expect, it } from "vitest";
import { adapterBilling, getBuiltinAdapter } from "./registry";

describe("adapterBilling", () => {
  it("marks DeepSeek and OpenRouter as API, subscription adapters as plan", () => {
    expect(adapterBilling(getBuiltinAdapter("deepseek"))).toBe("api");
    expect(adapterBilling(getBuiltinAdapter("openrouter"))).toBe("api");
    expect(adapterBilling(getBuiltinAdapter("glm"))).toBe("plan");
    expect(adapterBilling(getBuiltinAdapter("claude"))).toBe("plan");
  });

  it("treats custom providers as API even without an adapter billing flag", () => {
    expect(adapterBilling(undefined, "custom")).toBe("api");
    expect(adapterBilling(undefined, "builtin")).toBe("plan");
  });
});
