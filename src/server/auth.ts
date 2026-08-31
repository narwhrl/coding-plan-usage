import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 访问口令认证：单用户，无注册。
 * ACCESS_PASSWORD 未设置 → isAuthEnabled()=false 全放行。
 * cookie cpu_session = <expMs>.<hmacSHA256(expMs, secret)>，30 天。
 * secret = scrypt(ACCESS_PASSWORD, 'cpu-session-v1', 32)。
 * 不用 middleware（Edge runtime env 内联问题）；守卫在 API route 与 (panel) layout。
 */

export const SESSION_COOKIE = "cpu_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isAuthEnabled(): boolean {
  return (process.env.ACCESS_PASSWORD ?? "").length > 0;
}

function sessionSecret(): Buffer {
  return scryptSync(process.env.ACCESS_PASSWORD ?? "", "cpu-session-v1", 32);
}

function signExpiry(expMs: number): string {
  return createHmac("sha256", sessionSecret()).update(String(expMs)).digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = process.env.ACCESS_PASSWORD ?? "";
  if (!expected) return true; // 未配置口令 → 全放行
  const a = createHmac("sha256", "cpu-pw-check").update(password).digest();
  const b = createHmac("sha256", "cpu-pw-check").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueSessionCookie(): { name: string; value: string; options: Record<string, unknown> } {
  const expMs = Date.now() + SESSION_TTL_MS;
  return {
    name: SESSION_COOKIE,
    value: `${expMs}.${signExpiry(expMs)}`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

export function verifySessionCookie(value: string | undefined): boolean {
  if (!isAuthEnabled()) return true;
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expRaw = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expMs = Number(expRaw);
  if (!Number.isInteger(expMs) || expMs <= Date.now()) return false;
  const expected = signExpiry(expMs);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** (panel) layout 守卫：未过 → redirect('/login') 由调用方执行。 */
export async function isAuthenticated(): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE)?.value);
}

/** API route 守卫：未过 → 401（调用方直接 return）。 */
export async function requireAuth(): Promise<boolean> {
  return isAuthenticated();
}
