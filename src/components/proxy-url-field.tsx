"use client";

import { useTranslations } from "next-intl";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseProxyUrl } from "@/lib/proxy";

export function ProxyUrlField({
  id,
  value,
  onValueChange,
  variant = "add",
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  variant?: "add" | "edit";
}) {
  const t = useTranslations("settings.accounts");
  const parsed = value.trim() ? parseProxyUrl(value) : null;
  const invalid = parsed !== null && !parsed.ok;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("proxy")}</FieldLabel>
      <Input
        id={id}
        value={value}
        onValueChange={onValueChange}
        placeholder={t("proxyPlaceholder")}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        data-testid="account-proxy"
      />
      {invalid && parsed && !parsed.ok ? (
        <p className="text-xs text-destructive-foreground">{t(`proxyError.${parsed.error}`)}</p>
      ) : (
        <FieldDescription>{variant === "edit" ? t("proxyEditHint") : t("proxyHint")}</FieldDescription>
      )}
    </Field>
  );
}

export function isProxyUrlInputValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || parseProxyUrl(trimmed).ok;
}
