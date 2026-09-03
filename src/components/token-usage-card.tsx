"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/stat-strip";
import { UsageBarChart } from "@/components/usage-card";
import { compactNumber } from "@/lib/format";
import type { TokenUsage } from "@/lib/token-usage";

/** MiniMax 账单消耗面板：昨日/近7天/当月 + 按天柱状图。 */
export function TokenUsageCard({ usage }: { usage: TokenUsage }) {
  const t = useTranslations("detail.consumption");
  return (
    <Card data-testid="token-usage-card">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("lastDay")} value={compactNumber(usage.lastDayTokens)} />
          <StatTile label={t("last7d")} value={compactNumber(usage.weekTokens)} />
          <StatTile label={t("month")} value={compactNumber(usage.monthTokens)} />
        </div>
        {usage.days.length > 0 ? (
          <UsageBarChart
            title={t("perDay")}
            data={usage.days.map((d) => ({ label: d.d.slice(5), tokens: d.tokens, calls: 0 }))}
            metric="tokens"
            label={t("tokens")}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
