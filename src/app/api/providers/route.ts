import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/server/db";
import { providers } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { adapterBilling, getAdapter } from "@/server/adapters/registry";

/** GET /api/providers → builtin+custom 列表（含 fields 表单描述）。 */
export async function GET(): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const db = getDb();
  const rows = db.select().from(providers).orderBy(asc(providers.sortOrder)).all();
  const list = rows.map((row) => {
    const adapter = getAdapter(row);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      unit: row.unit,
      sortOrder: row.sortOrder,
      fields: adapter?.fields ?? [],
      baseUrlOptions: adapter?.baseUrlOptions ?? null,
      hasSpec: row.kind === "custom" && row.declarativeSpec !== null,
      lane: adapterBilling(adapter, row.kind),
      displayCurrencies: adapter?.displayCurrencies ? [...adapter.displayCurrencies] : null,
    };
  });
  return NextResponse.json({ providers: list });
}
