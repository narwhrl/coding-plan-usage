import { z } from "zod";
import { parseDisplayCurrency, type DisplayCurrency } from "@/lib/display-currency";
import {
  formatProxyUrl,
  parseProxyUrl,
  sameProxyEndpoint,
  type ProxyTarget,
} from "@/lib/proxy";
import { decryptSecret, encryptSecret } from "./crypto";

/**
 * 账户 config 入参（API）。proxyUrl 可带用户名密码；落库时密码只进 proxyCipher。
 * 空字符串表示清除代理。
 */
export const AccountConfigInputSchema = z.object({
  intervalMinutes: z.number().int().positive().optional(),
  warnPct: z.number().int().min(0).max(100).optional(),
  baseUrl: z.string().optional(),
  displayCurrency: z.enum(["CNY", "USD"]).optional(),
  proxyUrl: z.string().optional(),
});

export type AccountConfigInput = z.infer<typeof AccountConfigInputSchema>;

/** SQLite accounts.config 允许的键；proxyCipher 为 AES-256-GCM，不得回传。 */
export type StoredAccountConfig = {
  intervalMinutes?: number;
  warnPct?: number;
  baseUrl?: string;
  displayCurrency?: DisplayCurrency;
  demo?: boolean;
  proxyCipher?: string;
};

export type PublicAccountConfig = {
  intervalMinutes?: number;
  warnPct?: number;
  baseUrl?: string;
  displayCurrency?: DisplayCurrency;
  demo?: boolean;
  /** 脱敏后的代理 URL，不含密码。 */
  proxyUrl?: string;
};

export function parseStoredConfig(raw: string): StoredAccountConfig {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const rec = parsed as Record<string, unknown>;
    const out: StoredAccountConfig = {};
    if (typeof rec.intervalMinutes === "number" && Number.isInteger(rec.intervalMinutes) && rec.intervalMinutes > 0) {
      out.intervalMinutes = rec.intervalMinutes;
    }
    if (typeof rec.warnPct === "number" && Number.isInteger(rec.warnPct) && rec.warnPct >= 0 && rec.warnPct <= 100) {
      out.warnPct = rec.warnPct;
    }
    if (typeof rec.baseUrl === "string" && rec.baseUrl.trim()) {
      out.baseUrl = rec.baseUrl;
    }
    const displayCurrency = parseDisplayCurrency(rec.displayCurrency);
    if (displayCurrency) out.displayCurrency = displayCurrency;
    if (rec.demo === true) out.demo = true;
    if (typeof rec.proxyCipher === "string" && rec.proxyCipher.startsWith("v1:")) {
      out.proxyCipher = rec.proxyCipher;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeStoredConfig(stored: StoredAccountConfig): string {
  return JSON.stringify(stored);
}

export function decryptStoredProxy(cipher: string | undefined): ProxyTarget | undefined {
  if (!cipher) return undefined;
  const parsed: unknown = JSON.parse(decryptSecret(cipher));
  if (!parsed || typeof parsed !== "object") throw new Error("invalid proxy payload");
  const rec = parsed as Record<string, unknown>;
  const protocol = rec.protocol;
  if (protocol !== "http" && protocol !== "https" && protocol !== "socks5") {
    throw new Error("invalid proxy payload");
  }
  if (typeof rec.host !== "string" || !rec.host) throw new Error("invalid proxy payload");
  if (typeof rec.port !== "number" || !Number.isInteger(rec.port) || rec.port < 1 || rec.port > 65535) {
    throw new Error("invalid proxy payload");
  }
  return {
    protocol,
    host: rec.host,
    port: rec.port,
    ...(typeof rec.username === "string" && rec.username ? { username: rec.username } : {}),
    ...(typeof rec.password === "string" && rec.password ? { password: rec.password } : {}),
  };
}

export function applyProxyUrl(
  stored: StoredAccountConfig,
  proxyUrl: string,
): { ok: true; stored: StoredAccountConfig } | { ok: false; error: string } {
  const next: StoredAccountConfig = { ...stored };
  if (proxyUrl.trim() === "") {
    delete next.proxyCipher;
    return { ok: true, stored: next };
  }
  const parsed = parseProxyUrl(proxyUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const target: ProxyTarget = { ...parsed.value };
  if (!target.password && stored.proxyCipher) {
    try {
      const existing = decryptStoredProxy(stored.proxyCipher);
      if (existing?.password && sameProxyEndpoint(target, existing)) {
        target.password = existing.password;
      }
    } catch {
      /* 原密文损坏则按新代理写入 */
    }
  }
  next.proxyCipher = encryptSecret(JSON.stringify(target));
  return { ok: true, stored: next };
}

export function mergeAccountConfig(
  existingRaw: string,
  input: AccountConfigInput | undefined,
): { ok: true; stored: StoredAccountConfig } | { ok: false; error: string } {
  const existing = parseStoredConfig(existingRaw);
  if (!input) return { ok: true, stored: existing };
  const next: StoredAccountConfig = { ...existing };
  if (input.intervalMinutes !== undefined) next.intervalMinutes = input.intervalMinutes;
  if (input.warnPct !== undefined) next.warnPct = input.warnPct;
  if (input.baseUrl !== undefined) {
    if (input.baseUrl.trim() === "") delete next.baseUrl;
    else next.baseUrl = input.baseUrl;
  }
  if (input.displayCurrency !== undefined) next.displayCurrency = input.displayCurrency;
  if (input.proxyUrl !== undefined) return applyProxyUrl(next, input.proxyUrl);
  return { ok: true, stored: next };
}

export function toPublicConfig(stored: StoredAccountConfig): PublicAccountConfig {
  let proxyUrl: string | undefined;
  if (stored.proxyCipher) {
    try {
      const proxy = decryptStoredProxy(stored.proxyCipher);
      if (proxy) proxyUrl = formatProxyUrl(proxy, { includePassword: false });
    } catch {
      /* 密文损坏时不把 cipher 回给前端 */
    }
  }
  return {
    ...(stored.intervalMinutes !== undefined ? { intervalMinutes: stored.intervalMinutes } : {}),
    ...(stored.warnPct !== undefined ? { warnPct: stored.warnPct } : {}),
    ...(stored.baseUrl !== undefined ? { baseUrl: stored.baseUrl } : {}),
    ...(stored.displayCurrency !== undefined ? { displayCurrency: stored.displayCurrency } : {}),
    ...(stored.demo ? { demo: true } : {}),
    ...(proxyUrl ? { proxyUrl } : {}),
  };
}
