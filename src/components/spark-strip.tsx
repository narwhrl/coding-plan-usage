import type React from "react";
import { useTranslations } from "next-intl";
import { quotaTone } from "@/lib/format";
import { sparkSlots } from "@/lib/spark-strip";
import type { SparkPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

const barTones = {
  critical: "bg-destructive",
  warning: "bg-warning",
  normal: "bg-foreground/32",
} as const;

/**
 * 近 7 天每日最紧值的迷你柱条：固定 7 个日槽（最右为今天），缺测为空槽。
 * 和卡片上方的当前额度不是同一个数（每日最紧值 vs 此刻），所以必须带标题，
 * 不能贴着大数字当装饰。
 */
export function SparkStrip({
  points,
  warnPct,
  className,
}: {
  points: SparkPoint[];
  warnPct: number;
  className?: string;
}): React.ReactElement | null {
  const t = useTranslations("overview");
  if (points.length === 0) return null;
  const slots = sparkSlots(points);
  const values = slots.filter((s) => s.pct !== null).map((s) => s.pct as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className={cn("space-y-1.5", className)} data-testid="spark-strip">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("trend")}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {min.toFixed(0)}%–{max.toFixed(0)}%
        </p>
      </div>
      <div className="flex h-8 items-end gap-1" role="img" aria-label={`${t("trend")}: ${min.toFixed(0)}%–${max.toFixed(0)}%`}>
        {slots.map((slot) => (
          <span
            key={slot.day}
            title={`${slot.day}: ${slot.pct === null ? "—" : `${slot.pct.toFixed(0)}%`}`}
            className={cn(
              "min-w-0 flex-1 rounded-[2px]",
              slot.pct === null
                ? "h-px bg-border"
                : barTones[quotaTone(slot.pct, warnPct)],
            )}
            style={slot.pct === null ? undefined : { height: `${Math.max(8, slot.pct)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
