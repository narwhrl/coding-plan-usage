"use client";

import { useTranslations } from "next-intl";
import type { SparkPoint } from "@/lib/types";

/** 近 7 天每日最紧值单线 sparkline；不足 2 点不渲染。中性灰阶，作辅助信息。 */
export function Sparkline({ points }: { points: SparkPoint[] }) {
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
  const min = Math.min(...points.map((p) => p.pct));
  const max = Math.max(...points.map((p) => p.pct));
  const areaPath = `M ${pad},${h} L ${coords.map(([x, y]) => `${x},${y}`).join(" L ")} L ${w - pad},${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-10 w-24 shrink-0"
      role="img"
      aria-label={`${t("trend")}: ${min}%-${max}%`}
      data-testid="sparkline"
    >
      <path d={areaPath} className="fill-muted-foreground/10" strokeWidth={0} />
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-muted-foreground/70"
      />
    </svg>
  );
}
