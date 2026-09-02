"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { shortDateTime, shortTime, windowName } from "@/lib/format";
import { buildTrendSeries } from "@/lib/trend";
import type { HistorySnapshot } from "@/lib/types";

const RANGES = [
  { value: "24h", ms: 86_400_000, messageKey: "range24h" },
  { value: "7d", ms: 7 * 86_400_000, messageKey: "range7d" },
  { value: "all", ms: Number.POSITIVE_INFINITY, messageKey: "rangeAll" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

/** 每窗口一条 remainingPct 折线；系列名取本地化窗口名，颜色循环 chart-1..5。 */
export function TrendChart({
  history,
  warnPct,
}: {
  history: HistorySnapshot[] | null;
  warnPct: number;
}) {
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const locale = useLocale();
  const [range, setRange] = useState<RangeValue>("7d");

  const loading = history === null;
  // 整段历史够画线、但当前范围内点数不足时，问题是范围太窄而不是采集太少。
  const rangeTooNarrow = (history?.length ?? 0) > 1;

  const { data, series } = useMemo(
    () =>
      buildTrendSeries(
        history,
        RANGES.find((r) => r.value === range)?.ms ?? Number.POSITIVE_INFINITY,
        (iso) => (range === "24h" ? shortTime(iso, locale) : shortDateTime(iso, locale)),
        (w) => windowName(w, t),
      ),
    [history, range, locale, t],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {tDetail("chart")}
        </CardTitle>
        <CardAction>
          <ToggleGroup
            value={[range]}
            disabled={loading}
            onValueChange={(value) => {
              const next = value[0];
              if (RANGES.some((r) => r.value === next)) setRange(next as RangeValue);
            }}
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} variant="outline" size="sm">
                {tDetail(r.messageKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : data.length > 1 ? (
          <>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
              {series.map((name, index) => (
                <span key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: `var(--chart-${(index % 5) + 1})` }}
                    aria-hidden="true"
                  />
                  {name}
                </span>
              ))}
            </div>
            <div className="h-64" data-testid="trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={48}
                  />
                  <YAxis
                    width={36}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <ReferenceLine
                    y={warnPct}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.56}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={(props) => (
                      <ChartTooltipContent {...props} formatValue={(v) => `${v.toFixed(0)}%`} />
                    )}
                  />
                  {series.map((name, index) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={`var(--chart-${(index % 5) + 1})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {rangeTooNarrow ? tDetail("rangeSparse") : tDetail("noSnapshots")}
            </p>
            {rangeTooNarrow && range !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRange("all")}
                data-testid="trend-widen-range"
              >
                {tDetail("rangeSparseAction")}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
