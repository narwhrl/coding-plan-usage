"use client";

import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gauge, TriangleAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/account-card";
import { PageHeader } from "@/components/page-header";
import { StatStrip, StatStripItem } from "@/components/stat-strip";
import type { AccountView, ProviderLane } from "@/lib/types";
import { overviewKpis, sortAccountsByUrgency } from "@/lib/overview";
import { accountForDisplay } from "@/lib/display-currency";
import { countdownText, windowName } from "@/lib/format";
import { SegmentedToggle } from "@/components/segmented-toggle";

const LANE_KEY = "cpu_overview_lane";
const LANE_EVENT = "cpu-overview-lane";

function readStoredLane(): ProviderLane {
  try {
    const stored = window.localStorage.getItem(LANE_KEY);
    if (stored === "api" || stored === "plan") return stored;
  } catch {
    /* ignore */
  }
  return "plan";
}

function subscribeOverviewLane(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LANE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LANE_EVENT, onChange);
  };
}

export default function OverviewPage() {
  const t = useTranslations("overview");
  const tRoot = useTranslations();
  const tTime = useTranslations("time");
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState(false);
  const lane = useSyncExternalStore(subscribeOverviewLane, readStoredLane, () => "plan");
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);

  const changeLane = (next: ProviderLane) => {
    try {
      window.localStorage.setItem(LANE_KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(LANE_EVENT));
  };

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

  if (accounts === null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={t("title")} />
        <Skeleton className="h-20 rounded-2xl" />
        {/* 列数与骨架数跟着真实网格走，数据到位时不会重排。 */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const visible = accounts.filter((account) => (account.lane ?? "plan") === lane);
  const kpis = overviewKpis(visible);
  const sorted = sortAccountsByUrgency(visible);
  const needsAttention = (a: AccountView) =>
    a.enabled && (a.latestSnapshot?.status === "error" || a.warn);
  const urgent = sorted.filter(needsAttention);
  const rest = sorted.filter((a) => !needsAttention(a));
  // 只有同时存在两组时才分节，否则一个标题下挂全部账户反而更啰嗦。
  const grouped = urgent.length > 0 && rest.length > 0;

  const planCount = accounts.filter((a) => (a.lane ?? "plan") === "plan").length;
  const apiCount = accounts.filter((a) => a.lane === "api").length;
  const laneToggle =
    accounts.length > 0 ? (
      <SegmentedToggle
        label={t("laneLabel")}
        value={lane}
        options={[
          { value: "plan", label: `${t("lanePlan")} ${planCount}` },
          { value: "api", label: `${t("laneApi")} ${apiCount}` },
        ]}
        onValueChange={changeLane}
      />
    ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} actions={laneToggle} />

      {error ? (
        <Alert variant="error">
          <TriangleAlert />
          <AlertTitle>{t("loadFailed")}</AlertTitle>
        </Alert>
      ) : null}

      {accounts.length === 0 && !error ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gauge />
              </EmptyMedia>
              <EmptyTitle>{t("empty")}</EmptyTitle>
              <EmptyDescription>{t("emptyHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link href="/settings" />}>{t("goSettings")}</Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gauge />
              </EmptyMedia>
              <EmptyTitle>{lane === "api" ? t("emptyApi") : t("emptyPlan")}</EmptyTitle>
              <EmptyDescription>{lane === "api" ? t("emptyApiHint") : t("emptyPlanHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link href="/settings" />}>{t("goSettings")}</Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <>
          <StatStrip data-testid="kpi-band">
            <StatStripItem
              data-testid="kpi-card"
              label={t("kpiAccounts")}
              // 数字对齐网格里的卡片数，异常/停用退到副行，否则「账户 3」旁边摆 4 张卡。
              value={String(kpis.total)}
              hint={[
                kpis.errorCount > 0 ? t("kpiErrors", { count: kpis.errorCount }) : null,
                kpis.disabledCount > 0 ? t("kpiDisabled", { count: kpis.disabledCount }) : null,
              ]
                .filter(Boolean)
                .join(" · ")
                .trim() || t("kpiAllOk")}
            />
            <StatStripItem
              data-testid="kpi-card"
              label={t("kpiTightest")}
              value={kpis.tightest ? `${kpis.tightest.window.remainingPct!.toFixed(0)}%` : "—"}
              tone={
                kpis.tightest && kpis.tightest.window.remainingPct! < kpis.tightest.account.warnThreshold
                  ? "critical"
                  : "default"
              }
              hint={
                kpis.tightest
                  ? `${kpis.tightest.account.providerName} · ${kpis.tightest.account.label} · ${windowName(kpis.tightest.window, tRoot)}`
                  : undefined
              }
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

          {grouped ? (
            <>
              <AccountSection
                title={t("attention")}
                count={urgent.length}
                accounts={urgent}
                onRefreshed={requestRefresh}
              />
              <AccountSection
                title={t("healthy")}
                count={rest.length}
                accounts={rest}
                onRefreshed={requestRefresh}
              />
            </>
          ) : (
            <AccountSection
              title={t("allAccounts")}
              accounts={sorted}
              onRefreshed={requestRefresh}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * 一组账户卡。count 省略时标题只留给读屏（未分节时不需要可见的分组标签），
 * 但标题始终存在，卡内的账户名才能安全地当 h3 用。
 */
function AccountSection({
  title,
  count,
  accounts,
  onRefreshed,
}: {
  title: string;
  count?: number;
  accounts: AccountView[];
  onRefreshed: () => void;
}) {
  return (
    <section className="space-y-3">
      {count === undefined ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
          <Badge variant="outline" size="sm">
            {count}
          </Badge>
        </div>
      )}
      {/*
        最多两列。分组之后每节的卡片数是 1~4 张，三列网格下 2 张卡会空出右边整整一格、
        4 张卡会在第二行空出两格；两列在这些数量上更常填满，落空时也只差半行。
        卡片因此宽到 ~540px，额度条和 7 日柱条正好铺满一行。
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={accountForDisplay(account)} onRefreshed={onRefreshed} />
        ))}
      </div>
    </section>
  );
}
