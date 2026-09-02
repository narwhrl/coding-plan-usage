import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isAuthenticated, isAuthEnabled } from "@/server/auth";
import { TopBar } from "@/components/top-bar";

/** 面板守卫布局：verifySession 失败 → /login。/login 在 (panel) 之外。 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const t = await getTranslations("app");
  const tCommon = await getTranslations("common");
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {tCommon("skipToContent")}
      </a>
      <TopBar authEnabled={isAuthEnabled()} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        {t("footer")}
      </footer>
    </div>
  );
}
