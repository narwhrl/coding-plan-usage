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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AccountView, CredentialFieldView } from "@/lib/types";

/** 账户编辑弹窗：标签/采集间隔/预警阈值/API 地址/启停 + 凭证（留空保持不变）。 */
export function EditAccountDialog({
  account,
  fields,
  open,
  onOpenChange,
  onSaved,
}: {
  account: AccountView;
  fields: CredentialFieldView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("detail");
  const [label, setLabel] = useState(account.label);
  const [interval, setIntervalValue] = useState(account.config.intervalMinutes?.toString() ?? "");
  const [warnPct, setWarnPct] = useState(account.config.warnPct?.toString() ?? "");
  const [baseUrl, setBaseUrl] = useState(account.config.baseUrl ?? "");
  const [enabled, setEnabled] = useState(account.enabled);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        label,
        enabled,
        config: {
          ...(interval.trim() ? { intervalMinutes: Number(interval) } : {}),
          ...(warnPct.trim() ? { warnPct: Number(warnPct) } : {}),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        },
      };
      const filled = Object.fromEntries(
        Object.entries(credentialValues).filter(([, value]) => value.trim().length > 0),
      );
      if (Object.keys(filled).length > 0) {
        body.credentials = filled;
      }
      await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      onSaved();
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
              <DialogDescription>{account.providerName}</DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="edit-label">{t("label")}</FieldLabel>
                <Input id="edit-label" value={label} onValueChange={setLabel} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="edit-interval">{t("interval")}</FieldLabel>
                  <Input id="edit-interval" inputMode="numeric" value={interval} onValueChange={setIntervalValue} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-warn">{t("warnPct")}</FieldLabel>
                  <Input id="edit-warn" inputMode="numeric" value={warnPct} onValueChange={setWarnPct} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="edit-baseurl">{t("baseUrl")}</FieldLabel>
                <Input id="edit-baseurl" value={baseUrl} onValueChange={setBaseUrl} placeholder="https://" />
              </Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="edit-enabled">{t("enabled")}</FieldLabel>
                <Switch id="edit-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              {fields.length > 0 ? (
                <p className="text-xs text-muted-foreground">{t("credentials")}</p>
              ) : null}
              {fields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`edit-cred-${field.key}`}>{field.label}</FieldLabel>
                  {field.kind === "json" ? (
                    <Textarea
                      id={`edit-cred-${field.key}`}
                      value={credentialValues[field.key] ?? ""}
                      onChange={(e) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      rows={3}
                      placeholder={field.placeholder ?? "JSON"}
                    />
                  ) : (
                    <Input
                      id={`edit-cred-${field.key}`}
                      type="password"
                      value={credentialValues[field.key] ?? ""}
                      onValueChange={(value) =>
                        setCredentialValues((prev) => ({ ...prev, [field.key]: value }))
                      }
                      placeholder="—"
                    />
                  )}
                </Field>
              ))}
            </DialogPanel>
            <DialogFooter>
              <DialogClose>{t("cancel")}</DialogClose>
              <Button onClick={save} disabled={busy}>
                {busy ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
