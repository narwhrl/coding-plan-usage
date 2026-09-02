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
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar authEnabled={isAuthEnabled()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border py-3 text-center text-[11px] text-muted-foreground/70">
        {t("footer")}
      </footer>
    </div>
  );
}
