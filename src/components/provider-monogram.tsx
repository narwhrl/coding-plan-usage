import type React from "react";
import { monogram } from "@/lib/format";
import { providerIcon } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";

const sizeClassNames = {
  sm: "size-7 rounded-md text-xs",
  md: "size-9 rounded-lg text-sm",
  lg: "size-11 rounded-xl text-base",
} as const;

const iconSizeClassNames = {
  sm: "size-3.5",
  md: "size-5",
  lg: "size-6",
} as const;

/**
 * 提供商标识：内置家走 vendored SVG（currentColor），自定义回退两字母 monogram。
 * 不引入品牌图标 npm 包。aria-hidden：提供商名总是以文本形式紧邻出现。
 */
export function ProviderMonogram({
  name,
  providerId,
  size = "md",
  className,
}: {
  name: string;
  providerId?: string;
  size?: keyof typeof sizeClassNames;
  className?: string;
}): React.ReactElement {
  const icon = providerIcon(providerId);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted font-heading font-semibold text-muted-foreground",
        sizeClassNames[size],
        className,
      )}
      data-provider-id={providerId}
      data-slot="provider-monogram"
    >
      {icon ? (
        <svg
          viewBox="0 0 24 24"
          className={iconSizeClassNames[size]}
          fill="currentColor"
          fillRule="evenodd"
        >
          {icon.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      ) : (
        monogram(name)
      )}
    </span>
  );
}
