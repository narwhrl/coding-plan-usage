import type React from "react";
import { cn } from "@/lib/utils";

/**
 * 所有页面共用的标题区：eyebrow（面包屑等）/ 标题 / 描述 / 右侧操作。
 * 统一 h1 排版与 8/12/16 间距节奏，页面里不要再各写一遍 h1。
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("space-y-3", className)}>
      {eyebrow}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0 space-y-1">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
