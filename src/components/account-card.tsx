"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { AccountStatusBadges } from "@/components/account-status";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar, quotaTextClassName } from "@/components/quota-bar";
import { SparkStrip } from "@/components/spark-strip";
import type { AccountView, Window } from "@/lib/types";
import { relativeTimeText, resetText, unitName, windowAmountText, windowName, windowPctText } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tightestWindow } from "@/lib/overview";

export function AccountCard({ account, onRefreshed }: { account: AccountView; onRefreshed?: () => void }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const isError = account.latestSnapshot?.status === "error";
  const hero = tightestWindow(display);
  const heroReset = resetText(hero?.resetAt, tTime);

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
      className={cn(
        "h-full transition-[border-color,box-shadow] hover:shadow-xs",
        isError && "border-destructive/60",
        !account.enabled && "bg-muted",
      )}
      data-testid="account-card"
      data-account-error={isError ? "true" : undefined}
    >
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <ProviderMonogram name={account.providerName} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${account.id}`}
            className="block truncate font-medium after:absolute after:inset-0 hover:underline"
            data-testid="account-link"
          >
            {account.providerName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{account.label}</p>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <AccountStatusBadges account={account} />
          <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={busy} aria-label={t("overview.refresh")}>
            <RefreshCw className={busy ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isError ? (
          <p
            className="relative z-10 rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive-foreground break-words dark:bg-destructive/16"
            data-testid="error-message"
          >
            {account.latestSnapshot?.error ?? "error"}
          </p>
        ) : null}
        {hero && typeof hero.remainingPct === "number" ? (
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{windowName(hero, t)}</p>
              <p
                className={cn(
                  "font-heading text-3xl font-semibold tabular-nums",
                  quotaTextClassName(hero.remainingPct, account.warnThreshold),
                )}
                data-testid="hero-pct"
              >
                {windowPctText(hero)}
              </p>
              {windowAmountText(hero, unitName(hero.unit, t)) ? (
                <p className="truncate text-xs tabular-nums text-muted-foreground">
                  {windowAmountText(hero, unitName(hero.unit, t))}
                </p>
              ) : null}
              {heroReset ? (
                <p className="text-xs text-muted-foreground">
                  {t("overview.windowReset")}: {heroReset}
                </p>
              ) : null}
            </div>
            <QuotaBar pct={hero.remainingPct} warnPct={account.warnThreshold} label={windowName(hero, t)} />
            <SparkStrip points={account.spark ?? []} warnPct={account.warnThreshold} />
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
        ) : (
          <p className="text-sm text-muted-foreground">{t("overview.noData")}</p>
        )}
        <p className="mt-auto text-xs text-muted-foreground">
          {t("overview.lastSuccess")}:{" "}
          {account.lastOkSnapshot
            ? (relativeTimeText(account.lastOkSnapshot.fetchedAt, tTime) ?? t("overview.never"))
            : t("overview.never")}
        </p>
      </CardContent>
    </Card>
  );
}

function WindowRow({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const pct = w.remainingPct;
  const amount = windowAmountText(w, unitName(w.unit, t));
  const reset = resetText(w.resetAt, tTime);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{windowName(w, t)}</span>
        <span
          className={cn("shrink-0 text-xs tabular-nums", quotaTextClassName(pct, warnPct) || "text-muted-foreground")}
          data-testid="window-value"
        >
          {[windowPctText(w), amount].filter(Boolean).join(" · ")}
        </span>
      </div>
      {pct !== undefined ? <QuotaBar pct={pct} warnPct={warnPct} label={windowName(w, t)} size="sm" /> : null}
      {reset ? (
        <p className="text-xs text-muted-foreground">
          {t("overview.windowReset")}: {reset}
        </p>
      ) : null}
    </div>
  );
}
