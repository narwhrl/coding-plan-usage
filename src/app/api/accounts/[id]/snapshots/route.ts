import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";

const DEFAULT_LIMIT = 20_000;
const MAX_LIMIT = 20_000;

/**
 * GET /api/accounts/[id]/snapshots?from&to&limit → 时间升序 ok 快照（图表用）。
 * from/to 为 ISO 日期时间，可选。limit 取最新 N 条（1..20000，默认 20000）后再升序返回，
 * 是防止历史无上限膨胀的安全阀；真正的体积控制靠设置里的快照留存天数。
 * 只投影图表需要的四列：raw 单条可达 20KB，全列 select 会把上百 MB 读进内存再丢掉。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit >= 1
      ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const db = getDb();
  const conditions = [eq(snapshots.accountId, id), eq(snapshots.status, "ok")];
  if (from) conditions.push(gte(snapshots.fetchedAt, from));
  if (to) conditions.push(lte(snapshots.fetchedAt, to));

  const rows = db
    .select({
      id: snapshots.id,
      fetchedAt: snapshots.fetchedAt,
      windows: snapshots.windows,
      balance: snapshots.balance,
    })
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(desc(snapshots.fetchedAt), desc(snapshots.id))
    .limit(limit)
    .all()
    .reverse();

  return NextResponse.json({
    snapshots: rows.map((s) => ({
      id: s.id,
      fetchedAt: s.fetchedAt,
      windows: s.windows ? JSON.parse(s.windows) : [],
      balance: s.balance ? JSON.parse(s.balance) : null,
    })),
  });
}
