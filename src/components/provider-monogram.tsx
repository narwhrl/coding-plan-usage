import type React from "react";
import { monogram } from "@/lib/format";
import { cn } from "@/lib/utils";

const sizeClassNames = {
  sm: "size-7 rounded-md text-xs",
  md: "size-9 rounded-lg text-sm",
  lg: "size-11 rounded-xl text-base",
} as const;

/**
 * 提供商标识：两字母 monogram。项目约定不加品牌图标依赖（见 docs/design-system.md），
 * 纯装饰，读屏由旁边的名称文本负责。
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
    >
      {monogram(name)}
    </span>
  );
}
