"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { monogram } from "@/lib/format";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTab } from "@/components/ui/tabs";
import type { AccountView, GeneralSettings, ProviderView } from "@/lib/types";
import { AccountAddForm } from "@/components/account-add-form";
import { CustomProviderForm } from "@/components/custom-provider-form";

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
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Tabs defaultValue="accounts">
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
            </CardHeader>
            <CardContent className="space-y-2">
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accounts.empty")}</p>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 font-heading text-xs font-semibold text-muted-foreground"
                      aria-hidden
                    >
                      {monogram(account.providerName)}
                    </span>
                    <Link href={`/accounts/${account.id}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-medium">{account.providerName}</p>
                      <p className="truncate text-xs text-muted-foreground">{account.label}</p>
                    </Link>
                    {!account.enabled ? <Badge variant="secondary">{t("accounts.disabled")}</Badge> : null}
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />
                        }
                      >
                        {t("accounts.delete")}
                      </AlertDialogTrigger>
                      <AlertDialogPortal>
                        <AlertDialogBackdrop />
                        <AlertDialogViewport>
                          <AlertDialogPopup>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("accounts.deleteConfirmTitle")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("accounts.deleteConfirmBody")}</AlertDialogDescription>
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
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="general-interval">{t("defaultInterval")}</Label>
          <Input
            id="general-interval"
            inputMode="numeric"
            value={interval}
            onValueChange={setIntervalValue}
            data-testid="general-interval"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="general-warn">{t("warnPct")}</Label>
          <Input
            id="general-warn"
            inputMode="numeric"
            value={warnPct}
            onValueChange={setWarnPct}
            data-testid="general-warn"
          />
        </div>
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
