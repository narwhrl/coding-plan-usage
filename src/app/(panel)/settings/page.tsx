"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Trash2, Users } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTab } from "@/components/ui/tabs";
import type { AccountView, GeneralSettings, ProviderView } from "@/lib/types";
import { AccountAddForm } from "@/components/account-add-form";
import { AccountStatusBadges } from "@/components/account-status";
import { CustomProviderForm } from "@/components/custom-provider-form";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [refreshVersion, requestRefresh] = useReducer((version: number) => version + 1, 0);
  const [generalSaved, setGeneralSaved] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const [providersRes, accountsRes, settingsRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/accounts"),
        fetch("/api/settings"),
      ]);
      if (providersRes.ok) {
        const data = (await providersRes.json()) as { providers: ProviderView[] };
        if (!ignore) setProviders(data.providers);
      }
      if (accountsRes.ok) {
        const data = (await accountsRes.json()) as { accounts: AccountView[] };
        if (!ignore) setAccounts(data.accounts);
      }
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { settings: GeneralSettings };
        if (!ignore) setSettings(data.settings);
      }
      if (!ignore) setAccountsLoaded(true);
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [refreshVersion]);

  const removeAccount = async (id: string) => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    requestRefresh();
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Tabs defaultValue="accounts" className="gap-6">
        <TabsList>
          <TabsTab value="accounts">{t("tabAccounts")}</TabsTab>
          <TabsTab value="custom">{t("tabCustom")}</TabsTab>
          <TabsTab value="general">{t("tabGeneral")}</TabsTab>
        </TabsList>

        {/* 已有账户排在前面：窄屏下先看到自己的账户，而不是先滚过整张添加表单。 */}
        <TabsContent value="accounts" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle render={<h2 />} className="text-base">
                {t("accounts.list")}
              </CardTitle>
              <CardDescription>{t("accounts.listHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!accountsLoaded ? (
                <ul className="divide-y divide-border" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : accounts.length === 0 ? (
                <Empty className="py-8 md:py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Users />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">{t("accounts.empty")}</EmptyTitle>
                    <EmptyDescription>{t("accounts.emptyHint")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-y divide-border">
                  {accounts.map((account) => (
                    <li key={account.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <ProviderMonogram name={account.providerName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/accounts/${account.id}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {account.providerName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{account.label}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <AccountStatusBadges account={account} />
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("accounts.delete")}
                                className="text-muted-foreground hover:text-destructive-foreground"
                              />
                            }
                          >
                            <Trash2 />
                          </AlertDialogTrigger>
                          <AlertDialogPortal>
                            <AlertDialogBackdrop />
                            <AlertDialogViewport>
                              <AlertDialogPopup>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("accounts.deleteConfirmTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("accounts.deleteConfirmBody")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogClose>{t("accounts.cancel")}</AlertDialogClose>
                                  <AlertDialogClose
                                    render={<Button variant="destructive" />}
                                    onClick={() => void removeAccount(account.id)}
                                  >
                                    {t("accounts.delete")}
                                  </AlertDialogClose>
                                </AlertDialogFooter>
                              </AlertDialogPopup>
                            </AlertDialogViewport>
                          </AlertDialogPortal>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <AccountAddForm providers={providers} onSaved={requestRefresh} />
        </TabsContent>

        <TabsContent value="custom">
          <CustomProviderForm providers={providers} onSaved={requestRefresh} />
        </TabsContent>

        <TabsContent value="general">
          <GeneralSettingsForm
            key={settings ? `${settings.defaultIntervalMinutes}:${settings.warnPct}` : "loading"}
            settings={settings}
            onSaved={requestRefresh}
            saved={generalSaved}
            onSavedChange={setGeneralSaved}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettingsForm({
  settings,
  onSaved,
  saved,
  onSavedChange,
}: {
  settings: GeneralSettings | null;
  onSaved: () => void;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  const t = useTranslations("settings.general");
  const [interval, setIntervalValue] = useState(() => String(settings?.defaultIntervalMinutes ?? ""));
  const [warnPct, setWarnPct] = useState(() => String(settings?.warnPct ?? ""));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    onSavedChange(false);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultIntervalMinutes: Number(interval) || undefined,
          warnPct: Number(warnPct) || undefined,
        }),
      });
      if (!response.ok) {
        setIntervalValue(String(settings.defaultIntervalMinutes));
        setWarnPct(String(settings.warnPct));
        return;
      }
      const data = (await response.json()) as { settings: GeneralSettings };
      setIntervalValue(String(data.settings.defaultIntervalMinutes));
      setWarnPct(String(data.settings.warnPct));
      onSavedChange(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="general-interval">{t("defaultInterval")}</FieldLabel>
            <Input
              id="general-interval"
              inputMode="numeric"
              value={interval}
              onValueChange={setIntervalValue}
              data-testid="general-interval"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="general-warn">{t("warnPct")}</FieldLabel>
            <Input
              id="general-warn"
              inputMode="numeric"
              value={warnPct}
              onValueChange={setWarnPct}
              data-testid="general-warn"
            />
          </Field>
        </div>
        <Separator />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !settings} data-testid="general-save">
            {busy ? t("saving") : t("save")}
          </Button>
          {saved ? (
            <Badge variant="success" data-testid="general-saved">
              <Check />
              {t("saved")}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
