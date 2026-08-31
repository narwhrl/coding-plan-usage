import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { providers } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { DeclarativeSpecSchema } from "@/server/adapters/declarative";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(40),
  spec: DeclarativeSpecSchema,
});

/** POST /api/providers/custom {name, unit, spec}。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, unit, spec } = parsed.data;
  const id = `custom-${randomUUID()}`;
  const db = getDb();
  db.insert(providers)
    .values({
      id,
      kind: "custom",
      name,
      unit,
      declarativeSpec: JSON.stringify(spec),
      sortOrder: 1000 + (Date.now() % 100000),
      createdAt: new Date().toISOString(),
    })
    .run();
  return NextResponse.json({ ok: true, id });
}
