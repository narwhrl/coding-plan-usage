"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountStatusBadges } from "@/components/account-status";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar, quotaTextClassName } from "@/components/quota-bar";
import { SnapshotHistory } from "@/components/snapshot-history";
import { StatStrip, StatStripItem, StatTile } from "@/components/stat-strip";
import { TrendChart } from "@/components/trend-chart";
import { TokenUsageCard } from "@/components/token-usage-card";
import { UsageCard } from "@/components/usage-card";
import type { AccountView, HistorySnapshot, Window } from "@/lib/types";
import {
  compactNumber,
  countdownText,
  quotaTone,
  relativeTimeText,
  shortDateTime,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
  windowPrimaryText,
} from "@/lib/format";
import { heroWindow, nextResetWindow } from "@/lib/overview";
import { accountForDisplay, historyForCurrency, parseDisplayCurrency } from "@/lib/display-currency";
import { parseModelUsage } from "@/lib/model-usage";
import { parseTokenUsage } from "@/lib/token-usage";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations();
  const tDetail = useTranslations("detail");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [accountRow, setAccountRow] = useState<AccountView | null>(null);
  const [accountId, setAccountId] = useState(id);
  const [historyRows, setHistoryRows] = useState<HistorySnapshot[] | null>(null);
  const [historyId, setHistoryId] = useState(id);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);
  const shownAccount = accountId === id ? accountRow : null;
  const shownState = accountId === id ? loadState : "loading";
  const shownHistory = historyId === id ? historyRows : null;

  useEffect(() => {
    let ignore = false;

    // 账户和快照各自落地：慢的历史接口不该拖住头部。失败要能和「账户不存在」分开。
    async function loadAccount() {
      try {
        const res = await fetch("/api/accounts");
        if (ignore) return;
        if (!res.ok) {
          setAccountRow(null);
          setAccountId(id);
          setLoadState("error");
          return;
        }
        const data = (await res.json()) as { accounts: AccountView[] };
        if (ignore) return;
        const found = data.accounts.find((item) => item.id === id) ?? null;
        setAccountRow(found);
        setAccountId(id);
        setLoadState(found ? "ok" : "missing");
      } catch {
        if (!ignore) {
          setAccountRow(null);
          setAccountId(id);
          setLoadState("error");
        }
      }
    }

    async function loadHistory() {
      try {
        const res = await fetch(`/api/accounts/${id}/snapshots`);
        if (ignore) return;
        if (!res.ok) {
          setHistoryRows([]);
          setHistoryId(id);
          return;
        }
        const data = (await res.json()) as { snapshots: HistorySnapshot[] };
        if (!ignore) {
          setHistoryRows(data.snapshots);
          setHistoryId(id);
        }
      } catch {
        if (!ignore) {
          setHistoryRows([]);
          setHistoryId(id);
        }
      }
    }

    void loadAccount();
    void loadHistory();
    return () => {
      ignore = true;
    };
  }, [id, refreshVersion]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/accounts/${id}/refresh`, { method: "POST" });
      requestRefresh();
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };


  if (!shownAccount) {
    if (shownState === "loading") {
      return (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-72" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      );
    }
    if (shownState === "error") {
      return (
        <div className="space-y-6">
          <Alert variant="error">
            <TriangleAlert />
            <AlertTitle>{tDetail("loadFailed")}</AlertTitle>
          </Alert>
          <Button variant="outline" onClick={() => requestRefresh()}>
            {tCommon("retry")}
          </Button>
        </div>
      );
    }
    return (
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>{tDetail("notFound")}</EmptyTitle>
            <EmptyDescription>{tDetail("notFoundHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/" />}>{tDetail("back")}</Button>
          </EmptyContent>
        </Empty>
      </Card>
    );
  }

  const account = shownAccount;
  const history = shownHistory;
  const shown = accountForDisplay(account);
  const display = shown.lastOkSnapshot ?? shown.latestSnapshot;
  const windows = display?.windows ?? [];
  const historyShown = historyForCurrency(history, parseDisplayCurrency(account.config.displayCurrency));
  const hero = heroWindow(display);
  const heroIsPct = hero?.remainingPct !== undefined;
  const usage = parseModelUsage(display?.meta?.modelUsage);
  const tokenUsage = parseTokenUsage(display?.meta?.tokenUsage);
  const nextReset = nextResetWindow(windows);
  const balance = display?.balance;
  const hasBalanceWindow = windows.some((w) => w.kind === "balance");
  const majorWindows = windows.filter((w) => !w.minor);
  const modelLanes = windows.filter((w) => w.minor);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/" />}>{t("nav.overview")}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{account.providerName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        icon={<ProviderMonogram name={account.providerName} providerId={account.providerId} size="lg" />}
        title={account.providerName}
        description={
          <>
            <span className="truncate">{account.label}</span>
            <AccountStatusBadges account={account} showOk />
          </>
        }
        actions={
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refresh}
            disabled={refreshing}
            aria-label={tDetail("refresh")}
            data-testid="refresh-account"
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
          </Button>
        }
      />

      {account.latestSnapshot?.status === "error" ? (
        <Alert variant="error">
          <TriangleAlert />
          <AlertTitle>{tDetail("statusError")}</AlertTitle>
          <AlertDescription className="break-words">
            {account.latestSnapshot.error}
            {account.consecutiveFailures > 1 ? (
              <span className="mt-1 block">
                {tDetail("consecutiveFailures", { count: account.consecutiveFailures })}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <StatStrip>
        <StatStripItem
          label={hero && !heroIsPct ? tDetail("summaryBalance") : tDetail("summaryTightest")}
          value={hero ? (windowPrimaryText(hero, t) ?? "—") : "—"}
          tone={quotaTone(hero?.remainingPct, account.warnThreshold) === "critical" ? "critical" : "default"}
          hint={hero ? windowName(hero, t) : undefined}
        />
        <StatStripItem
          label={tDetail("summaryNextReset")}
          value={countdownText(nextReset?.resetAt, tTime) ?? "—"}
          hint={nextReset ? windowName(nextReset, t) : undefined}
        />
        <StatStripItem
          label={tDetail("summaryInterval")}
          value={
            account.config.intervalMinutes
              ? tTime("minutes", { count: account.config.intervalMinutes })
              : tDetail("intervalDefault")
          }
          hint={`${tDetail("summaryWarn")} ${account.warnThreshold}%`}
        />
        <StatStripItem
          label={tDetail("summaryLastSuccess")}
          value={
            account.lastOkSnapshot
              ? (relativeTimeText(account.lastOkSnapshot.fetchedAt, tTime) ?? "—")
              : t("overview.never")
          }
          hint={
            account.lastOkSnapshot
              ? shortDateTime(account.lastOkSnapshot.fetchedAt, locale)
              : undefined
          }
        />
      </StatStrip>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />} className="text-base">
            {tDetail("windows")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {majorWindows.length === 0 && !balance ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tDetail("windowsEmpty")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {majorWindows.map((w, index) => (
                <WindowStatTile key={index} w={w} warnPct={account.warnThreshold} />
              ))}
              {balance && !hasBalanceWindow ? (
                <StatTile
                  label={tDetail("summaryBalance")}
                  value={`${compactNumber(balance.amount)}${balance.currency ? ` ${balance.currency}` : ""}`}
                />
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {modelLanes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />} className="text-base">
              {tDetail("modelLanes")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {modelLanes.map((w, index) => (
                <WindowStatTile key={index} w={w} warnPct={account.warnThreshold} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {usage ? <UsageCard usage={usage} /> : null}
      {tokenUsage ? <TokenUsageCard usage={tokenUsage} /> : null}

      <TrendChart history={historyShown} warnPct={account.warnThreshold} burn={account.burn} />

      <SnapshotHistory history={historyShown} warnPct={account.warnThreshold} />

      <p className="sr-only" aria-live="polite">
        {refreshing ? tCommon("loading") : ""}
      </p>

    </div>
  );
}

/** 窗口详情/模型额度卡片共用的额度 tile：百分比为主值，绝对量与重置时间进 hint。 */
function WindowStatTile({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const name = windowName(w, t);
  const amount = windowAmountText(w, unitName(w.unit, t));
  return (
    <StatTile
      label={name}
      value={windowPctText(w, 1) ?? amount ?? "—"}
      valueClassName={quotaTextClassName(w.remainingPct, warnPct)}
      hint={
        [
          windowPctText(w) !== null ? amount : null,
          w.resetAt ? `${t("overview.windowReset")} ${shortDateTime(w.resetAt, locale)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      {w.remainingPct !== undefined ? (
        <QuotaBar pct={w.remainingPct} warnPct={warnPct} label={name} size="sm" className="mt-2" />
      ) : null}
    </StatTile>
  );
}

