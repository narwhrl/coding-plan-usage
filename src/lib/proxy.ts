/** 账户级 HTTP(S)/SOCKS5 代理 URL 的解析与脱敏（前后端共用，不含密钥）。 */

export const PROXY_PROTOCOLS = ["http", "https", "socks5"] as const;
export type ProxyProtocol = (typeof PROXY_PROTOCOLS)[number];

export type ProxyTarget = {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export type ProxyParseError = "invalid_url" | "unsupported_protocol" | "missing_host" | "invalid_port";

const PROTOCOL_ALIASES: Record<string, ProxyProtocol> = {
  http: "http",
  https: "https",
  socks5: "socks5",
  socks5h: "socks5",
};

export function parseProxyUrl(
  input: string,
): { ok: true; value: ProxyTarget } | { ok: false; error: ProxyParseError } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "invalid_url" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const protocol = PROTOCOL_ALIASES[scheme];
  if (!protocol) return { ok: false, error: "unsupported_protocol" };

  const host = normalizeHost(url.hostname);
  if (!host) return { ok: false, error: "missing_host" };

  let port: number;
  if (url.port) {
    port = Number(url.port);
  } else if (protocol === "http") {
    port = 80;
  } else if (protocol === "https") {
    port = 443;
  } else {
    port = 1080;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "invalid_port" };
  }

  // Node 的 URL.username/password 可能仍是百分号编码，统一解码后再存。
  const username = decodeUserinfo(url.username) || undefined;
  const password = decodeUserinfo(url.password) || undefined;

  return {
    ok: true,
    value: {
      protocol,
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    },
  };
}

function decodeUserinfo(value: string): string {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** URL.hostname 在部分运行时会带 IPv6 方括号，存储时去掉以便 format 统一加回。 */
function normalizeHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function formatProxyUrl(proxy: ProxyTarget, options?: { includePassword?: boolean }): string {
  const includePassword = options?.includePassword === true;
  let auth = "";
  if (proxy.username || (includePassword && proxy.password)) {
    const user = encodeURIComponent(proxy.username ?? "");
    auth =
      includePassword && proxy.password
        ? `${user}:${encodeURIComponent(proxy.password)}@`
        : proxy.username
          ? `${user}@`
          : "";
  }
  const host = proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host;
  return `${proxy.protocol}://${auth}${host}:${proxy.port}`;
}

export function sameProxyEndpoint(a: ProxyTarget, b: ProxyTarget): boolean {
  return (
    a.protocol === b.protocol &&
    a.host === b.host &&
    a.port === b.port &&
    (a.username ?? "") === (b.username ?? "")
  );
}

/** 从错误信息里抹掉代理密码（明文与 URL 编码两种形态）。 */
export function redactProxySecrets(message: string, proxy: ProxyTarget | undefined): string {
  if (!proxy?.password) return message;
  const secrets = [proxy.password, encodeURIComponent(proxy.password)].filter(
    (value, index, all) => value.length > 0 && all.indexOf(value) === index,
  );
  let out = message;
  for (const secret of secrets) {
    out = out.split(secret).join("***");
  }
  return out;
}
