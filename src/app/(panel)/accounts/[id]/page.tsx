"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AccountStatusBadges } from "@/components/account-status";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar, quotaTextClassName } from "@/components/quota-bar";
import { SnapshotHistory } from "@/components/snapshot-history";
import { StatStrip, StatStripItem } from "@/components/stat-strip";
import { TrendChart } from "@/components/trend-chart";
import { UsageCard } from "@/components/usage-card";
import type { AccountView, CredentialFieldView, HistorySnapshot, ProviderView } from "@/lib/types";
import {
  countdownText,
  relativeTimeText,
  resetText,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
} from "@/lib/format";
import { nextResetWindow, tightestWindow } from "@/lib/overview";
import { parseModelUsage } from "@/lib/model-usage";
import { cn } from "@/lib/utils";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations();
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [history, setHistory] = useState<HistorySnapshot[] | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;

    async function loadAccount() {
      const response = await fetch("/api/accounts");
      if (!response.ok) {
        if (!ignore) setAccount(null);
        return;
      }
      const data = (await response.json()) as { accounts: AccountView[] };
      if (!ignore) setAccount(data.accounts.find((item) => item.id === id) ?? null);
    }

    async function loadHistory() {
      const response = await fetch(`/api/accounts/${id}/snapshots`);
      if (!response.ok) return;
      const data = (await response.json()) as { snapshots: HistorySnapshot[] };
      if (!ignore) setHistory(data.snapshots);
    }

    async function loadProviders() {
      const response = await fetch("/api/providers");
      if (!response.ok) return;
      const data = (await response.json()) as { providers: ProviderView[] };
      if (!ignore) setProviders(data.providers);
    }

    void loadAccount();
    void loadHistory();
    void loadProviders();
    return () => {
      ignore = true;
    };
  }, [id, refreshVersion]);

  const remove = async () => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  };

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/accounts/${id}/refresh`, { method: "POST" });
      requestRefresh();
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (account === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (account === null) {
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
                  <BreadcrumbPage>{t("detail.notFound")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          title={t("detail.notFound")}
          description={t("detail.notFoundHint")}
          actions={
            <Button variant="outline" size="sm" render={<Link href="/" />}>
              {t("detail.back")}
            </Button>
          }
        />
      </div>
    );
  }

  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const raw = display?.meta as { meta?: { modelUsage?: unknown } } | null | undefined;
  const usage = parseModelUsage(raw?.meta?.modelUsage);
  const hero = tightestWindow(display);
  const nextReset = nextResetWindow(display?.windows ?? []);
  const intervalMinutes = account.config.intervalMinutes;

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
            <span>{account.label}</span>
            <AccountStatusBadges account={account} showOk />
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refreshNow} disabled={refreshing}>
              {t("detail.refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              {t("detail.edit")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                {t("detail.delete")}
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogBackdrop />
                <AlertDialogViewport>
                  <AlertDialogPopup>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("detail.deleteConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("detail.deleteConfirmBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogClose>{t("detail.cancel")}</AlertDialogClose>
                      <AlertDialogClose
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={remove}
                      >
                        {t("detail.deleteConfirmOk")}
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
          <AlertDescription>{account.latestSnapshot.error}</AlertDescription>
        </Alert>
      ) : null}

      <StatStrip>
        <StatStripItem
          label={t("detail.summaryTightest")}
          value={hero ? (windowPctText(hero) ?? "—") : "—"}
          hint={hero ? windowName(hero, t) : undefined}
          tone={hero && hero.remainingPct! < account.warnThreshold ? "critical" : "default"}
        />
        <StatStripItem
          label={t("detail.summaryNextReset")}
          value={countdownText(nextReset?.resetAt, tTime) ?? "—"}
          hint={nextReset ? windowName(nextReset, t) : undefined}
        />
        <StatStripItem
          label={t("detail.summaryLastSuccess")}
          value={
            account.lastOkSnapshot
              ? (relativeTimeText(account.lastOkSnapshot.fetchedAt, tTime) ?? t("overview.never"))
              : t("overview.never")
          }
        />
        <StatStripItem
          label={t("detail.summaryInterval")}
          value={
            intervalMinutes
              ? `${intervalMinutes} ${tCommon("minutes")}`
              : t("detail.intervalDefault")
          }
          hint={`${t("detail.summaryWarn")} ${account.warnThreshold}%`}
        />
      </StatStrip>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />} className="text-base">
            {t("detail.windows")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {display && display.windows.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {display.windows.map((w, index) => {
                const amount = windowAmountText(w, unitName(w.unit, t));
                const reset = resetText(w.resetAt, tTime);
                return (
                  <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold">{windowName(w, t)}</p>
                    <p
                      className={cn(
                        "font-heading text-lg font-semibold tabular-nums",
                        quotaTextClassName(w.remainingPct, account.warnThreshold),
                      )}
                    >
                      {windowPctText(w, 1) ?? "—"}
                    </p>
                    {amount ? <p className="text-sm tabular-nums text-muted-foreground">{amount}</p> : null}
                    {w.remainingPct !== undefined ? (
                      <QuotaBar pct={w.remainingPct} warnPct={account.warnThreshold} label={windowName(w, t)} />
                    ) : null}
                    {reset ? (
                      <p className="text-xs text-muted-foreground">
                        {t("overview.windowReset")}: {reset}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("detail.windowsEmpty")}</p>
          )}
        </CardContent>
      </Card>

      {usage ? <UsageCard usage={usage} /> : null}

      <TrendChart history={history} warnPct={account.warnThreshold} />
      <SnapshotHistory history={history} />

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
