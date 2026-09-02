"use client";

import type React from "react";
import type { TooltipContentProps } from "recharts";

/**
 * Recharts 共用 tooltip：走 popover/border 令牌，亮暗自动适配。
 * 用法：content={(props) => <ChartTooltipContent {...props} formatValue={fn} />}
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue = (value) => String(value),
}: TooltipContentProps & {
  formatValue?: (value: number) => string;
}): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-32 rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      {label !== undefined ? (
        <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`${String(entry.dataKey)}-${index}`} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span className="truncate text-muted-foreground">{entry.name}</span>
            <span className="ms-auto shrink-0 font-medium tabular-nums text-popover-foreground">
              {typeof entry.value === "number" ? formatValue(entry.value) : (entry.value ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
