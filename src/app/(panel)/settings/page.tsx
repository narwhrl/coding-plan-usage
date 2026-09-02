"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AccountAddForm } from "@/components/account-add-form";
import { AccountStatusBadges } from "@/components/account-status";
import { CustomProviderForm } from "@/components/custom-provider-form";
import { PageHeader } from "@/components/page-header";
import { ProviderMonogram } from "@/components/provider-monogram";
import { SettingsNav, type SettingsTab } from "@/components/settings-nav";
import type { AccountView, GeneralSettings, ProviderView } from "@/lib/types";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>("accounts");
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <SettingsNav
          value={tab}
          onValueChange={setTab}
          label={t("title")}
          items={[
            { value: "accounts", label: t("tabAccounts") },
            { value: "custom", label: t("tabCustom") },
            { value: "general", label: t("tabGeneral") },
          ]}
        />
        <div className="min-w-0 flex-1">
          {tab === "accounts" ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <AccountAddForm providers={providers} onSaved={requestRefresh} />
              <Card>
                <CardHeader>
                  <CardTitle render={<h2 />} className="text-base">
                    {t("accounts.list")}
                  </CardTitle>
                  <CardDescription>{t("accounts.listHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {accounts.length === 0 ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t("accounts.empty")}</p>
                      <p className="text-xs text-muted-foreground">{t("accounts.emptyHint")}</p>
                    </div>
                  ) : (
                    accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                      >
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
                        <AccountStatusBadges account={account} />
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                            {t("accounts.delete")}
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
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "custom" ? <CustomProviderForm providers={providers} onSaved={requestRefresh} /> : null}

          {tab === "general" ? (
            <GeneralSettingsForm
              key={settings ? `${settings.defaultIntervalMinutes}:${settings.warnPct}` : "loading"}
              settings={settings}
              onSaved={requestRefresh}
              saved={generalSaved}
              onSavedChange={setGeneralSaved}
            />
          ) : null}
        </div>
      </div>
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="general-interval">{t("defaultInterval")}</FieldLabel>
          <Input
            id="general-interval"
            inputMode="numeric"
            value={interval}
            onValueChange={setIntervalValue}
            data-testid="general-interval"
          />
          <FieldDescription>
            {t("defaultIntervalHint")} · {tCommon("minutes")}
          </FieldDescription>
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
          <FieldDescription>
            {t("warnPctHint")} · {tCommon("percent")}
          </FieldDescription>
        </Field>
        <Separator />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !settings} data-testid="general-save">
            {t("save")}
          </Button>
          {saved ? <span className="text-sm text-muted-foreground">{t("saved")}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
