"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTransition, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut, Menu, Moon, RefreshCw, Sun } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetPopup,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [{ href: "/", key: "overview" }, { href: "/settings", key: "settings" }] as const;

/** 顶栏：产品名 + 分段式导航（含当前页高亮）+ 语言/主题切换 + 全局刷新。 */
export function TopBar({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [refreshing, startRefresh] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  // 账户详情页归属概览，所以用前缀匹配而不是等值。
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/accounts") : pathname.startsWith(href));

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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground"
          >
            C
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">{tApp("name")}</span>
        </Link>

        <nav aria-label={t("menu")} className={cn(segmentedControlRootClassName, "hidden sm:flex")}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={segmentedControlItemVariants({ size: "sm", state: "current" })}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
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

          <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

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
            <span className="text-xs font-semibold">{locale === "zh" ? "EN" : "中"}</span>
          </Button>
          {authEnabled ? (
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label={t("logout")}>
              <LogOut />
            </Button>
          ) : null}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label={t("menu")} />}
            >
              <Menu />
            </SheetTrigger>
            <SheetPopup side="right" className="w-72" closeProps={{ "aria-label": t("close") }}>
              <SheetHeader>
                <SheetTitle>{t("menu")}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-4">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </nav>
            </SheetPopup>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
