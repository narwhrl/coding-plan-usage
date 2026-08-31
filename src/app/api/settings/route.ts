import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { getSettings, patchSettings } from "@/server/settings";

const PatchSchema = z.object({
  defaultIntervalMinutes: z.number().int().positive().max(24 * 60).optional(),
  warnPct: z.number().int().min(0).max(100).optional(),
});

export async function GET(): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  return NextResponse.json({ settings: await getSettings() });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ settings: await patchSettings(parsed.data) });
}
