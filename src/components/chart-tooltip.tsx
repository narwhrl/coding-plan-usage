"use client";

import type React from "react";

type TooltipEntry = {
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
};

/**
 * Recharts Tooltip 的统一外观：走语义令牌，亮暗自动适配。
 * 用法：<Tooltip content={(props) => <ChartTooltipContent {...props} formatValue={...} />} />
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue = (v) => String(v),
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  formatValue?: (value: number) => string;
}): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-32 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {label != null && label !== "" ? (
        <p className="mb-1 font-medium text-popover-foreground">{String(label)}</p>
      ) : null}
      <div className="space-y-0.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
                aria-hidden="true"
              />
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-popover-foreground">
              {typeof entry.value === "number"
                ? formatValue(entry.value)
                : entry.value != null
                  ? String(entry.value)
                  : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
