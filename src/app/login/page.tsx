"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="login-form">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Gauge className="size-5" strokeWidth={2} />
          </span>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{tApp("name")}</h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("password")}</Label>
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
            <p className="text-sm text-destructive" role="alert" data-testid="login-error">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">
          {busy ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
