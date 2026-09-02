import type React from "react";
import { monogram } from "@/lib/format";
import { cn } from "@/lib/utils";

const sizeClassNames = {
  sm: "size-7 rounded-md text-xs",
  md: "size-9 rounded-lg text-sm",
  lg: "size-11 rounded-xl text-base",
} as const;

/**
 * 提供商标识：永远是两字母 monogram 文本，不引入品牌图标依赖。
 * aria-hidden：提供商名总是以文本形式紧邻出现，读屏不需要重复念字母。
 */
export function ProviderMonogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizeClassNames;
  className?: string;
}): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted font-heading font-semibold text-muted-foreground",
        sizeClassNames[size],
        className,
      )}
      data-slot="provider-monogram"
    >
      {monogram(name)}
    </span>
  );
}
