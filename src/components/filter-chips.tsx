"use client";

import { cn } from "@/lib/utils";

/**
 * 概览筛选：横向胶囊，选中项用背景抬起。
 * 未选中走 muted-foreground，悬停抬到 foreground，避免 hover 等于没反馈。
 */
export function FilterChips<T extends string>({
  value,
  options,
  onValueChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onValueChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
      data-testid="overview-filter"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors sm:h-7",
              selected
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "tabular-nums",
                  selected ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
