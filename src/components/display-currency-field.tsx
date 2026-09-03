"use client";

import { useTranslations } from "next-intl";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DisplayCurrency } from "@/lib/types";

export function DisplayCurrencyField({
  id,
  value,
  currencies,
  onValueChange,
}: {
  id: string;
  value: DisplayCurrency;
  currencies: readonly DisplayCurrency[];
  onValueChange: (value: DisplayCurrency) => void;
}) {
  const t = useTranslations("settings.accounts");
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("displayCurrency")}</FieldLabel>
      <Select
        items={currencies.map((code) => ({ label: code, value: code }))}
        value={value}
        onValueChange={(next) => {
          if (next === "CNY" || next === "USD") onValueChange(next);
        }}
      >
        <SelectTrigger id={id} data-testid="display-currency">
          <SelectValue>{value}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {currencies.map((code) => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <FieldDescription>{t("displayCurrencyHint")}</FieldDescription>
    </Field>
  );
}
