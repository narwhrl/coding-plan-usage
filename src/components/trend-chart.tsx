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
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { SegmentedToggle } from "@/components/segmented-toggle";
import { compactNumber, shortDateTime, shortTime, windowName } from "@/lib/format";
import { buildTrendSeries, trendValueMode } from "@/lib/trend";
import type { HistorySnapshot } from "@/lib/types";

const RANGES = [
  { value: "24h", ms: 86_400_000, messageKey: "range24h" },
  { value: "7d", ms: 7 * 86_400_000, messageKey: "range7d" },
  { value: "all", ms: Number.POSITIVE_INFINITY, messageKey: "rangeAll" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

/** 每窗口一条折线（配额 remainingPct 或预付费 remaining）；系列名取本地化窗口名。 */
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
  const valueMode = useMemo(() => trendValueMode(history), [history]);
  const isPercent = valueMode === "percent";

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {tDetail("chart")}
        </CardTitle>
        <CardAction>
          <SegmentedToggle
            label={tDetail("rangeLabel")}
            value={range}
            options={RANGES.map((r) => ({ value: r.value, label: tDetail(r.messageKey) }))}
            onValueChange={setRange}
            disabled={loading}
          />
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
                    width={isPercent ? 36 : 48}
                    domain={isPercent ? [0, 100] : ["auto", "auto"]}
                    ticks={isPercent ? [0, 25, 50, 75, 100] : undefined}
                    tickFormatter={(v: number) => (isPercent ? `${v}%` : compactNumber(v))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  {isPercent ? (
                    <ReferenceLine
                      y={warnPct}
                      stroke="var(--destructive)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.56}
                    />
                  ) : null}
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={(props) => (
                      <ChartTooltipContent
                        {...props}
                        formatValue={(v) => (isPercent ? `${v.toFixed(0)}%` : compactNumber(v))}
                      />
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
