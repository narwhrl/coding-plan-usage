"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTransition, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetTrigger,
  SheetPopup,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Languages,
  LogOut,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [{ href: "/", key: "overview" }, { href: "/settings", key: "settings" }] as const;

const THEME_OPTIONS = [
  { value: "light", key: "themeLight", Icon: Sun },
  { value: "dark", key: "themeDark", Icon: Moon },
  { value: "system", key: "themeSystem", Icon: Monitor },
] as const;

const THEME_NEXT = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;


/** 顶栏：产品名 + 分段式导航（含当前页高亮）+ 主题三选/语言/全局刷新。 */
export function TopBar({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [refreshing, startRefresh] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasToggled, setHasToggled] = useState(false);

  // 未显式设置时（SSR/首帧）next-themes 的 theme 为 undefined，视作跟随系统。
  const currentTheme =
    theme && theme in THEME_NEXT ? (theme as keyof typeof THEME_NEXT) : "system";
  const currentKey = THEME_OPTIONS.find((option) => option.value === currentTheme)!.key;

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

        {/* GitHub 式贴底线导航：指示条压在 header 的 border-b 上连成一条，选中处加粗一段。 */}
        <nav aria-label={t("menu")} className="hidden self-stretch sm:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "relative flex items-center px-3 text-sm font-medium text-muted-foreground",
                "transition-[color] duration-150 ease-out hover:text-foreground",
                "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
                "after:opacity-0 after:transition-opacity after:duration-150 after:ease-out",
                "aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
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
            aria-label={`${t("theme")} · ${t(currentKey)}`}
            data-testid="theme-switch"
            onClick={() => {
              setHasToggled(true);
              setTheme(THEME_NEXT[currentTheme]);
            }}
          >
            <span className="relative flex size-4 items-center justify-center">
              {THEME_OPTIONS.map(({ value, Icon }) => (
                <Icon
                  key={value}
                  className={cn(
                    "absolute size-4",
                    hasToggled &&
                      "transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    currentTheme === value
                      ? "scale-100 opacity-100 blur-[0px]"
                      : "scale-25 opacity-0 blur-[4px]",
                  )}
                />
              ))}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={switchLang}
            aria-label={t("language")}
            data-testid="lang-switch"
            className="hidden sm:inline-flex"
          >
            <span className="text-xs font-semibold">{locale === "zh" ? "EN" : "中"}</span>
          </Button>
          {authEnabled ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={logout}
              aria-label={t("logout")}
              className="hidden sm:inline-flex"
            >
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
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </nav>
              <Separator className="mx-4 w-auto" />
              <div className="flex flex-col gap-1 p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    switchLang();
                    setMenuOpen(false);
                  }}
                >
                  <Languages />
                  {t("language")}
                </Button>
                {authEnabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      void logout();
                      setMenuOpen(false);
                    }}
                  >
                    <LogOut />
                    {t("logout")}
                  </Button>
                ) : null}
              </div>
            </SheetPopup>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
