"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useTransition, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, Moon, RefreshCw, Sun } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetPopup,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";

/** 顶栏：产品名 + 当前页分段导航 + 图标操作。 */
export function TopBar({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [refreshing, startRefresh] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  const onOverview = pathname === "/" || pathname.startsWith("/accounts/");
  const onSettings = pathname.startsWith("/settings");

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

  const navClassName = (active: boolean) =>
    cn(
      segmentedControlItemVariants({ size: "sm", state: "current" }),
      active && "bg-background text-foreground shadow-sm/5 dark:bg-input",
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground">
            C
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">{tApp("name")}</span>
        </Link>
        <nav className={cn(segmentedControlRootClassName, "ml-2 hidden sm:flex")} aria-label={tApp("name")}>
          <Link href="/" aria-current={onOverview ? "page" : undefined} className={navClassName(onOverview)}>
            {t("overview")}
          </Link>
          <Link href="/settings" aria-current={onSettings ? "page" : undefined} className={navClassName(onSettings)}>
            {t("settings")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label={t("menu")} />}
            >
              <Menu />
            </SheetTrigger>
            <SheetPopup side="right" className="w-72" closeProps={{ "aria-label": t("close") }}>
              <SheetHeader className="sr-only">
                <SheetTitle>{t("menu")}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-4">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  aria-current={onOverview ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground",
                    onOverview ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t("overview")}
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  aria-current={onSettings ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground",
                    onSettings ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t("settings")}
                </Link>
              </nav>
            </SheetPopup>
          </Sheet>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label={t("refreshAll")}
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} data-testid="refresh-all" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={t("theme")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="block dark:hidden" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={switchLang}
            aria-label={t("language")}
            data-testid="lang-switch"
          >
            {locale === "zh" ? "EN" : "中"}
          </Button>
          {authEnabled ? (
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-foreground">
              {t("logout")}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
