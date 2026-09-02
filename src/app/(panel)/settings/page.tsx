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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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

        <TabsContent value="accounts" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <AccountAddForm providers={providers} onSaved={requestRefresh} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("accounts.list")}</CardTitle>
              <CardDescription>{t("accounts.listHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
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
                          className="truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {account.providerName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{account.label}</p>
                      </div>
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
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => void removeAccount(account.id)}
                                >
                                  {t("accounts.delete")}
                                </AlertDialogClose>
                              </AlertDialogFooter>
                            </AlertDialogPopup>
                          </AlertDialogViewport>
                        </AlertDialogPortal>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
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
  const tCommon = useTranslations("common");
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
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {settings === null ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="general-interval">{t("defaultInterval")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="general-interval"
                  inputMode="numeric"
                  value={interval}
                  onValueChange={setIntervalValue}
                  data-testid="general-interval"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{tCommon("minutes")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>{t("defaultIntervalHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="general-warn">{t("warnPct")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="general-warn"
                  inputMode="numeric"
                  value={warnPct}
                  onValueChange={setWarnPct}
                  data-testid="general-warn"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>{t("warnPctHint")}</FieldDescription>
            </Field>
          </>
        )}
        <Separator />
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy} disabled={!settings} data-testid="general-save">
            {t("save")}
          </Button>
          {saved ? (
            <span className="flex items-center gap-1.5 text-sm text-success-foreground">
              <Check className="size-4" aria-hidden="true" />
              {t("saved")}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
