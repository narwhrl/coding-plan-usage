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
  const [account, setAccount] = useState<AccountView | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;

    // 三个请求各自落地，慢的快照接口不该拖住头部和窗口卡片的首屏。
    async function load<T>(url: string, apply: (data: T) => void) {
      try {
        const res = await fetch(url);
        if (!res.ok || ignore) return;
        const data = (await res.json()) as T;
        if (!ignore) apply(data);
      } catch {
        // 网络失败按“无数据”处理，页面留在空态而不是骨架屏。
      }
    }

    void load<{ accounts: AccountView[] }>("/api/accounts", (data) =>
      setAccount(data.accounts.find((item) => item.id === id) ?? null),
    ).finally(() => {
      if (!ignore) setLoaded(true);
    });
    void load<{ snapshots: HistorySnapshot[] }>(`/api/accounts/${id}/snapshots`, (data) =>
      setHistory(data.snapshots),
    );

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


  if (!account) {
    if (!loaded) {
      return (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-72" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
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

  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const windows = display?.windows ?? [];
  const hero = heroWindow(display);
  const heroIsPct = hero?.remainingPct !== undefined;
  // raw 列形状：{ meta: 适配器 meta, responses: 调试切片 }（见 schema.ts 注释）
  const raw = display?.meta as { meta?: { modelUsage?: unknown; tokenUsage?: unknown } } | null | undefined;
  const usage = parseModelUsage(raw?.meta?.modelUsage);
  const tokenUsage = parseTokenUsage(raw?.meta?.tokenUsage);
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
          <AlertDescription className="break-words">{account.latestSnapshot.error}</AlertDescription>
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

      <TrendChart history={history} warnPct={account.warnThreshold} />

      <SnapshotHistory history={history} warnPct={account.warnThreshold} />

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

