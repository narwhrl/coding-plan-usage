"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DisplayCurrencyField } from "@/components/display-currency-field";
import { isProxyUrlInputValid, ProxyUrlField } from "@/components/proxy-url-field";
import type { AccountView, CredentialFieldView, DisplayCurrency } from "@/lib/types";
import { parseDisplayCurrency } from "@/lib/display-currency";
import { fieldLabel, fieldPlaceholder } from "@/lib/format";

/** 账户编辑弹窗：凭证留空即保持原值（后端不回传明文）。 */
export function EditAccountDialog({
  account,
  fields,
  displayCurrencies,
  open,
  onOpenChange,
  onSaved,
}: {
  account: AccountView;
  fields: CredentialFieldView[];
  displayCurrencies?: DisplayCurrency[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("detail");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();
  const [label, setLabel] = useState(account.label);
  const [interval, setIntervalValue] = useState(account.config.intervalMinutes?.toString() ?? "");
  const [warnPct, setWarnPct] = useState(account.config.warnPct?.toString() ?? "");
  const [baseUrl, setBaseUrl] = useState(account.config.baseUrl ?? "");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(
    parseDisplayCurrency(account.config.displayCurrency) ?? "CNY",
  );
  const [enabled, setEnabled] = useState(account.enabled);
  const [proxyUrl, setProxyUrl] = useState(account.config.proxyUrl ?? "");
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        label,
        enabled,
        config: {
          ...(interval.trim() ? { intervalMinutes: Number(interval) } : {}),
          ...(warnPct.trim() ? { warnPct: Number(warnPct) } : {}),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          ...(displayCurrencies && displayCurrencies.length > 0 ? { displayCurrency } : {}),
          proxyUrl: proxyUrl.trim(),
        },
      };
      const filled = Object.fromEntries(
        Object.entries(credentialValues).filter(([, value]) => value.trim().length > 0),
      );
      if (Object.keys(filled).length > 0) {
        body.credentials = filled;
      }
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{t("edit")}</DialogTitle>
              <DialogDescription>
                {account.providerName} · {account.label}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="edit-label">{t("label")}</FieldLabel>
                <Input id="edit-label" value={label} onValueChange={setLabel} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="edit-interval">{t("interval")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="edit-interval"
                      inputMode="numeric"
                      value={interval}
                      onValueChange={setIntervalValue}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{tCommon("minutes")}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-warn">{t("warnPct")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="edit-warn"
                      inputMode="numeric"
                      value={warnPct}
                      onValueChange={setWarnPct}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>%</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="edit-baseurl">{t("baseUrl")}</FieldLabel>
                <Input id="edit-baseurl" value={baseUrl} onValueChange={setBaseUrl} placeholder="https://" />
              </Field>
              <ProxyUrlField id="edit-proxy" value={proxyUrl} onValueChange={setProxyUrl} variant="edit" />
              {displayCurrencies && displayCurrencies.length > 0 ? (
                <DisplayCurrencyField
                  id="edit-currency"
                  value={displayCurrency}
                  currencies={displayCurrencies}
                  onValueChange={setDisplayCurrency}
                />
              ) : null}
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <Label htmlFor="edit-enabled">{t("enabled")}</Label>
                <Switch id="edit-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              {fields.length > 0 ? (
                <p className="text-xs text-muted-foreground">{t("credentials")}</p>
              ) : null}
              {fields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`edit-cred-${field.key}`}>
                    {fieldLabel(account.providerId, field, tRoot)}
                  </FieldLabel>
                  {field.kind === "json" ? (
                    <Textarea
                      id={`edit-cred-${field.key}`}
                      value={credentialValues[field.key] ?? ""}
                      onChange={(e) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      rows={3}
                      placeholder={fieldPlaceholder(account.providerId, field, tRoot) ?? tRoot("fields.json")}
                    />
                  ) : (
                    <Input
                      id={`edit-cred-${field.key}`}
                      type="password"
                      autoComplete="off"
                      value={credentialValues[field.key] ?? ""}
                      onValueChange={(value) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: value }))
                      }
                      placeholder={fieldPlaceholder(account.providerId, field, tRoot)}
                    />
                  )}
                </Field>
              ))}
              {error ? <p className="text-sm text-destructive-foreground">{error}</p> : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose>{t("cancel")}</DialogClose>
              <Button onClick={save} loading={busy} disabled={!isProxyUrlInputValid(proxyUrl)}>
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
