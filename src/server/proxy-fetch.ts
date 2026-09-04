import { ProxyAgent, Socks5ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { formatProxyUrl, type ProxyTarget } from "@/lib/proxy";
import { FETCH_TIMEOUT_MS, wrapFetchWithTimeout } from "./fetch-timeout";

export type AccountFetchOptions = {
  /** 覆盖默认 30s 超时（测试用）。 */
  timeoutMs?: number;
};

/**
 * 按账户代理构造 fetch。无代理时走全局 fetch（测试可 stub）。
 * HTTP(S) 走 undici ProxyAgent；SOCKS5 走 undici Socks5ProxyAgent。
 * 所有路径都叠一层硬超时；代理 dispatcher 关停用 destroy，避免挂请求拖住 close。
 */
export function createAccountFetch(
  proxy: ProxyTarget | undefined,
  options: AccountFetchOptions = {},
): {
  fetchFn: typeof fetch;
  close: () => Promise<void>;
} {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  if (!proxy) {
    return {
      fetchFn: wrapFetchWithTimeout((input, init) => globalThis.fetch(input, init), timeoutMs),
      close: async () => undefined,
    };
  }

  const dispatcher = createDispatcher(proxy, timeoutMs);
  const proxied = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return undiciFetch(url, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body as BodyInit | undefined,
      redirect: init?.redirect,
      signal: init?.signal,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1]);
  }) as unknown as typeof fetch;

  return {
    fetchFn: wrapFetchWithTimeout(proxied, timeoutMs),
    close: async () => {
      try {
        dispatcher.destroy();
      } catch {
        /* 关闭失败不阻断采集收尾 */
      }
    },
  };
}

function createDispatcher(proxy: ProxyTarget, timeoutMs: number): Dispatcher {
  const uri = formatProxyUrl(proxy, { includePassword: true });
  const timeouts = { headersTimeout: timeoutMs, bodyTimeout: timeoutMs };
  if (proxy.protocol === "socks5") {
    return new Socks5ProxyAgent(uri, timeouts);
  }
  return new ProxyAgent({ uri, ...timeouts });
}
