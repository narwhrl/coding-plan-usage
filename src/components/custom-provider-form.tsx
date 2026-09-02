"use client";

import type React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Plug, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ProviderMonogram } from "@/components/provider-monogram";
import type { ProviderView, Window } from "@/lib/types";

type AuthType = "bearer" | "header";

/** 声明式自定义提供商表单 + 试采。 */
export function CustomProviderForm({ providers, onSaved }: { providers: ProviderView[]; onSaved: () => void }) {
  const t = useTranslations("settings.custom");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("credits");
  const [baseUrl, setBaseUrl] = useState("");
  const [path, setPath] = useState("/");
  const [authType, setAuthType] = useState<AuthType>("bearer");
  const [authHeader, setAuthHeader] = useState("X-API-Key");
  const [headers, setHeaders] = useState("");
  const [mappingTotal, setMappingTotal] = useState("");
  const [mappingUsed, setMappingUsed] = useState("");
  const [mappingRemaining, setMappingRemaining] = useState("");
  const [mappingResetAt, setMappingResetAt] = useState("");
  const [divisor, setDivisor] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testWindows, setTestWindows] = useState<Window[] | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildSpec = (): Record<string, unknown> => {
    let extraHeaders: Record<string, string> | undefined;
    if (headers.trim()) {
      try {
        extraHeaders = JSON.parse(headers) as Record<string, string>;
      } catch {
        throw new Error(t("headersInvalid"));
      }
    }
    const d = Number(divisor);
    return {
      baseUrl: baseUrl.trim(),
      method: "GET",
      path: path.trim() || "/",
      ...(extraHeaders ? { headers: extraHeaders } : {}),
      auth: authType === "bearer" ? { type: "bearer" } : { type: "header", header: authHeader.trim() },
      mapping: {
        ...(mappingTotal.trim() ? { total: mappingTotal.trim() } : {}),
        ...(mappingUsed.trim() ? { used: mappingUsed.trim() } : {}),
        ...(mappingRemaining.trim() ? { remaining: mappingRemaining.trim() } : {}),
        ...(mappingResetAt.trim() ? { resetAt: mappingResetAt.trim() } : {}),
      },
      ...(Number.isFinite(d) && d > 0 ? { divisor: d } : {}),
      unit: unit.trim() || "credits",
    };
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    setTestWindows(null);
    try {
      const response = await fetch("/api/providers/custom/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: buildSpec(), apiKey: apiKey.trim() }),
      });
      const data = (await response.json()) as { ok?: boolean; windows?: Window[]; error?: string };
      if (data.ok && data.windows) {
        setTestWindows(data.windows);
        setTestResult(t("testOk"));
      } else {
        setTestResult(`${t("testFail")}: ${data.error ?? "unknown"}`);
      }
    } catch (e) {
      setTestResult(`${t("testFail")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/providers/custom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), unit: unit.trim() || "credits", spec: buildSpec() }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setCreatedMessage(t("created"));
      setName("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeProvider = async (id: string) => {
    await fetch(`/api/providers/custom/${id}`, { method: "DELETE" });
    onSaved();
  };

  const customProviders = providers.filter((p) => p.kind === "custom");

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("create")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormSection title={t("sectionBasics")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="custom-name">{t("name")}</FieldLabel>
                <Input id="custom-name" value={name} onValueChange={setName} placeholder="My Provider" />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-unit">{t("unit")}</FieldLabel>
                <Input id="custom-unit" value={unit} onValueChange={setUnit} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sectionRequest")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="custom-baseurl">{t("baseUrl")}</FieldLabel>
                <Input
                  id="custom-baseurl"
                  value={baseUrl}
                  onValueChange={setBaseUrl}
                  placeholder="https://api.example.com"
                  data-testid="custom-baseurl"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-path">{t("path")}</FieldLabel>
                <Input
                  id="custom-path"
                  value={path}
                  onValueChange={setPath}
                  placeholder="/v1/quota"
                  data-testid="custom-path"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="custom-headers">{t("headers")}</FieldLabel>
              <Input
                id="custom-headers"
                value={headers}
                onValueChange={setHeaders}
                placeholder='{"X-Custom":"v"}'
                className="font-mono text-xs"
              />
            </Field>
          </FormSection>

          <FormSection title={t("sectionAuth")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="custom-authtype">{t("authType")}</FieldLabel>
                <Select
                  items={[
                    { label: t("authBearer"), value: "bearer" },
                    { label: t("authHeader"), value: "header" },
                  ]}
                  value={authType}
                  onValueChange={(value) => setAuthType((value as AuthType) ?? "bearer")}
                >
                  <SelectTrigger id="custom-authtype">
                    <SelectValue>{authType === "bearer" ? t("authBearer") : t("authHeader")}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="bearer">{t("authBearer")}</SelectItem>
                    <SelectItem value="header">{t("authHeader")}</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
              {authType === "header" ? (
                <Field>
                  <FieldLabel htmlFor="custom-authheader">{t("authHeaderName")}</FieldLabel>
                  <Input id="custom-authheader" value={authHeader} onValueChange={setAuthHeader} />
                </Field>
              ) : null}
            </div>
          </FormSection>

          <FormSection title={t("sectionMapping")} description={t("mappingHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="custom-total">{t("mappingTotal")}</FieldLabel>
                <Input
                  id="custom-total"
                  value={mappingTotal}
                  onValueChange={setMappingTotal}
                  placeholder="data.total"
                  className="font-mono text-xs"
                  data-testid="mapping-total"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-used">{t("mappingUsed")}</FieldLabel>
                <Input
                  id="custom-used"
                  value={mappingUsed}
                  onValueChange={setMappingUsed}
                  placeholder="data.used"
                  className="font-mono text-xs"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-remaining">{t("mappingRemaining")}</FieldLabel>
                <Input
                  id="custom-remaining"
                  value={mappingRemaining}
                  onValueChange={setMappingRemaining}
                  placeholder="data.remaining"
                  className="font-mono text-xs"
                  data-testid="mapping-remaining"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-resetat">{t("mappingResetAt")}</FieldLabel>
                <Input
                  id="custom-resetat"
                  value={mappingResetAt}
                  onValueChange={setMappingResetAt}
                  placeholder="data.resetAt"
                  className="font-mono text-xs"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="custom-divisor">{t("divisor")}</FieldLabel>
              <Input
                id="custom-divisor"
                inputMode="numeric"
                value={divisor}
                onValueChange={setDivisor}
                placeholder="1"
                className="sm:max-w-40"
              />
              <FieldDescription>{t("divisorHint")}</FieldDescription>
            </Field>
          </FormSection>

          <Separator />

          <Field>
            <FieldLabel htmlFor="custom-testkey">{t("testKey")}</FieldLabel>
            <Input
              id="custom-testkey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onValueChange={setApiKey}
              className="sm:max-w-xs"
              data-testid="custom-testkey"
            />
            <FieldDescription>{t("testKeyHint")}</FieldDescription>
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={test} loading={testing} disabled={!apiKey.trim()} data-testid="custom-test">
              {t("test")}
            </Button>
            <Button onClick={create} loading={busy} disabled={!name.trim()} data-testid="custom-create">
              {t("create")}
            </Button>
            {createdMessage ? (
              <span className="flex items-center gap-1.5 text-sm text-success-foreground">
                <Check className="size-4" aria-hidden="true" />
                {createdMessage}
              </span>
            ) : null}
            {error ? (
              <span className="flex items-center gap-1.5 text-sm text-destructive-foreground">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {error}
              </span>
            ) : null}
          </div>

          {testResult ? (
            <div className="space-y-2" data-testid="test-result">
              <p
                className={
                  testWindows
                    ? "flex items-center gap-1.5 text-sm text-success-foreground"
                    : "flex items-center gap-1.5 text-sm text-destructive-foreground"
                }
              >
                {testWindows ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-4" aria-hidden="true" />
                )}
                {testResult}
              </p>
              {testWindows ? (
                <div className="flex flex-wrap gap-1.5">
                  {testWindows.map((w, i) => (
                    <Badge key={i} variant="outline" className="gap-1 font-normal">
                      <span className="tabular-nums">{w.remainingPct?.toFixed(0) ?? "?"}%</span>
                      <span className="text-muted-foreground">
                        {w.remaining ?? "—"}/{w.total ?? "—"} {w.unit}
                      </span>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("list")}</CardTitle>
        </CardHeader>
        <CardContent>
          {customProviders.length === 0 ? (
            <Empty className="py-8 md:py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plug />
                </EmptyMedia>
                <EmptyTitle className="text-base">{t("empty")}</EmptyTitle>
                <EmptyDescription>{t("emptyHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {customProviders.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <ProviderMonogram name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{p.id}</p>
                  </div>
                  <Badge variant="outline">{p.unit}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => void removeProvider(p.id)}>
                    {t("delete")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** 表单分组：小标题 + 可选说明，把长表单切成可扫读的段。 */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
