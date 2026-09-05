import { describe, it, expect } from "vitest";
import { checkPassword, issueSessionCookie, requestIsHttps, verifySessionCookie } from "./auth";

describe("auth", () => {
  it("issues and verifies a session round-trip", () => {
    process.env.ACCESS_PASSWORD = "s3cret";
    const cookie = issueSessionCookie();
    expect(cookie.name).toBe("cpu_session");
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    expect(issueSessionCookie(true).options).toMatchObject({ secure: true });
    expect(verifySessionCookie(cookie.value)).toBe(true);
  });

  it("rejects expired sessions", () => {
    process.env.ACCESS_PASSWORD = "s3cret";
    const cookie = issueSessionCookie();
    const expMs = Number(cookie.value.slice(0, cookie.value.indexOf(".")));
    expect(expMs).toBeGreaterThan(Date.now());
    // 过期 exp 携带原签名 → 校验失败
    expect(verifySessionCookie(`1000.${cookie.value.slice(cookie.value.indexOf(".") + 1)}`)).toBe(false);
  });

  it("rejects signatures from a different secret", () => {
    process.env.ACCESS_PASSWORD = "s3cret";
    const cookie = issueSessionCookie();
    process.env.ACCESS_PASSWORD = "other";
    expect(verifySessionCookie(cookie.value)).toBe(false);
  });

  it("rejects malformed cookie values", () => {
    process.env.ACCESS_PASSWORD = "s3cret";
    expect(verifySessionCookie(undefined)).toBe(false);
    expect(verifySessionCookie("")).toBe(false);
    expect(verifySessionCookie("nodot")).toBe(false);
    expect(verifySessionCookie("abc.def")).toBe(false);
  });

  it("passes everything when ACCESS_PASSWORD unset", () => {
    delete process.env.ACCESS_PASSWORD;
    expect(verifySessionCookie(undefined)).toBe(true);
    expect(checkPassword("anything")).toBe(true);
  });

  it("treats X-Forwarded-Proto and https URLs as secure", () => {
    const httpsReq = {
      headers: new Headers({ "x-forwarded-proto": "https, http" }),
      nextUrl: new URL("http://localhost:3000/api/auth/login"),
    };
    const httpReq = {
      headers: new Headers(),
      nextUrl: new URL("http://localhost:3000/api/auth/login"),
    };
    const directHttps = {
      headers: new Headers(),
      nextUrl: new URL("https://example.test/api/auth/login"),
    };
    expect(requestIsHttps(httpsReq)).toBe(true);
    expect(requestIsHttps(httpReq)).toBe(false);
    expect(requestIsHttps(directHttps)).toBe(true);
  });

  it("checks passwords", () => {
    process.env.ACCESS_PASSWORD = "s3cret";
    expect(checkPassword("s3cret")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
});
