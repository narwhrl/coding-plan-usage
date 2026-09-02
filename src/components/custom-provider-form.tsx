"use client";

import { useState } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderMonogram } from "@/components/provider-monogram";
import type { ProviderView, Window } from "@/lib/types";
import { cn } from "@/lib/utils";

type AuthType = "bearer" | "header";

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle render={<h2 />} className="text-base">
            {t("create")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormSection title={t("sectionBasics")}>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="custom-name">{t("name")}</FieldLabel>
                <Input id="custom-name" value={name} onValueChange={setName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-unit">{t("unit")}</FieldLabel>
                <Input id="custom-unit" value={unit} onValueChange={setUnit} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sectionRequest")}>
            <div className="grid grid-cols-2 gap-4">
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
              <Input id="custom-headers" value={headers} onValueChange={setHeaders} placeholder='{"X-Custom":"v"}' />
            </Field>
          </FormSection>

          <FormSection title={t("sectionAuth")}>
            <div className="grid grid-cols-2 gap-4">
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

          <FormSection title={t("sectionMapping")}>
            <p className="text-xs text-muted-foreground">{t("mappingHint")}</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="custom-total">{t("mappingTotal")}</FieldLabel>
                <Input
                  id="custom-total"
                  value={mappingTotal}
                  onValueChange={setMappingTotal}
                  placeholder="data.total"
                  data-testid="mapping-total"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-used">{t("mappingUsed")}</FieldLabel>
                <Input id="custom-used" value={mappingUsed} onValueChange={setMappingUsed} placeholder="data.used" />
              </Field>
              <Field>
                <FieldLabel htmlFor="custom-remaining">{t("mappingRemaining")}</FieldLabel>
                <Input
                  id="custom-remaining"
                  value={mappingRemaining}
                  onValueChange={setMappingRemaining}
                  placeholder="data.remaining"
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
              />
              <FieldDescription>{t("divisorHint")}</FieldDescription>
            </Field>
          </FormSection>

          <FormSection title={t("sectionTest")}>
            <Field>
              <FieldLabel htmlFor="custom-testkey">{t("testKey")}</FieldLabel>
              <Input
                id="custom-testkey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onValueChange={setApiKey}
                data-testid="custom-testkey"
              />
              <FieldDescription>{t("testKeyHint")}</FieldDescription>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={test} disabled={testing || !apiKey.trim()} data-testid="custom-test">
                {testing ? t("testing") : t("test")}
              </Button>
              <Button onClick={create} disabled={busy || !name.trim()} data-testid="custom-create">
                {busy ? t("creating") : t("create")}
              </Button>
              {testResult ? (
                <span
                  className={cn("text-sm", testWindows ? "text-muted-foreground" : "text-destructive-foreground")}
                  data-testid="test-result"
                >
                  {testResult}
                  {testWindows
                    ? testWindows.map(
                        (w) => ` · ${w.remainingPct?.toFixed(0) ?? "?"}% (${w.remaining ?? "—"}/${w.total ?? "—"} ${w.unit})`,
                      )
                    : ""}
                </span>
              ) : null}
              {createdMessage ? <span className="text-sm text-muted-foreground">{createdMessage}</span> : null}
              {error ? <span className="text-sm text-destructive-foreground">{error}</span> : null}
            </div>
          </FormSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />} className="text-base">
            {t("list")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
          ) : (
            customProviders.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <ProviderMonogram name={p.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.id}</p>
                </div>
                <Badge variant="outline">{p.unit}</Badge>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                    {t("delete")}
                  </AlertDialogTrigger>
                  <AlertDialogPortal>
                    <AlertDialogBackdrop />
                    <AlertDialogViewport>
                      <AlertDialogPopup>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose>{t("cancel")}</AlertDialogClose>
                          <AlertDialogClose
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => void removeProvider(p.id)}
                          >
                            {t("delete")}
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
    </div>
  );
}
