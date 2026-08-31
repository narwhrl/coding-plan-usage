"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectButton,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AccountView, GeneralSettings, ProviderView } from "@/lib/types";
import { AccountAddForm } from "@/components/account-add-form";
import { CustomProviderForm } from "@/components/custom-provider-form";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);

  const load = useCallback(async () => {
    const [providersRes, accountsRes, settingsRes] = await Promise.all([
      fetch("/api/providers"),
      fetch("/api/accounts"),
      fetch("/api/settings"),
    ]);
    if (providersRes.ok) setProviders(((await providersRes.json()) as { providers: ProviderView[] }).providers);
    if (accountsRes.ok) setAccounts(((await accountsRes.json()) as { accounts: AccountView[] }).accounts);
    if (settingsRes.ok) setSettings(((await settingsRes.json()) as { settings: GeneralSettings }).settings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeAccount = async (id: string) => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    await load();
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTab value="accounts">{t("tabAccounts")}</TabsTab>
          <TabsTab value="custom">{t("tabCustom")}</TabsTab>
          <TabsTab value="general">{t("tabGeneral")}</TabsTab>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          <AccountAddForm providers={providers} onSaved={load} />
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
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{account.providerName}</p>
                      <p className="truncate text-xs text-muted-foreground">{account.label}</p>
                    </div>
                    {!account.enabled ? <Badge variant="secondary">disabled</Badge> : null}
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
          <CustomProviderForm providers={providers} onSaved={load} />
        </TabsContent>

        <TabsContent value="general">
          <GeneralSettingsForm settings={settings} onSaved={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettingsForm({ settings, onSaved }: { settings: GeneralSettings | null; onSaved: () => void }) {
  const t = useTranslations("settings.general");
  const [interval, setIntervalValue] = useState("");
  const [warnPct, setWarnPct] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setIntervalValue(String(settings.defaultIntervalMinutes));
      setWarnPct(String(settings.warnPct));
    }
  }, [settings]);

  const save = async () => {
    setBusy(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultIntervalMinutes: Number(interval) || undefined,
          warnPct: Number(warnPct) || undefined,
        }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="max-w-sm space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="general-interval">{t("defaultInterval")}</Label>
          <Input
            id="general-interval"
            inputMode="numeric"
            value={interval}
            onChange={(e) => setIntervalValue(e.target.value)}
            data-testid="general-interval"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="general-warn">{t("warnPct")}</Label>
          <Input
            id="general-warn"
            inputMode="numeric"
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
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
