"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { QuotaBar } from "@/components/quota-bar";
import { SegmentedToggle } from "@/components/segmented-toggle";
import { StatTile } from "@/components/stat-strip";
import { compactNumber } from "@/lib/format";
import {
  dailySeries,
  latestDaySeries,
  peakHour,
  type ModelUsage,
  type UsagePoint,
} from "@/lib/model-usage";

function UsageBarChart({ data, metric }: { data: UsagePoint[]; metric: "tokens" | "calls" }) {
  const t = useTranslations();
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={(props) => (
              <ChartTooltipContent {...props} formatValue={(value) => compactNumber(value)} />
            )}
          />
          <Bar
            dataKey={metric}
            fill={metric === "tokens" ? "var(--chart-1)" : "var(--chart-2)"}
            name={t(`detail.usage.${metric}`)}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UsageCard({ usage }: { usage: ModelUsage }) {
  const t = useTranslations();
  const [metric, setMetric] = useState<"tokens" | "calls">("tokens");
  const peak = peakHour(usage);
  const modelsTotal = usage.models.reduce((acc, m) => acc + m.totalTokens, 0);
  return (
    <Card data-testid="usage-card">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("detail.usage.title")}
        </CardTitle>
        <CardAction>
          <SegmentedToggle
            label={t("detail.usage.metricLabel")}
            value={metric}
            options={[
              { value: "tokens", label: t("detail.usage.tokens") },
              { value: "calls", label: t("detail.usage.calls") },
            ]}
            onValueChange={setMetric}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("detail.usage.totalTokens")} value={compactNumber(usage.totalTokens)} />
          <StatTile label={t("detail.usage.totalCalls")} value={compactNumber(usage.totalCalls)} />
          {peak ? (
            <StatTile
              label={t("detail.usage.peak")}
              value={compactNumber(peak.tokens)}
              hint={`@ ${peak.label.slice(6)}`}
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("detail.usage.hourly")}</h3>
          <UsageBarChart data={latestDaySeries(usage)} metric={metric} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("detail.usage.daily")}</h3>
          <UsageBarChart data={dailySeries(usage)} metric={metric} />
        </div>

        {usage.models.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("detail.usage.byModel")}</h3>
            {usage.models.map((m) => {
              const share = modelsTotal > 0 ? (m.totalTokens / modelsTotal) * 100 : 0;
              return (
                <div key={m.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {compactNumber(m.totalTokens)} · {share.toFixed(1)}%
                    </span>
                  </div>
                  {modelsTotal > 0 ? (
                    <QuotaBar pct={share} warnPct={0} label={m.name} size="sm" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("detail.usage.window", { from: usage.xTime[0], to: usage.xTime[usage.xTime.length - 1] })}
        </p>
      </CardContent>
    </Card>
  );
}
