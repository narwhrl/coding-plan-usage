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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AccountView, CredentialFieldView } from "@/lib/types";

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
  const tAccounts = useTranslations("settings.accounts");
  const tCommon = useTranslations("common");
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
              <div className="grid gap-2">
                <Label htmlFor="edit-label">{t("label")}</Label>
                <Input id="edit-label" value={label} onValueChange={setLabel} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-interval">{t("interval")}</Label>
                  <Input id="edit-interval" inputMode="numeric" value={interval} onValueChange={setIntervalValue} />
                  <p className="text-xs text-muted-foreground">
                    {tAccounts("overrideHint")} · {tCommon("minutes")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-warn">{t("warnPct")}</Label>
                  <Input id="edit-warn" inputMode="numeric" value={warnPct} onValueChange={setWarnPct} />
                  <p className="text-xs text-muted-foreground">
                    {tAccounts("overrideHint")} · {tCommon("percent")}
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-baseurl">{t("baseUrl")}</Label>
                <Input id="edit-baseurl" value={baseUrl} onValueChange={setBaseUrl} placeholder="https://" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="edit-enabled">{t("enabled")}</Label>
                <Switch id="edit-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
              {fields.map((field) => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={`edit-cred-${field.key}`}>{field.label}</Label>
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
                  <p className="text-xs text-muted-foreground">{t("credentials")}</p>
                </div>
              ))}
            </DialogPanel>
            <DialogFooter>
              <DialogClose>{t("cancel")}</DialogClose>
              <Button onClick={save} disabled={busy}>
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
