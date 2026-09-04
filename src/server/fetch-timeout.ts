/** 采集出站请求的硬超时。挂住的上游不能无限占用调度器的 running 标志。 */
export const FETCH_TIMEOUT_MS = 30_000;

/** 在已有 signal 上叠一层超时；任一先触发即中止。 */
export function withTimeoutSignal(existing?: AbortSignal | null, ms = FETCH_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return existing ? AbortSignal.any([existing, timeout]) : timeout;
}

/** 给任意 fetch 补超时。每次调用读最新的 base，测试里替换 globalThis.fetch 仍然生效。 */
export function wrapFetchWithTimeout(
  base: typeof fetch,
  ms = FETCH_TIMEOUT_MS,
): typeof fetch {
  return (async (input, init) => {
    return base(input, { ...init, signal: withTimeoutSignal(init?.signal, ms) });
  }) as typeof fetch;
}
