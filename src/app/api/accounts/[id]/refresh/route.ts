import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accounts, snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { pollAccount } from "@/server/collector";

/** POST /api/accounts/[id]/refresh → await pollAccount(manual) → 返回最新快照。 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  const isDemo = (() => {
    try {
      const parsed: unknown = JSON.parse(account?.config ?? "{}");
      return typeof parsed === "object" && parsed !== null && "demo" in parsed && parsed.demo === true;
    } catch {
      return false;
    }
  })();
  if (!isDemo) {
    try {
      await pollAccount(id, { manual: true });
    } catch {
      /* error 快照已落库；下方返回该快照 */
    }
  }
  const latest = db
    .select()
    .from(snapshots)
    .where(eq(snapshots.accountId, id))
    .orderBy(desc(snapshots.id))
    .limit(1)
    .get();
  if (!latest) return NextResponse.json({ error: "no snapshot produced" }, { status: 502 });
  return NextResponse.json({
    ok: latest.status === "ok",
    snapshot: {
      id: latest.id,
      fetchedAt: latest.fetchedAt,
      status: latest.status,
      error: latest.error,
      windows: latest.windows ? JSON.parse(latest.windows) : null,
      balance: latest.balance ? JSON.parse(latest.balance) : null,
    },
  });
}
