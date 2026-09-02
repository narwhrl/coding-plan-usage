"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { RefreshCw } from "lucide-react";
import type { AccountView, Window } from "@/lib/types";
import { countdownText, monogram, relativeTime, windowValueText } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tightestWindow } from "@/lib/overview";
import { Sparkline } from "@/components/sparkline";

export function AccountCard({ account, onRefreshed }: { account: AccountView; onRefreshed?: () => void }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const isError = account.latestSnapshot?.status === "error";
  const hero = tightestWindow(display);
  const heroReset = countdownText(hero?.resetAt, tTime);
  const heroValue = hero ? windowValueText(hero, t(`unit.${hero.unit}`, { defaultValue: hero.unit })) : "";

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
          ? "border-destructive/50 transition-colors"
          : account.enabled
            ? "transition-[border-color,box-shadow] hover:shadow-xs"
            : "opacity-60 transition-colors"
      }
      data-testid="account-card"
      data-account-error={isError ? "true" : undefined}
    >
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 font-heading text-sm font-semibold text-muted-foreground"
          aria-hidden
        >
          {monogram(account.providerName)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${account.id}`}
            className="block truncate text-sm font-medium hover:underline"
            data-testid="account-link"
          >
            {account.providerName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{account.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 状态只显示最重要的一个：error > 预警 > 停用 */}
          {isError ? (
            <Badge variant="error" data-testid="error-badge">
              {t("overview.error")}
            </Badge>
          ) : account.warn ? (
            <Badge variant="warning" data-testid="warn-badge">
              {t("overview.lowQuota")}
            </Badge>
          ) : !account.enabled ? (
            <Badge variant="secondary">{t("overview.disabled")}</Badge>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={busy} aria-label={t("overview.refresh")}>
            <RefreshCw className={busy ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isError ? (
          <p
            className="rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive-foreground break-words dark:bg-destructive/16"
            data-testid="error-message"
          >
            {account.latestSnapshot?.error ?? "error"}
          </p>
        ) : null}
        {hero && typeof hero.remainingPct === "number" ? (
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {hero.label ?? t(`window.${hero.kind}`, { defaultValue: hero.kind })}
              </p>
              <p
                className={cn(
                  "font-heading text-3xl font-semibold leading-tight tabular-nums",
                  hero.remainingPct < account.warnThreshold && "text-destructive",
                )}
                data-testid="hero-pct"
              >
                {hero.remainingPct.toFixed(0)}
                <span className="text-base font-medium">%{heroValue ? ` · ${heroValue}` : ""}</span>
              </p>
              {heroReset ? (
                <p className="text-xs text-muted-foreground">
                  {t("overview.windowReset")}: {heroReset}
                </p>
              ) : null}
            </div>
            <Sparkline points={account.spark ?? []} />
          </div>
        ) : null}
        {display && display.windows.length > 0 ? (
          <div className="space-y-3">
            {display.windows
              .filter((w) => w !== hero)
              .map((w, index) => (
                <WindowRow key={index} w={w} warnPct={account.warnThreshold} />
              ))}
          </div>
        ) : hero ? null : (
          <p className="text-sm text-muted-foreground">{t("overview.noData")}</p>
        )}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">
          {t("overview.lastSuccess")}:{" "}
          {account.lastOkSnapshot ? relativeTime(account.lastOkSnapshot.fetchedAt, locale) : t("overview.never")}
        </p>
      </CardContent>
    </Card>
  );
}

function WindowRow({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const pct = w.remainingPct;
  const unitLabel = t(`unit.${w.unit}`, { defaultValue: w.unit });
  const value = windowValueText(w, unitLabel);
  const reset = countdownText(w.resetAt, tTime);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">
          {w.label ?? t(`window.${w.kind}`, { defaultValue: w.kind })}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="window-value">
          {[pct !== undefined ? `${pct.toFixed(0)}%` : "", value].filter(Boolean).join(" · ")}
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
