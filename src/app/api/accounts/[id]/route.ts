import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accounts, providers, snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { getAdapter } from "@/server/adapters/registry";

const PatchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  config: z
    .object({
      intervalMinutes: z.number().int().positive().optional(),
      warnPct: z.number().int().min(0).max(100).optional(),
      baseUrl: z.string().optional(),
      displayCurrency: z.enum(["CNY", "USD"]).optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
});

/** PATCH /api/accounts/[id]（label/config/credentials/enabled 任一）。 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const set: Partial<typeof accounts.$inferInsert> = {};

  if (data.label !== undefined) set.label = data.label;
  if (data.enabled !== undefined) set.enabled = data.enabled ? 1 : 0;
  if (data.config !== undefined) {
    set.config = JSON.stringify({ ...safeConfig(account.config), ...data.config });
    set.nextFetchAt = account.nextFetchAt; // 不动调度
  }
  if (data.credentials !== undefined) {
    // json 类字段必须可解析
    const provider = db.select().from(providers).where(eq(providers.id, account.providerId)).get();
    const adapter = provider ? getAdapter(provider) : undefined;
    for (const field of adapter?.fields ?? []) {
      const value = data.credentials[field.key];
      if (field.kind === "json" && value !== undefined) {
        try {
          JSON.parse(value);
        } catch {
          return NextResponse.json({ error: `field ${field.key} is not valid JSON` }, { status: 400 });
        }
      }
    }
    // 部分替换：提交的字段覆盖，未提交的保留原值
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(decryptSecret(account.credentialsCipher)) as Record<string, string>;
    } catch {
      /* 原密文损坏则整体替换 */
    }
    set.credentialsCipher = encryptSecret(JSON.stringify({ ...existing, ...data.credentials }));
    set.nextFetchAt = null; // 换凭证 → 立即重采
  }
  if (Object.keys(set).length > 0) {
    db.update(accounts).set(set).where(eq(accounts.id, id)).run();
  }
  return NextResponse.json({ ok: true });
}

function safeConfig(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** DELETE /api/accounts/[id]（级联删快照，schema FK onDelete cascade）。 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const { id } = await params;
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });
  db.delete(snapshots).where(eq(snapshots.accountId, id)).run();
  db.delete(accounts).where(eq(accounts.id, id)).run();
  return NextResponse.json({ ok: true });
}
