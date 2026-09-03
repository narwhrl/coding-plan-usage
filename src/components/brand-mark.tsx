import type React from "react";
import { cn } from "@/lib/utils";

const sizeClassNames = {
  sm: "size-7 rounded-md",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
} as const;

/**
 * 站点标志：圆角方底 + 三根递减额度条（产品自己的 QuotaBar 语言）。
 * 填色走 primary / primary-foreground 令牌，浅色黑底白条、暗色反转。
 */
export function BrandMark({
  size = "sm",
  className,
}: {
  size?: keyof typeof sizeClassNames;
  className?: string;
}): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary text-primary-foreground",
        sizeClassNames[size],
        className,
      )}
      data-slot="brand-mark"
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="currentColor">
        <rect x="3" y="5" width="18" height="3" rx="1.5" />
        <rect x="3" y="10.5" width="12" height="3" rx="1.5" />
        <rect x="3" y="16" width="7" height="3" rx="1.5" />
      </svg>
    </span>
  );
}
