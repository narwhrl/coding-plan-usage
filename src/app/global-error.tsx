"use client";

import type React from "react";
import "./globals.css";

/**
 * 根布局自身炸掉时替换整份 document，用不了 next-intl。
 * 按 cpu_lang cookie 选中英，令牌来自 globals.css。
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.ReactElement {
  const english =
    typeof document !== "undefined" && /(?:^|;\s*)cpu_lang=en(?:;|$)/.test(document.cookie);
  const copy = english
    ? { title: "Something went wrong", retry: "Try again" }
    : { title: "出错了", retry: "重试" };
  return (
    <html lang={english ? "en" : "zh"}>
      <body className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-16 text-foreground">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {copy.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
