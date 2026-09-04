import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import {
  getNotifySettings,
  getSettings,
  InvalidWebhookUrlError,
  patchNotifySettings,
  patchSettings,
  redactNotifySettings,
} from "@/server/settings";

const PatchSchema = z.object({
  defaultIntervalMinutes: z.number().int().positive().max(24 * 60).optional(),
  warnPct: z.number().int().min(0).max(100).optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(),
  rawRetentionDays: z.number().int().min(0).max(365).optional(),
  notify: z
    .object({
      enabled: z.boolean().optional(),
      // 空串 = 保持原值（同「编辑账户」里凭证留空即保留）。
      url: z.string().optional(),
      secret: z.string().optional(),
      events: z
        .object({
          low: z.boolean().optional(),
          recovered: z.boolean().optional(),
          error: z.boolean().optional(),
        })
        .optional(),
      minIntervalMinutes: z.number().int().min(5).max(10_080).optional(),
    })
    .optional(),
});

export async function GET(): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  return NextResponse.json({
    settings: await getSettings(),
    notify: redactNotifySettings(await getNotifySettings()),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { notify, ...general } = parsed.data;
  const settings = await patchSettings(general);
  if (notify) {
    try {
      return NextResponse.json({ settings, notify: await patchNotifySettings(notify) });
    } catch (error) {
      if (error instanceof InvalidWebhookUrlError) {
        return NextResponse.json({ error: "invalid webhook url" }, { status: 400 });
      }
      throw error;
    }
  }
  return NextResponse.json({
    settings,
    notify: redactNotifySettings(await getNotifySettings()),
  });
}
