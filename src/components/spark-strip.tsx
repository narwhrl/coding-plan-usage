"use client";

import { useTranslations } from "next-intl";
import { quotaTone, type QuotaTone } from "@/lib/format";
import { buildSparkSlots } from "@/lib/spark-strip";
import type { SparkPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

// 分级沿用全站的 quotaTone；只有正常态压得比额度条更浅——柱子的面积比 1px 的条大得多。
const barToneClassNames: Record<QuotaTone, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  normal: "bg-foreground/32",
};

/**
 * 近 7 天每日最紧额度。
 * 数据是一天一个值，所以画柱不画折线：折线会在缺测的日子之间插值，而这里的空槽本身就是信息。
 */
export function SparkStrip({ points, warnPct }: { points: SparkPoint[]; warnPct: number }) {
  const t = useTranslations("overview");
  if (points.length === 0) return null;

  const slots = buildSparkSlots(points);
  const values = points.map((p) => p.pct);
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  const range = min === max ? `${min}%` : `${min}% – ${max}%`;

  return (
    <div className="space-y-1.5" data-testid="spark-strip">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{t("trend")}</span>
        <span className="shrink-0 tabular-nums">{range}</span>
      </div>
      <div className="flex h-5 items-end gap-1" role="img" aria-label={`${t("trend")}: ${range}`}>
        {slots.map((slot) => (
          <div
            key={slot.day}
            className="relative h-full flex-1 rounded-[3px] bg-foreground/6 dark:bg-foreground/10"
          >
            {slot.pct === null ? null : (
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 rounded-[3px]",
                  barToneClassNames[quotaTone(slot.pct, warnPct)],
                )}
                // 极低的余量也要留一条看得见的底边，否则会和缺测的空槽混淆。
                style={{ height: `${Math.max(8, slot.pct)}%` }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
