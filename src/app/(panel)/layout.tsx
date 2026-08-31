import { redirect } from "next/navigation";
import { isAuthenticated, isAuthEnabled } from "@/server/auth";
import { TopBar } from "@/components/top-bar";

/** 面板守卫布局：verifySession 失败 → /login。/login 在 (panel) 之外。 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar authEnabled={isAuthEnabled()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        self-hosted · SQLite snapshots
      </footer>
    </div>
  );
}
