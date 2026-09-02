"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/account-card";
import { FilterChips } from "@/components/filter-chips";
import { PageHeader } from "@/components/page-header";
import { StatStrip, StatStripItem } from "@/components/stat-strip";
import type { AccountView } from "@/lib/types";
import {
  accountGridClassName,
  overviewKpis,
  partitionAccounts,
  type AccountSection,
} from "@/lib/overview";
import { countdownText, windowName, windowPctText } from "@/lib/format";

type FilterValue = "all" | AccountSection;

export default function OverviewPage() {
  const t = useTranslations("overview");
  const tRoot = useTranslations();
  const tTime = useTranslations("time");
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
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

  const parts = useMemo(() => (accounts ? partitionAccounts(accounts) : null), [accounts]);

  if (accounts === null || parts === null) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Skeleton className="h-20 rounded-xl" />
        <div className={accountGridClassName(2)}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = overviewKpis(accounts);
  const kpiSub =
    kpis.errorCount > 0
      ? t("kpiErrors", { count: kpis.errorCount })
      : kpis.disabledCount > 0
        ? t("kpiDisabled", { count: kpis.disabledCount })
        : t("kpiAllOk");

  const filterOptions = [
    { value: "all" as const, label: t("filterAll"), count: accounts.length },
    { value: "attention" as const, label: t("filterAttention"), count: parts.attention.length },
    { value: "healthy" as const, label: t("filterHealthy"), count: parts.healthy.length },
    { value: "disabled" as const, label: t("filterDisabled"), count: parts.disabled.length },
  ];

  const showSections =
    filter === "all" &&
    parts.attention.length > 0 &&
    parts.healthy.length + parts.disabled.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {error ? (
        <Alert variant="error">
          <AlertDescription>{t("loadFailed")}</AlertDescription>
        </Alert>
      ) : null}
      {accounts.length === 0 && !error ? (
        <Empty className="rounded-xl border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{t("empty")}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            <Button render={<Link href="/settings" />}>{t("goSettings")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <StatStrip data-testid="kpi-band">
            <StatStripItem
              data-testid="kpi-card"
              label={t("kpiAccounts")}
              value={String(kpis.total)}
              hint={kpiSub}
            />
            <StatStripItem
              data-testid="kpi-card"
              label={t("kpiTightest")}
              value={kpis.tightest ? (windowPctText(kpis.tightest.window) ?? "—") : "—"}
              hint={
                kpis.tightest
                  ? `${kpis.tightest.account.providerName} · ${kpis.tightest.account.label} · ${windowName(kpis.tightest.window, tRoot)}`
                  : undefined
              }
              tone={kpis.tightest && kpis.tightest.window.remainingPct! < kpis.tightest.account.warnThreshold ? "critical" : "default"}
            />
            <StatStripItem
              data-testid="kpi-card"
              label={t("kpiNextReset")}
              value={countdownText(kpis.nextReset?.window.resetAt, tTime) ?? "—"}
              hint={
                kpis.nextReset
                  ? `${kpis.nextReset.account.providerName} · ${windowName(kpis.nextReset.window, tRoot)}`
                  : undefined
              }
            />
          </StatStrip>

          <FilterChips
            label={t("title")}
            value={filter}
            options={filterOptions}
            onValueChange={setFilter}
          />

          {showSections ? (
            <div className="space-y-8">
              <AccountSection
                title={t("attention")}
                accounts={parts.attention}
                onRefreshed={requestRefresh}
              />
              {parts.healthy.length > 0 ? (
                <AccountSection
                  title={t("healthy")}
                  accounts={parts.healthy}
                  onRefreshed={requestRefresh}
                />
              ) : null}
              {parts.disabled.length > 0 ? (
                <AccountSection
                  title={t("disabled")}
                  accounts={parts.disabled}
                  onRefreshed={requestRefresh}
                />
              ) : null}
            </div>
          ) : (
            <AccountGrid
              accounts={
                filter === "all"
                  ? [...parts.attention, ...parts.healthy, ...parts.disabled]
                  : parts[filter]
              }
              empty={t("filterEmpty")}
              onRefreshed={requestRefresh}
            />
          )}
        </>
      )}
    </div>
  );
}

function AccountSection({
  title,
  accounts,
  onRefreshed,
}: {
  title: string;
  accounts: AccountView[];
  onRefreshed: () => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <AccountGrid accounts={accounts} onRefreshed={onRefreshed} />
    </section>
  );
}

function AccountGrid({
  accounts,
  empty,
  onRefreshed,
}: {
  accounts: AccountView[];
  empty?: string;
  onRefreshed: () => void;
}) {
  if (accounts.length === 0) {
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  }
  return (
    <div className={accountGridClassName(accounts.length)}>
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} onRefreshed={onRefreshed} />
      ))}
    </div>
  );
}
