import { installBrowserExtensionErrorFilter } from "@/lib/browser-extension-error";

try {
  installBrowserExtensionErrorFilter();
} catch {
  /* 扩展过滤失败不能挡住 hydration */
}
