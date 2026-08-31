import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accounts, providers, snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { encryptSecret } from "@/server/crypto";
import { getSettings } from "@/server/settings";
import { getAdapter } from "@/server/adapters/registry";

/**
 * GET /api/accounts → 概览数据（卡片所需全部在内）：
 * 账户 + provider 名 + 最新快照 + 最后成功快照 + 预警状态。
 */
export async function GET(): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const db = getDb();
  const settings = await getSettings();
  const accountRows = db.select().from(accounts).orderBy(asc(accounts.sortOrder), asc(accounts.createdAt)).all();
  const providerRows = db.select().from(providers).all();
  const providerById: Record<string, (typeof providerRows)[number]> = {};
  for (const p of providerRows) providerById[p.id] = p;

  const result = [];
  for (const account of accountRows) {
    const provider = providerById[account.providerId];
    const latest = db
      .select()
      .from(snapshots)
      .where(eq(snapshots.accountId, account.id))
      .orderBy(desc(snapshots.id))
      .limit(1)
      .get();
    const lastOk = db
      .select()
      .from(snapshots)
      .where(eq(snapshots.accountId, account.id))
      .orderBy(desc(snapshots.id))
      .all()
      .find((s) => s.status === "ok");

    let config: { intervalMinutes?: number; warnPct?: number; baseUrl?: string } = {};
    try {
      config = JSON.parse(account.config);
    } catch {
      /* ignore */
    }
    const warnThreshold = config.warnPct ?? settings.warnPct;
    const warnWindows = (lastOk ? safeParseWindows(lastOk.windows) : []).filter(
      (w) => typeof w.remainingPct === "number" && w.remainingPct < warnThreshold,
    );

    result.push({
      id: account.id,
      providerId: account.providerId,
      providerName: provider?.name ?? account.providerId,
      providerKind: provider?.kind ?? "builtin",
      providerUnit: provider?.unit ?? "",
      label: account.label,
      enabled: account.enabled === 1,
      config,
      nextFetchAt: account.nextFetchAt,
      createdAt: account.createdAt,
      latestSnapshot: latest ? serializeSnapshot(latest) : null,
      lastOkSnapshot: lastOk ? serializeSnapshot(lastOk) : null,
      warn: warnWindows.length > 0,
      warnThreshold,
    });
  }
  return NextResponse.json({ accounts: result });
}

function serializeSnapshot(s: typeof snapshots.$inferSelect) {
  return {
    id: s.id,
    fetchedAt: s.fetchedAt,
    status: s.status,
    error: s.error,
    windows: safeParseWindows(s.windows),
    balance: s.balance ? (JSON.parse(s.balance) as { amount: number; currency?: string }) : null,
    meta: s.raw ? (safeParseMeta(s.raw) as Record<string, unknown> | null) : null,
  };
}

function safeParseWindows(text: string | null): { remainingPct?: number }[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseMeta(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const CreateAccountSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.string()),
  config: z
    .object({
      intervalMinutes: z.number().int().positive().optional(),
      warnPct: z.number().int().min(0).max(100).optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

/** POST /api/accounts {providerId, label, credentials, config?}（credentials 加密入库）。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  ensureBootstrapped();
  const body = await request.json().catch(() => null);
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const db = getDb();
  const provider = db.select().from(providers).where(eq(providers.id, parsed.data.providerId)).get();
  if (!provider) return NextResponse.json({ error: "provider not found" }, { status: 404 });

  // json 类字段必须可解析
  const adapter = getAdapter(provider);
  for (const field of adapter?.fields ?? []) {
    const value = parsed.data.credentials[field.key];
    if (field.kind === "json" && value !== undefined) {
      try {
        JSON.parse(value);
      } catch {
        return NextResponse.json({ error: `field ${field.key} is not valid JSON` }, { status: 400 });
      }
    }
  }

  const id = randomUUID();
  const count = db.select().from(accounts).all().length;
  db.insert(accounts)
    .values({
      id,
      providerId: parsed.data.providerId,
      label: parsed.data.label,
      credentialsCipher: encryptSecret(JSON.stringify(parsed.data.credentials)),
      config: JSON.stringify(parsed.data.config ?? {}),
      enabled: 1,
      nextFetchAt: null, // 立即采集
      sortOrder: count,
      createdAt: new Date().toISOString(),
    })
    .run();
  return NextResponse.json({ ok: true, id });
}
