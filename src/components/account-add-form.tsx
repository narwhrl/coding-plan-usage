"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
        <CardTitle render={<h2 />} className="text-base">
          {t("add")}
        </CardTitle>
        <CardDescription>{t("addHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="add-provider">{t("provider")}</FieldLabel>
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
              <SelectValue placeholder={t("selectProvider")}>{provider?.name ?? null}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>

        {provider?.fields.map((field) => (
          <Field key={field.key}>
            <FieldLabel htmlFor={`add-cred-${field.key}`}>{field.label}</FieldLabel>
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
                onValueChange={(value) => setCredentialValues((prev) => ({ ...prev, [field.key]: value }))}
                placeholder={field.placeholder}
                data-testid={`cred-${field.key}`}
              />
            )}
          </Field>
        ))}

        <Field>
          <FieldLabel htmlFor="add-label">{t("label")}</FieldLabel>
          <Input id="add-label" value={label} onValueChange={setLabel} placeholder={provider?.name} />
          <FieldDescription>{t("labelHint")}</FieldDescription>
        </Field>

        {provider?.baseUrlOptions && provider.baseUrlOptions.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="add-baseurl">{t("baseUrl")}</FieldLabel>
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
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="add-interval">{t("interval")}</FieldLabel>
            <Input
              id="add-interval"
              inputMode="numeric"
              value={interval}
              onValueChange={setIntervalValue}
              placeholder="15"
            />
            <FieldDescription>{t("overrideHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="add-warn">{t("warnPct")}</FieldLabel>
            <Input
              id="add-warn"
              inputMode="numeric"
              value={warnPct}
              onValueChange={setWarnPct}
              placeholder="20"
            />
            <FieldDescription>{t("overrideHint")}</FieldDescription>
          </Field>
        </div>

        {error ? <p className="text-sm text-destructive-foreground">{error}</p> : null}
        {savedMessage ? (
          <p className="text-sm text-muted-foreground" data-testid="account-saved">
            {savedMessage}
          </p>
        ) : null}

        <Button onClick={save} disabled={busy || !provider} data-testid="account-save">
          {busy ? t("saving") : t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
