import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

/** 无 URL 语言段：cookie cpu_lang（默认 zh）决定 locale。 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = store.get("cpu_lang")?.value === "en" ? "en" : "zh";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
