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

/** 剩余额度条：颜色由 pct 与账户预警阈值推导，全站同一套分级。 */
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
  const value = Math.max(0, Math.min(100, pct));
  return (
    <Progress value={value} aria-label={label} className={className}>
      <ProgressTrack className={size === "sm" ? "h-1" : undefined}>
        <ProgressIndicator className={toneClassNames[quotaTone(pct, warnPct)]} />
      </ProgressTrack>
    </Progress>
  );
}

/**
 * pct 文本的同色规则，与 QuotaBar 共用分级。
 *
 * 用 *-foreground 而不是填充色：--destructive 是 red-500，浅色主题里对白底只有 3.7:1，
 * 窗口行那种 text-sm 的读数过不了 AA；red-700 有 6.4:1，且与 warning 分支的取色一致。
 */
export function quotaTextClassName(pct: number | undefined, warnPct: number): string {
  const tone = quotaTone(pct, warnPct);
  return cn(
    tone === "critical" && "text-destructive-foreground",
    tone === "warning" && "text-warning-foreground",
  );
}
