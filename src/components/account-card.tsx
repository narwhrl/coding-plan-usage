"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChevronRight, Clock, RefreshCw } from "lucide-react";
import type { AccountView, Window } from "@/lib/types";
import {
  countdownText,
  quotaTone,
  relativeTimeText,
  unitName,
  windowAmountText,
  windowName,
  windowPctText,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { tightestWindow } from "@/lib/overview";
import { AccountStatusBadges } from "@/components/account-status";
import { ProviderMonogram } from "@/components/provider-monogram";
import { QuotaBar, quotaTextClassName } from "@/components/quota-bar";
import { Sparkline } from "@/components/sparkline";

export function AccountCard({ account, onRefreshed }: { account: AccountView; onRefreshed?: () => void }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const display = account.lastOkSnapshot ?? account.latestSnapshot;
  const isError = account.latestSnapshot?.status === "error";
  const hero = tightestWindow(display);
  const heroReset = countdownText(hero?.resetAt, tTime);
  const heroTone = quotaTone(hero?.remainingPct, account.warnThreshold);
  const lastSuccess = relativeTimeText(account.lastOkSnapshot?.fetchedAt, tTime);

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
        "h-full transition-[border-color,box-shadow]",
        isError && "border-destructive/48",
        account.enabled ? "hover:shadow-sm" : "opacity-72",
      )}
      data-testid="account-card"
      data-account-error={isError ? "true" : undefined}
    >
      {/* CardHeader 默认是两行 grid，这里显式 flex 才能把 monogram/名称/刷新排成一行。 */}
      <CardHeader className="flex flex-row items-center gap-3 pb-4">
        <ProviderMonogram name={account.providerName} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${account.id}`}
            className="group flex items-center gap-1 rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="account-link"
          >
            <span className="truncate group-hover:underline">{account.providerName}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <p className="truncate text-xs text-muted-foreground">{account.label}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          disabled={busy}
          aria-label={t("overview.refresh")}
        >
          <RefreshCw className={busy ? "animate-spin" : undefined} />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        {isError || account.warn || !account.enabled ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <AccountStatusBadges account={account} />
          </div>
        ) : null}

        {isError ? (
          <p
            className="rounded-md bg-destructive/8 px-3 py-2 text-xs break-words text-destructive-foreground dark:bg-destructive/16"
            data-testid="error-message"
          >
            {account.latestSnapshot?.error ?? t("overview.error")}
          </p>
        ) : null}

        {hero && hero.remainingPct !== undefined ? (
          <div className="flex items-start justify-between gap-3">
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
              <HeroMeta w={hero} reset={heroReset} />
            </div>
            <Sparkline points={account.spark ?? []} tone={heroTone} />
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

        <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {t("overview.lastSuccess")}:{" "}
          {account.lastOkSnapshot ? (
            <time dateTime={account.lastOkSnapshot.fetchedAt}>{lastSuccess}</time>
          ) : (
            t("overview.never")
          )}
        </p>
      </CardContent>
    </Card>
  );
}

/** hero 窗口的辅助信息：绝对量与重置倒计时各占一行，避免窄卡里被截断。 */
function HeroMeta({ w, reset }: { w: Window; reset: string | null }) {
  const t = useTranslations();
  const amount = windowAmountText(w, unitName(w.unit, t));
  return (
    <>
      {amount ? <p className="truncate text-xs tabular-nums text-muted-foreground">{amount}</p> : null}
      {reset ? (
        <p className="truncate text-xs text-muted-foreground">
          {t("overview.windowReset")} {reset}
        </p>
      ) : null}
    </>
  );
}

function WindowRow({ w, warnPct }: { w: Window; warnPct: number }) {
  const t = useTranslations();
  const tTime = useTranslations("time");
  const pct = w.remainingPct;
  const name = windowName(w, t);
  const amount = windowAmountText(w, unitName(w.unit, t));
  const reset = countdownText(w.resetAt, tTime);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{name}</span>
        <span
          className={cn("shrink-0 tabular-nums", quotaTextClassName(pct, warnPct))}
          data-testid="window-value"
        >
          {windowPctText(w) ?? amount ?? "—"}
        </span>
      </div>
      {pct !== undefined ? <QuotaBar pct={pct} warnPct={warnPct} label={name} size="sm" /> : null}
      {amount || reset ? (
        <p className="truncate text-xs tabular-nums text-muted-foreground">
          {[
            windowPctText(w) !== null ? amount : null,
            reset ? `${t("overview.windowReset")} ${reset}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
