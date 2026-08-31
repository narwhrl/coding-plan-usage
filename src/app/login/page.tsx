"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const t = useTranslations("login");
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4" data-testid="login-form">
        <div className="space-y-1.5 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error !== null}
            data-testid="login-password"
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert" data-testid="login-error">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={busy || password.length === 0} data-testid="login-submit">
          {busy ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
