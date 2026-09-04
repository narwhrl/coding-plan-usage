"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { NotifySettingsView } from "@/lib/types";

type TestState = { ok: boolean; message: string } | null;

/**
 * 出站 Webhook 告警设置。地址与密钥后端只回 host / hasSecret，
 * 因此两个输入框留空即表示保持原值（同「编辑账户」里凭证的约定）。
 */
export function NotifySettingsForm({
  notify,
  onSaved,
}: {
  notify: NotifySettingsView | null;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.notify");
  const tCommon = useTranslations("common");
  const [enabled, setEnabled] = useState(() => notify?.enabled ?? false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [low, setLow] = useState(() => notify?.events.low ?? true);
  const [recovered, setRecovered] = useState(() => notify?.events.recovered ?? true);
  const [error, setError] = useState(() => notify?.events.error ?? true);
  const [minInterval, setMinInterval] = useState(() => String(notify?.minIntervalMinutes ?? 360));
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>(null);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setTest(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notify: {
            enabled,
            url: url.trim(),
            secret,
            events: { low, recovered, error },
            minIntervalMinutes: Number(minInterval) || undefined,
          },
        }),
      });
      if (!response.ok) {
        setTest({ ok: false, message: t("saveFailed") });
        return;
      }
      // 保存成功后清空两个敏感输入：屏幕上不留明文，回显交给下面的 host 提示。
      setUrl("");
      setSecret("");
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setSaved(false);
    setTest(null);
    try {
      const response = await fetch("/api/settings/notify/test", { method: "POST" });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: number; error?: string }
        | null;
      if (response.ok && data?.ok) setTest({ ok: true, message: t("testOk") });
      else setTest({ ok: false, message: t("testFailed", { error: data?.error ?? String(response.status) }) });
    } catch (cause) {
      setTest({ ok: false, message: t("testFailed", { error: String(cause) }) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle render={<h2 />} className="text-base">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {notify === null ? (
          <>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="notify-enabled">{t("enable")}</Label>
              <Switch
                id="notify-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                data-testid="notify-enabled"
              />
            </div>

            <Field>
              <FieldLabel htmlFor="notify-url">{t("url")}</FieldLabel>
              <Input
                id="notify-url"
                type="url"
                inputMode="url"
                placeholder={notify.urlHost ? t("urlKeep") : "https://…"}
                value={url}
                onValueChange={setUrl}
                data-testid="notify-url"
              />
              <FieldDescription>
                {notify.urlHost ? `${t("urlConfigured", { host: notify.urlHost })} · ` : null}
                {t("urlHint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="notify-secret">{t("secret")}</FieldLabel>
              <Input
                id="notify-secret"
                type="password"
                autoComplete="new-password"
                placeholder={notify.hasSecret ? t("urlKeep") : tCommon("optional")}
                value={secret}
                onValueChange={setSecret}
                data-testid="notify-secret"
              />
              <FieldDescription>{t("secretHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("events")}</FieldLabel>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <EventToggle id="notify-event-low" label={t("eventLow")} checked={low} onChange={setLow} />
                <EventToggle
                  id="notify-event-recovered"
                  label={t("eventRecovered")}
                  checked={recovered}
                  onChange={setRecovered}
                />
                <EventToggle
                  id="notify-event-error"
                  label={t("eventError")}
                  checked={error}
                  onChange={setError}
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="notify-interval">{t("minInterval")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="notify-interval"
                  inputMode="numeric"
                  value={minInterval}
                  onValueChange={setMinInterval}
                  data-testid="notify-interval"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{tCommon("minutes")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>{t("minIntervalHint")}</FieldDescription>
            </Field>

            <Separator />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} loading={busy} data-testid="notify-save">
                {t("save")}
              </Button>
              <Button
                variant="outline"
                onClick={sendTest}
                loading={testing}
                disabled={!notify.urlHost && url.trim() === ""}
                data-testid="notify-test"
              >
                {t("test")}
              </Button>
              {saved ? (
                <span className="flex items-center gap-1.5 text-sm text-success-foreground">
                  <Check className="size-4" aria-hidden="true" />
                  {t("saved")}
                </span>
              ) : null}
              {test ? (
                <span
                  className={
                    test.ok
                      ? "flex items-center gap-1.5 text-sm text-success-foreground"
                      : "flex items-center gap-1.5 text-sm break-all text-destructive-foreground"
                  }
                  data-testid="notify-test-result"
                >
                  {test.ok ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  {test.message}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EventToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
