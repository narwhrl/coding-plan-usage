import type React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 指标条：一张卡内若干等宽指标，靠分隔线而不是间隙划分（留白优先）。
 * 窄屏单列纵向堆叠，sm 起单行等宽；条目数建议 ≤ 4，否则单行会挤。
 */
export function StatStrip({
  className,
  children,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <Card
      className={cn(
        "grid grid-cols-1 sm:auto-cols-fr sm:grid-flow-col",
        "[&>*:not(:first-child)]:border-t sm:[&>*:not(:first-child)]:border-t-0 sm:[&>*:not(:first-child)]:border-s",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

/** 卡内指标格：带边框的小方块，用于卡片内部的次级指标网格。 */
export function StatTile({
  label,
  value,
  hint,
  valueClassName,
  className,
  children,
  ...props
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
} & React.ComponentProps<"div">): React.ReactElement {
  return (
    <div className={cn("rounded-lg border border-border p-3", className)} {...props}>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-heading text-lg font-semibold tabular-nums", valueClassName)}>
        {value}
      </p>
      {children}
      {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StatStripItem({
  label,
  value,
  hint,
  tone = "default",
  className,
  ...props
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "critical";
} & Omit<React.ComponentProps<"div">, "children">): React.ReactElement {
  return (
    <div className={cn("min-w-0 px-4 py-3", className)} {...props}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-heading text-xl font-semibold tabular-nums",
          // text-xl/600 在 WCAG 里仍算小字（大字要 ≥24px 或 ≥18.66px+700），
          // 所以 critical 用 red-700 系的 foreground 令牌而不是 red-500。
          tone === "critical" && "text-destructive-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
