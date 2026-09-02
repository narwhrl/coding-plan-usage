import type React from "react";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { quotaTone, type QuotaTone } from "@/lib/format";
import { cn } from "@/lib/utils";

const toneClassNames: Record<QuotaTone, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  // 正常态刻意压低对比：满格的纯黑条在浅色主题里过重。
  normal: "bg-foreground/64",
};

/** 剩余额度条：颜色由 pct 与账户预警阈值推导，全站同一套分级（quotaTone）。 */
export function QuotaBar({
  pct,
  warnPct,
  label,
  size = "default",
  className,
}: {
  pct: number;
  warnPct: number;
  label: string;
  size?: "default" | "sm";
  className?: string;
}): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <Progress value={clamped} aria-label={label} className={cn("gap-1", className)}>
      <ProgressTrack className={size === "sm" ? "h-1" : undefined}>
        <ProgressIndicator className={toneClassNames[quotaTone(pct, warnPct)]} />
      </ProgressTrack>
    </Progress>
  );
}

const toneTextClassNames: Record<QuotaTone, string> = {
  // 读数用 *-foreground 那一支：填充色 --destructive 是 red-500，浅色下对白底只有
  // 3.8:1，写数字过不了 AA；red-700/400 才够。
  critical: "text-destructive-foreground",
  warning: "text-warning-foreground",
  normal: undefined as unknown as string,
};

/** 额度读数的文字色：与 QuotaBar 同一条 quotaTone 规则，但走文字令牌。 */
export function quotaTextClassName(pct: number, warnPct: number): string | undefined {
  return toneTextClassNames[quotaTone(pct, warnPct)] || undefined;
}
