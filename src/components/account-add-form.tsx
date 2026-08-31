"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderView } from "@/lib/types";

export function AccountAddForm({ providers, onSaved }: { providers: ProviderView[]; onSaved: () => void }) {
  const t = useTranslations("settings.accounts");
  const [providerId, setProviderId] = useState("");
  const [label, setLabel] = useState("");
  const [interval, setIntervalValue] = useState("");
  const [warnPct, setWarnPct] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);

  const save = async () => {
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          label: label.trim() || provider.name,
          credentials: credentialValues,
          config: {
            ...(interval.trim() ? { intervalMinutes: Number(interval) } : {}),
            ...(warnPct.trim() ? { warnPct: Number(warnPct) } : {}),
            ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          },
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setSavedMessage(t("saved"));
      setLabel("");
      setIntervalValue("");
      setWarnPct("");
      setBaseUrl("");
      setCredentialValues({});
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("add")}</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-xl gap-4">
        <div className="grid gap-2">
          <Label htmlFor="add-provider">{t("provider")}</Label>
          <Select
            items={providers.map((p) => ({ label: p.name, value: p.id }))}
            value={providerId || null}
            onValueChange={(value) => {
              setProviderId(value ?? "");
              setCredentialValues({});
              setBaseUrl("");
            }}
          >
            <SelectTrigger id="add-provider" data-testid="provider-select">
              <SelectValue placeholder="—">
                {provider?.name ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>

        {provider?.fields.map((field) => (
          <div key={field.key} className="grid gap-2">
            <Label htmlFor={`add-cred-${field.key}`}>{field.label}</Label>
            {field.kind === "json" ? (
              <Textarea
                id={`add-cred-${field.key}`}
                value={credentialValues[field.key] ?? ""}
                onChange={(e) => setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={4}
                placeholder={field.placeholder ?? "JSON"}
                data-testid={`cred-${field.key}`}
              />
            ) : (
              <Input
                id={`add-cred-${field.key}`}
                type="password"
                autoComplete="off"
                value={credentialValues[field.key] ?? ""}
                onChange={(e) => setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                data-testid={`cred-${field.key}`}
              />
            )}
          </div>
        ))}

        <div className="grid gap-2">
          <Label htmlFor="add-label">{t("label")}</Label>
          <Input id="add-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={provider?.name} />
        </div>

        {provider?.baseUrlOptions && provider.baseUrlOptions.length > 0 ? (
          <div className="grid gap-2">
            <Label htmlFor="add-baseurl">{t("baseUrl")}</Label>
            <Select
              items={provider.baseUrlOptions.map((o) => ({ label: o.label, value: o.value }))}
              value={baseUrl || provider.baseUrlOptions[0].value}
              onValueChange={(value) => setBaseUrl(value ?? "")}
            >
              <SelectTrigger id="add-baseurl">
                <SelectValue>
                  {provider.baseUrlOptions.find((o) => o.value === baseUrl)?.label ?? provider.baseUrlOptions[0].label}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {provider.baseUrlOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="add-interval">{t("interval")}</Label>
            <Input
              id="add-interval"
              inputMode="numeric"
              value={interval}
              onChange={(e) => setIntervalValue(e.target.value)}
              placeholder="15"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-warn">{t("warnPct")}</Label>
            <Input
              id="add-warn"
              inputMode="numeric"
              value={warnPct}
              onChange={(e) => setWarnPct(e.target.value)}
              placeholder="20"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {savedMessage ? <p className="text-sm text-muted-foreground" data-testid="account-saved">{savedMessage}</p> : null}

        <Button onClick={save} disabled={busy || !provider} data-testid="account-save">
          {busy ? t("saving") : t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
