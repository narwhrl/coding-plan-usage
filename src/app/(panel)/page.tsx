"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/account-card";
import type { AccountView } from "@/lib/types";

export default function OverviewPage() {
  const t = useTranslations("overview");
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { accounts: AccountView[] };
      setAccounts(data.accounts);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (accounts === null) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">load failed</CardContent>
        </Card>
      ) : null}
      {accounts.length === 0 && !error ? (
        <Empty className="rounded-xl border border-border">
          <EmptyHeader>
            <EmptyTitle>{t("empty")}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            <Button render={<Link href="/settings" />}>{t("goSettings")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onRefreshed={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
