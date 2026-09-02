"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, TriangleAlert } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountView, CredentialFieldView, HistorySnapshot, ProviderView, Window } from "@/lib/types";
import {
  localDateTime,
  quotaTone,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
} from "@/lib/format";
import { parseModelUsage } from "@/lib/model-usage";
import { cn } from "@/lib/utils";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar } from "@/components/quota-bar";
import { SnapshotHistory } from "@/components/snapshot-history";
import { TrendChart } from "@/components/trend-chart";
import { UsageCard } from "@/components/usage-card";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const tDetail = useTranslations("detail");
  const router = useRouter();
  const [account, setAccount] = useState<AccountView | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[] | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    let ignore = false;

    // 各接口独立落地：最慢的请求不把已经拿到的头部与指标压在骨架屏后面。
    async function load() {
      fetch("/api/accounts").then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { accounts: AccountView[] };
        if (!ignore) setAccount(data.accounts.find((item) => item.id === id) ?? null);
      });
      fetch(`/api/accounts/${id}/snapshots`).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { snapshots: HistorySnapshot[] };
        if (!ignore) setHistory(data.snapshots);
      });
      fetch("/api/providers").then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { providers: ProviderView[] };
        if (!ignore) setProviders(data.providers);
      });
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [id, refreshVersion]);

  const remove = async () => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  };

  if (!account) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  // raw 列形状：{ meta: 适配器 meta, responses: 调试切片 }（见 schema.ts 注释）
  const raw = display?.meta as { meta?: { modelUsage?: unknown } } | null | undefined;
  const usage = parseModelUsage(raw?.meta?.modelUsage);
  const isError = account.latestSnapshot?.status === "error";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/" />}
            className="-ms-2 text-muted-foreground"
          >
            <ArrowLeft />
            {tDetail("back")}
          </Button>
        }
        icon={<ProviderMonogram name={account.providerName} />}
        title={account.providerName}
        description={account.label}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              {tDetail("edit")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
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
                      <AlertDialogClose render={<Button variant="destructive" />} onClick={remove}>
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

      {isError ? (
        <Card className="border-destructive/48" data-testid="detail-error">
          <CardContent className="flex items-start gap-3 py-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive-foreground" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-destructive-foreground">{tDetail("statusError")}</p>
              <p className="break-words text-sm text-muted-foreground">{account.latestSnapshot?.error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 窗口详情 */}
      {display && display.windows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />} className="text-base">
              {tDetail("windows")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {display.windows.map((w, index) => (
              <WindowTile key={index} w={w} warnPct={account.warnThreshold} />
            ))}
          </CardContent>
        </Card>
      ) : null}

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

/** 窗口详情格：名称 / 读数 / 额度条 / 绝对量与重置时刻，与概览卡同一套分级色。 */
function WindowTile({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const pct = w.remainingPct;
  const name = windowName(w, t);
  const amount = windowAmountText(w, unitName(w.unit, t));
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{name}</p>
        <p
          className={cn(
            "shrink-0 font-heading text-lg font-semibold tabular-nums",
            pct !== undefined &&
              quotaTone(pct, warnPct) !== "normal" &&
              (quotaTone(pct, warnPct) === "critical"
                ? "text-destructive-foreground"
                : "text-warning-foreground"),
          )}
        >
          {windowPctText(w) ?? amount ?? "—"}
        </p>
      </div>
      {pct !== undefined ? <QuotaBar pct={pct} warnPct={warnPct} label={name} size="sm" /> : null}
      <p className="truncate text-xs tabular-nums text-muted-foreground">
        {[
          windowPctText(w) !== null ? amount : null,
          w.resetAt ? `${t("overview.windowReset")} ${localDateTime(w.resetAt)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function providerFields(account: AccountView, providers: ProviderView[]): CredentialFieldView[] {
  return providers.find((p) => p.id === account.providerId)?.fields ?? [];
}
