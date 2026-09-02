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
    <div className="flex min-h-screen flex-col bg-muted/40">
      <TopBar authEnabled={isAuthEnabled()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border bg-background">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          {t("footer")}
        </p>
      </footer>
    </div>
  );
}
