"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Moon, RefreshCw, Sun } from "lucide-react";

/** 顶栏：产品名 + 语言/主题切换 + 全局刷新。cal.com 式克制灰阶。 */
export function TopBar({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [refreshing, startRefresh] = useTransition();

  const switchLang = () => {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `cpu_lang=${next}; path=/; max-age=31536000`;
    router.refresh();
  };

  const refreshAll = () => {
    startRefresh(async () => {
      const accounts: { id: string }[] = await fetch("/api/accounts")
        .then((r) => r.json())
        .then((d) => d.accounts ?? []);
      await Promise.allSettled(
        accounts.map((a) => fetch(`/api/accounts/${a.id}/refresh`, { method: "POST" })),
      );
      router.refresh();
    });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground">
            C
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">Coding Plan Usage</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <Link href="/" className="transition-colors hover:text-foreground">
            {t("overview")}
          </Link>
          <Link href="/settings" className="transition-colors hover:text-foreground">
            {t("settings")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label={t("refreshAll")}
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} data-testid="refresh-all" />
            <span className="hidden sm:inline">{t("refreshAll")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={t("theme")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="block dark:hidden" />
          </Button>
          <Button variant="ghost" size="sm" onClick={switchLang} aria-label={t("language")} data-testid="lang-switch">
            {locale === "zh" ? "EN" : "中"}
          </Button>
          {authEnabled ? (
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
              {t("logout")}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
