import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, safeEqualStr } from "./crypto";

describe("crypto", () => {
  it("round-trips secrets", () => {
    process.env.APP_ENCRYPTION_KEY = "test-master-key";
    const cipher = encryptSecret("hello-世界-secret");
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(decryptSecret(cipher)).toBe("hello-世界-secret");
  });

  it("uses a fresh salt per encryption", () => {
    process.env.APP_ENCRYPTION_KEY = "test-master-key";
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    process.env.APP_ENCRYPTION_KEY = "test-master-key";
    const cipher = encryptSecret("payload");
    const blob = Buffer.from(cipher.slice(3), "base64");
    blob[blob.length - 1] ^= 1;
    expect(() => decryptSecret("v1:" + blob.toString("base64"))).toThrow();
  });

  it("fails fast when APP_ENCRYPTION_KEY is empty", () => {
    const saved = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = "";
    expect(() => encryptSecret("x")).toThrow(/APP_ENCRYPTION_KEY/);
    process.env.APP_ENCRYPTION_KEY = saved;
  });

  it("cannot decrypt under a different master key", () => {
    process.env.APP_ENCRYPTION_KEY = "key-one";
    const cipher = encryptSecret("secret");
    process.env.APP_ENCRYPTION_KEY = "key-two";
    expect(() => decryptSecret(cipher)).toThrow();
  });

  it("safeEqualStr is constant-shape and correct", () => {
    expect(safeEqualStr("abc", "abc")).toBe(true);
    expect(safeEqualStr("abc", "abd")).toBe(false);
    expect(safeEqualStr("abc", "abcd")).toBe(false);
  });
});
