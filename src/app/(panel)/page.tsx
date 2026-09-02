"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/account-card";
import type { AccountView } from "@/lib/types";
import { overviewKpis, sortAccountsByUrgency } from "@/lib/overview";
import { countdownText } from "@/lib/format";
import type { ReactNode } from "react";

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
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-24 rounded-xl" data-testid="kpi-band" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
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
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tRoot("app.description")}</p>
      </div>
      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{t("loadFailed")}</CardContent>
        </Card>
      ) : null}
      {accounts.length === 0 && !error ? (
        <Empty className="rounded-2xl border border-border">
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
            <Card data-testid="kpi-band">
              <CardContent className="grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <StatCell
                  label={t("kpiAccounts")}
                  value={String(kpis.enabledTotal)}
                  sub={
                    kpis.errorCount > 0
                      ? t("kpiErrors", { count: kpis.errorCount })
                      : t("kpiAllOk")
                  }
                />
                <StatCell
                  label={t("kpiTightest")}
                  value={kpis.tightest ? `${kpis.tightest.window.remainingPct!.toFixed(0)}%` : "—"}
                  sub={
                    kpis.tightest
                      ? `${kpis.tightest.account.providerName} · ${kpis.tightest.account.label} · ${windowName(kpis.tightest.window)}`
                      : undefined
                  }
                />
                <StatCell
                  label={t("kpiNextReset")}
                  value={countdownText(kpis.nextReset?.window.resetAt, tTime) ?? "—"}
                  sub={
                    kpis.nextReset
                      ? `${kpis.nextReset.account.providerName} · ${windowName(kpis.nextReset.window)}`
                      : undefined
                  }
                />
              </CardContent>
            </Card>
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

function StatCell({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div data-testid="kpi-card" className="p-4 sm:p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold leading-snug tabular-nums sm:text-2xl">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
