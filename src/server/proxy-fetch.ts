import { ProxyAgent, Socks5ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { formatProxyUrl, type ProxyTarget } from "@/lib/proxy";

/**
 * 按账户代理构造 fetch。无代理时走全局 fetch（测试可 stub）。
 * HTTP(S) 走 undici ProxyAgent；SOCKS5 走 undici Socks5ProxyAgent。
 */
export function createAccountFetch(proxy: ProxyTarget | undefined): {
  fetchFn: typeof fetch;
  close: () => Promise<void>;
} {
  if (!proxy) {
    return { fetchFn: globalThis.fetch, close: async () => undefined };
  }

  const dispatcher = createDispatcher(proxy);
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
    fetchFn,
    close: async () => {
      try {
        await dispatcher.close();
      } catch {
        /* 关闭失败不阻断采集收尾 */
      }
    },
  };
}

function createDispatcher(proxy: ProxyTarget): Dispatcher {
  const uri = formatProxyUrl(proxy, { includePassword: true });
  if (proxy.protocol === "socks5") {
    return new Socks5ProxyAgent(uri);
  }
  return new ProxyAgent(uri);
}
