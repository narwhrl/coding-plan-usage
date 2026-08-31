import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { DeclarativeSpecSchema, declarativeAdapter } from "@/server/adapters/declarative";

const TestSchema = z.object({
  spec: z.record(z.string(), z.unknown()),
  apiKey: z.string().min(1),
});

/** POST /api/providers/custom/test {spec, apiKey} → 试采一次，不落库。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const body = await request.json().catch(() => null);
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const specParsed = DeclarativeSpecSchema.safeParse(parsed.data.spec);
  if (!specParsed.success) {
    return NextResponse.json({ error: "invalid spec", details: specParsed.error.flatten() }, { status: 400 });
  }
  try {
    const adapter = declarativeAdapter("test", specParsed.data);
    const result = await adapter.fetchUsage({
      credentials: { apiKey: parsed.data.apiKey },
      config: {},
      fetchFn: fetch,
      now: () => new Date(),
    });
    return NextResponse.json({ ok: true, windows: result.windows, balance: result.balance ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
