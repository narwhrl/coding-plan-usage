import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM 凭证加密。主密钥 env APP_ENCRYPTION_KEY（任意非空字符串），
 * 每次 encrypt 生成 16B salt，key = scrypt(secret, salt, 32)。
 * 密文格式：v1:<base64(salt16 | iv12 | tag16 | ct)>
 * fail-fast：APP_ENCRYPTION_KEY 为空直接抛错，绝不静默明文。
 */

function requireMasterKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || key.length === 0) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Refusing to store credentials in plaintext. " +
        "Set it to any non-empty string (it is stretched with scrypt).",
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const master = requireMasterKey();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(master, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:" + Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith("v1:")) {
    throw new Error("Unknown cipher format (expected v1: prefix)");
  }
  const master = requireMasterKey();
  const blob = Buffer.from(payload.slice(3), "base64");
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(28, 44);
  const ct = blob.subarray(44);
  const key = scryptSync(master, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** 常量时间字符串比较（口令校验用）；长度不同直接 false。 */
export function safeEqualStr(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
