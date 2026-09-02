"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogViewport,
} from "@/components/ui/alert-dialog";
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
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar, quotaTextClassName } from "@/components/quota-bar";
import { SnapshotHistory } from "@/components/snapshot-history";
import { StatStrip, StatStripItem, StatTile } from "@/components/stat-strip";
import { TrendChart } from "@/components/trend-chart";
import { UsageCard } from "@/components/usage-card";
import type { AccountView, CredentialFieldView, HistorySnapshot, ProviderView } from "@/lib/types";
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
} from "@/lib/format";
import { nextResetWindow, tightestWindow } from "@/lib/overview";
import { parseModelUsage } from "@/lib/model-usage";

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
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const [accountsRes, historyRes, providersRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch(`/api/accounts/${id}/snapshots`),
        fetch("/api/providers"),
      ]);
      if (accountsRes.ok) {
        const data = (await accountsRes.json()) as { accounts: AccountView[] };
        if (!ignore) setAccount(data.accounts.find((item) => item.id === id) ?? null);
      }
      if (historyRes.ok) {
        const data = (await historyRes.json()) as { snapshots: HistorySnapshot[] };
        if (!ignore) setHistory(data.snapshots);
      }
      if (providersRes.ok) {
        const data = (await providersRes.json()) as { providers: ProviderView[] };
        if (!ignore) setProviders(data.providers);
      }
      if (!ignore) setLoaded(true);
    }

    void load();
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

  const remove = async () => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
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
            <EmptyDescription>{tDetail("back")}</EmptyDescription>
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
  const hero = tightestWindow(display);
  // raw 列形状：{ meta: 适配器 meta, responses: 调试切片 }（见 schema.ts 注释）
  const raw = display?.meta as { meta?: { modelUsage?: unknown } } | null | undefined;
  const usage = parseModelUsage(raw?.meta?.modelUsage);
  const nextReset = nextResetWindow(windows);
  const balance = display?.balance;
  const hasBalanceWindow = windows.some((w) => w.kind === "balance");

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
        icon={<ProviderMonogram name={account.providerName} size="lg" />}
        title={account.providerName}
        description={
          <>
            <span className="truncate">{account.label}</span>
            <AccountStatusBadges account={account} showOk />
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? t("overview.refreshing") : tDetail("refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              {tDetail("edit")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive-outline" size="sm" />}>
                {tDetail("delete")}
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogBackdrop />
                <AlertDialogViewport>
                  <AlertDialogPopup>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{tDetail("deleteConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{tDetail("deleteConfirmBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogClose>{tDetail("cancel")}</AlertDialogClose>
                      <AlertDialogClose
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={remove}
                      >
                        {tDetail("deleteConfirmOk")}
                      </AlertDialogClose>
                    </AlertDialogFooter>
                  </AlertDialogPopup>
                </AlertDialogViewport>
              </AlertDialogPortal>
            </AlertDialog>
          </>
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
          label={tDetail("summaryTightest")}
          value={hero ? (windowPctText(hero) ?? "—") : "—"}
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
          {windows.length === 0 && !balance ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tDetail("windowsEmpty")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {windows.map((w, index) => {
                const name = windowName(w, t);
                const amount = windowAmountText(w, unitName(w.unit, t));
                return (
                  <StatTile
                    key={index}
                    label={name}
                    value={windowPctText(w, 1) ?? amount ?? "—"}
                    valueClassName={quotaTextClassName(w.remainingPct, account.warnThreshold)}
                    hint={
                      [
                        windowPctText(w) !== null ? amount : null,
                        w.resetAt
                          ? `${t("overview.windowReset")} ${shortDateTime(w.resetAt, locale)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {w.remainingPct !== undefined ? (
                      <QuotaBar
                        pct={w.remainingPct}
                        warnPct={account.warnThreshold}
                        label={name}
                        size="sm"
                        className="mt-2"
                      />
                    ) : null}
                  </StatTile>
                );
              })}
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

      {usage ? <UsageCard usage={usage} /> : null}

      <TrendChart history={history} warnPct={account.warnThreshold} />

      {history ? (
        <SnapshotHistory history={history} warnPct={account.warnThreshold} />
      ) : (
        <Skeleton className="h-48 rounded-2xl" />
      )}

      <p className="sr-only" aria-live="polite">
        {refreshing ? tCommon("loading") : ""}
      </p>

      <EditAccountDialog
        account={account}
        fields={providerFields(account, providers)}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={requestRefresh}
      />
    </div>
  );
}

function providerFields(account: AccountView, providers: ProviderView[]): CredentialFieldView[] {
  return providers.find((p) => p.id === account.providerId)?.fields ?? [];
}
