/**
 * 浏览器扩展（沉浸式翻译等）会在 DOM 变动时抛错。
 * Next.js 开发层把 window `error` 画成整页 overlay，且明确不忽略 chrome-extension://
 *（见 next/dist/server/dev/browser-logs/source-map.js 注释）。
 * 只按扩展协议过滤，同文案的应用错误仍会冒泡。
 */

const EXTENSION_URL =
  /(?:chrome|moz|safari|webkit|ms-browser|safari-web)-extension:\/\//i;

const INSTALLED = Symbol.for("cpu.browser-extension-error-filter");

export type BrowserExtensionErrorInput = {
  filename?: string | null;
  message?: string | null;
  error?: unknown;
};

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ""}`;
  if (typeof error === "string") return error;
  return "";
}

/** 文件名或堆栈带浏览器扩展协议时视为扩展错误，不是应用代码。 */
export function isBrowserExtensionError(input: BrowserExtensionErrorInput): boolean {
  return EXTENSION_URL.test([input.filename, input.message, textOf(input.error)].filter(Boolean).join("\n"));
}

export type ErrorFilterTarget = EventTarget & {
  [INSTALLED]?: true;
};

function readExtensionInput(event: Event): BrowserExtensionErrorInput | null {
  if (event.type === "unhandledrejection") {
    return { error: (event as Event & { reason?: unknown }).reason };
  }
  if (event.type !== "error") return null;
  const rec = event as Event & { filename?: string; error?: unknown; message?: string };
  return { filename: rec.filename, message: rec.message, error: rec.error };
}

function swallowIfExtension(event: Event): void {
  const input = readExtensionInput(event);
  if (!input || !isBrowserExtensionError(input)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** 在捕获阶段拦住扩展错误，避免落到 Next.js 开发层的冒泡监听。 */
export function installBrowserExtensionErrorFilter(target: ErrorFilterTarget = window): void {
  if (target[INSTALLED]) return;
  target[INSTALLED] = true;
  target.addEventListener("error", swallowIfExtension, true);
  target.addEventListener("unhandledrejection", swallowIfExtension, true);
}
