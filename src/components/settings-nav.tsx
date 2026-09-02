"use client";

import { cn } from "@/lib/utils";

export type SettingsTab = "accounts" | "custom" | "general";

/** 设置分区导航：窄屏横向胶囊，宽屏左侧竖列。 */
export function SettingsNav({
  value,
  onValueChange,
  items,
  label,
}: {
  value: SettingsTab;
  onValueChange: (value: SettingsTab) => void;
  items: readonly { value: SettingsTab; label: string }[];
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible"
      data-testid="settings-nav"
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm/5 dark:bg-input"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
