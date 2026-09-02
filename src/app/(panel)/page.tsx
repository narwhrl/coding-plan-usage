"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gauge, Layers, TimerReset, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/account-card";
import type { AccountView } from "@/lib/types";
import { overviewKpis, sortAccountsByUrgency } from "@/lib/overview";
import { countdownText } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const t = useTranslations("overview");
  const tRoot = useTranslations();
  const tTime = useTranslations("time");
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;
    let latestRequest = 0;

    async function load() {
      const requestId = ++latestRequest;
      try {
        const response = await fetch("/api/accounts");
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { accounts: AccountView[] };
        if (!ignore && requestId === latestRequest) {
          setAccounts(data.accounts);
          setError(false);
        }
      } catch {
        if (!ignore && requestId === latestRequest) setError(true);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [refreshVersion]);

  if (accounts === null) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = overviewKpis(accounts);
  const windowName = (w: { label?: string; kind: string }) =>
    w.label ?? tRoot(`window.${w.kind}`, { defaultValue: w.kind });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? (
        <Card className="border-destructive/60" data-testid="overview-error">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive-foreground">
            <TriangleAlert className="size-4 shrink-0" />
            {t("loadFailed")}
          </CardContent>
        </Card>
      ) : null}
      {accounts.length === 0 && !error ? (
        <Empty className="rounded-xl border border-border">
          <EmptyHeader>
            <EmptyTitle>{t("empty")}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            <Button render={<Link href="/settings" />}>{t("goSettings")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {accounts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3" data-testid="kpi-band">
              <StatCard
                icon={<Layers />}
                label={t("kpiAccounts")}
                value={String(kpis.enabledTotal)}
                sub={
                  kpis.errorCount > 0
                    ? t("kpiErrors", { count: kpis.errorCount })
                    : t("kpiAllOk")
                }
                subTone={kpis.errorCount > 0 ? "error" : "muted"}
              />
              <StatCard
                icon={<Gauge />}
                label={t("kpiTightest")}
                value={kpis.tightest ? `${kpis.tightest.window.remainingPct!.toFixed(0)}%` : "—"}
                sub={
                  kpis.tightest
                    ? `${kpis.tightest.account.providerName} · ${kpis.tightest.account.label} · ${windowName(kpis.tightest.window)}`
                    : undefined
                }
                valueTone={
                  kpis.tightest &&
                  kpis.tightest.window.remainingPct !== undefined &&
                  kpis.tightest.window.remainingPct < kpis.tightest.account.warnThreshold
                    ? "error"
                    : "default"
                }
              />
              <StatCard
                icon={<TimerReset />}
                label={t("kpiNextReset")}
                value={countdownText(kpis.nextReset?.window.resetAt, tTime) ?? "—"}
                sub={
                  kpis.nextReset
                    ? `${kpis.nextReset.account.providerName} · ${windowName(kpis.nextReset.window)}`
                    : undefined
                }
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortAccountsByUrgency(accounts).map((account) => (
              <AccountCard key={account.id} account={account} onRefreshed={requestRefresh} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  subTone = "muted",
  valueTone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subTone?: "muted" | "error";
  valueTone?: "default" | "error";
}) {
  return (
    <Card data-testid="kpi-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <span className="text-muted-foreground/70 [&_svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 font-heading text-2xl font-semibold tabular-nums",
            valueTone === "error" && "text-destructive",
          )}
        >
          {value}
        </p>
        {sub ? (
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              subTone === "error" ? "text-destructive-foreground" : "text-muted-foreground",
            )}
            title={sub}
          >
            {sub}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
