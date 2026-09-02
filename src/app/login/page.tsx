"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const t = useTranslations("login");
  const tApp = useTranslations("app");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(t("wrong"));
      }
    } catch {
      setError(t("wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div className="space-y-3 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary font-heading text-base font-semibold text-primary-foreground">
                C
              </span>
              <div className="space-y-1">
                <p className="font-heading text-sm font-semibold tracking-tight">{tApp("name")}</p>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
                <p className="text-sm text-muted-foreground">{t("description")}</p>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                name="password"
                required
                value={password}
                onValueChange={(value) => {
                  setPassword(value);
                  setError(null);
                }}
                aria-invalid={error !== null}
                data-testid="login-password"
              />
              {error ? (
                <p className="text-sm text-destructive-foreground" role="alert" data-testid="login-error">
                  {error}
                </p>
              ) : null}
            </Field>
            <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">
              {busy ? t("submitting") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
