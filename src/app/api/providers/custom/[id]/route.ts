import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accounts, providers } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { DeclarativeSpecSchema } from "@/server/adapters/declarative";

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  unit: z.string().min(1).max(40).optional(),
  spec: DeclarativeSpecSchema.optional(),
});

async function getCustomProvider(id: string) {
  const db = getDb();
  const row = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!row || row.kind !== "custom") return null;
  return row;
}

/** PATCH /api/providers/custom/[id]（仅 kind=custom 可改）。 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const row = await getCustomProvider(id);
  if (!row) return NextResponse.json({ error: "custom provider not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const db = getDb();
  const set: Partial<typeof providers.$inferInsert> = {};
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.unit !== undefined) set.unit = parsed.data.unit;
  if (parsed.data.spec !== undefined) set.declarativeSpec = JSON.stringify(parsed.data.spec);
  if (Object.keys(set).length > 0) {
    db.update(providers).set(set).where(eq(providers.id, id)).run();
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/providers/custom/[id]（仅 kind=custom 可删；有账户挂载时拒绝）。 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const row = await getCustomProvider(id);
  if (!row) return NextResponse.json({ error: "custom provider not found" }, { status: 404 });
  const db = getDb();
  const attached = db.select().from(accounts).where(eq(accounts.providerId, id)).all();
  if (attached.length > 0) {
    return NextResponse.json({ error: "provider has accounts; delete them first" }, { status: 409 });
  }
  db.delete(providers).where(eq(providers.id, id)).run();
  return NextResponse.json({ ok: true });
}
