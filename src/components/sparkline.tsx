"use client";

import { useTranslations } from "next-intl";
import type { QuotaTone } from "@/lib/format";
import type { SparkPoint } from "@/lib/types";

const toneClassNames: Record<QuotaTone, { line: string; dot: string }> = {
  critical: { line: "stroke-destructive", dot: "fill-destructive" },
  warning: { line: "stroke-warning", dot: "fill-warning" },
  normal: { line: "stroke-foreground/40", dot: "fill-foreground/40" },
};

/** 近 7 天每日最紧值 sparkline（折线 + 末点），不足 2 点不渲染。 */
export function Sparkline({
  points,
  tone = "normal",
}: {
  points: SparkPoint[];
  tone?: QuotaTone;
}) {
  const t = useTranslations("overview");
  if (points.length < 2) return null;
  const w = 100;
  const h = 32;
  const pad = 2;
  const dayMs = 86_400_000;
  const now = new Date();
  // 七日窗口从 UTC 今日零点前 6 天开始，因此横轴偏移范围固定为 [0, 6]。
  const windowStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * dayMs;
  const coords = points.map((p) => {
    const t0 = Date.parse(`${p.d}T00:00:00Z`);
    const offset = Number.isFinite(t0) ? Math.min(6, Math.max(0, (t0 - windowStartMs) / dayMs)) : 0;
    return [
      pad + (offset / 6) * (w - 2 * pad),
      h - pad - (Math.max(0, Math.min(100, p.pct)) / 100) * (h - 2 * pad),
    ] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  const min = Math.min(...points.map((p) => p.pct));
  const max = Math.max(...points.map((p) => p.pct));
  const colors = toneClassNames[tone];
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-10 w-24 shrink-0"
      role="img"
      aria-label={`${t("trend")}: ${min}%-${max}%`}
      data-testid="sparkline"
    >
      <polyline
        points={line}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colors.line}
      />
      {/* preserveAspectRatio=none 会把圆拉扁，所以末点用 1×1 方块而不是 circle。 */}
      <rect
        x={lastX - 1}
        y={lastY - 1}
        width={2}
        height={2}
        className={colors.dot}
        stroke="none"
      />
    </svg>
  );
}
