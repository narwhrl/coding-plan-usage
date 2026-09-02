"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { StatTile } from "@/components/stat-strip";
import { compactNumber } from "@/lib/format";
import { dailySeries, latestDaySeries, peakHour, type ModelUsage, type UsagePoint } from "@/lib/model-usage";

type Metric = "tokens" | "calls";

/** GLM model-usage 面板：小时/天柱状图 + 按模型占比。 */
export function UsageCard({ usage }: { usage: ModelUsage }) {
  const t = useTranslations("detail.usage");
  const [metric, setMetric] = useState<Metric>("tokens");
  const peak = peakHour(usage);
  const modelsTotal = usage.models.reduce((acc, m) => acc + m.totalTokens, 0);

  return (
    <Card data-testid="usage-card">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("title")}
        </CardTitle>
        <CardAction>
          {/* variant/size 必须给在 ToggleGroup 上：ToggleGroupContext 的默认值会盖掉子项的同名 prop。 */}
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[metric]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "tokens" || next === "calls") setMetric(next);
            }}
          >
            <ToggleGroupItem value="tokens">{t("tokens")}</ToggleGroupItem>
            <ToggleGroupItem value="calls">{t("calls")}</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("totalTokens")} value={compactNumber(usage.totalTokens)} />
          <StatTile label={t("totalCalls")} value={compactNumber(usage.totalCalls)} />
          {peak ? (
            <StatTile
              label={t("peak")}
              value={compactNumber(peak.tokens)}
              hint={peak.label}
            />
          ) : null}
        </div>

        <UsageBarChart title={t("hourly")} data={latestDaySeries(usage)} metric={metric} label={t(metric)} />
        <UsageBarChart title={t("daily")} data={dailySeries(usage)} metric={metric} label={t(metric)} />

        {usage.models.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("byModel")}</h3>
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
                    <Progress value={share} aria-label={m.name}>
                      <ProgressTrack className="h-1">
                        <ProgressIndicator className="bg-foreground/64" />
                      </ProgressTrack>
                    </Progress>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("window", { from: usage.xTime[0], to: usage.xTime[usage.xTime.length - 1] })}
        </p>
      </CardContent>
    </Card>
  );
}

function UsageBarChart({
  title,
  data,
  metric,
  label,
}: {
  title: string;
  data: UsagePoint[];
  metric: Metric;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              width={44}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => compactNumber(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => <ChartTooltipContent {...props} formatValue={compactNumber} />}
            />
            <Bar
              dataKey={metric}
              name={label}
              fill={metric === "tokens" ? "var(--chart-1)" : "var(--chart-2)"}
              radius={[3, 3, 0, 0]}
              // 不设上限时 7 天视图会摊成一整排巨大色块，压过页面其余内容。
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
