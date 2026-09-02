"use client";

import { usePathname, useRouter } from "next/navigation";
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

/** 顶栏：产品名 + 语言/主题切换 + 全局刷新。cal.com 式克制灰阶。 */
export function TopBar({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [refreshing, startRefresh] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const navItems = [
    { href: "/", label: t("overview"), active: pathname === "/" || pathname.startsWith("/accounts") },
    { href: "/settings", label: t("settings"), active: pathname.startsWith("/settings") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground">
            C
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">Coding Plan Usage</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 text-sm sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                item.active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
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
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={item.active ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      item.active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetPopup>
          </Sheet>
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
