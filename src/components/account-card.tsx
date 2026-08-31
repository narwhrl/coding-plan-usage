"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { AccountView, Window } from "@/lib/types";
import { countdownText, monogram, relativeTime, windowValueText } from "@/lib/format";

export function AccountCard({ account, onRefreshed }: { account: AccountView; onRefreshed?: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const isError = account.latestSnapshot?.status === "error";

  const refresh = async () => {
    setBusy(true);
    try {
      await fetch(`/api/accounts/${account.id}/refresh`, { method: "POST" });
      onRefreshed?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className={
        isError
          ? "border-destructive/60 transition-colors"
          : account.enabled
            ? "transition-colors"
            : "opacity-60 transition-colors"
      }
      data-testid="account-card"
      data-account-error={isError ? "true" : undefined}
    >
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-heading text-sm font-semibold text-muted-foreground">
          {monogram(account.providerName)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${account.id}`}
            className="block truncate font-medium hover:underline"
            data-testid="account-link"
          >
            {account.providerName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{account.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {account.warn ? (
            <Badge variant="destructive" data-testid="warn-badge">
              <TriangleAlert />
              {t("overview.lowQuota")}
            </Badge>
          ) : null}
          {!account.enabled ? <Badge variant="secondary">{t("overview.disabled")}</Badge> : null}
          {isError ? (
            <Badge variant="error" data-testid="error-badge">
              {t("overview.error")}
            </Badge>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={busy} aria-label={t("overview.refresh")}>
            <RefreshCw className={busy ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError ? (
          <p className="rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive-foreground break-words dark:bg-destructive/16" data-testid="error-message">
            {account.latestSnapshot?.error ?? "error"}
          </p>
        ) : null}
        {display && display.windows.length > 0 ? (
          <div className="space-y-3">
            {display.windows.map((w, index) => (
              <WindowRow key={index} w={w} warnPct={account.warnThreshold} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("overview.noData")}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("overview.lastSuccess")}: {account.lastOkSnapshot ? relativeTime(account.lastOkSnapshot.fetchedAt) : t("overview.never")}
        </p>
      </CardContent>
    </Card>
  );
}

function WindowRow({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const pct = w.remainingPct;
  const unitLabel = t(`unit.${w.unit}`, { defaultValue: w.unit });
  const reset = countdownText(w.resetAt, t);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">
          {w.label ?? t(`window.${w.kind}`, { defaultValue: w.kind })}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="window-value">
          {pct !== undefined ? `${pct.toFixed(0)}%` : ""} {windowValueText(w, unitLabel)}
        </span>
      </div>
      {pct !== undefined ? (
        <Progress value={Math.max(0, Math.min(100, pct))}>
          <ProgressTrack>
            <ProgressIndicator className={pct < warnPct ? "bg-destructive" : undefined} />
          </ProgressTrack>
        </Progress>
      ) : null}
      {reset ? (
        <p className="text-xs text-muted-foreground">
          {t("overview.windowReset")}: {reset}
        </p>
      ) : null}
    </div>
  );
}
