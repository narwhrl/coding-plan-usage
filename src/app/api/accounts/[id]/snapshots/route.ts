import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";

/**
 * GET /api/accounts/[id]/snapshots?from&to → 时间升序 ok 快照（图表用）。
 * from/to 为 ISO 日期时间，可选。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const db = getDb();
  const conditions = [eq(snapshots.accountId, id), eq(snapshots.status, "ok")];
  if (from) conditions.push(gte(snapshots.fetchedAt, from));
  if (to) conditions.push(lte(snapshots.fetchedAt, to));

  const rows = db
    .select()
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(asc(snapshots.fetchedAt), asc(snapshots.id))
    .all();

  return NextResponse.json({
    snapshots: rows.map((s) => ({
      id: s.id,
      fetchedAt: s.fetchedAt,
      windows: s.windows ? JSON.parse(s.windows) : [],
      balance: s.balance ? JSON.parse(s.balance) : null,
    })),
  });
}
