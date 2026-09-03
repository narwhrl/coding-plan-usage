import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accounts, providers, snapshots } from "@/server/db/schema";
import { requireAuth } from "@/server/auth";
import { ensureBootstrapped } from "@/server/bootstrap";
import { encryptSecret } from "@/server/crypto";
import { getSettings } from "@/server/settings";
import { adapterBilling, getAdapter } from "@/server/adapters/registry";
import { parseDisplayCurrency } from "@/lib/display-currency";
import { dailyTightestSeries, parseWindows } from "@/server/spark";

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
  const now = new Date();
  const nowIso = now.toISOString();
  // 一次批量查询全部账户近 7 天 ok 快照（避免每账户 N+1）。
  const sparkStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 86_400_000,
  ).toISOString();
  const sparkRowsAll = db
    .select({ accountId: snapshots.accountId, fetchedAt: snapshots.fetchedAt, windows: snapshots.windows })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.status, "ok"),
        gte(snapshots.fetchedAt, sparkStartIso),
        lte(snapshots.fetchedAt, nowIso),
      ),
    )
    .orderBy(asc(snapshots.id))
    .all();
  const sparkByAccount = new Map<string, { fetchedAt: string; windows: string | null }[]>();
  for (const row of sparkRowsAll) {
    const list = sparkByAccount.get(row.accountId) ?? [];
    list.push(row);
    sparkByAccount.set(row.accountId, list);
  }
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
      .where(and(eq(snapshots.accountId, account.id), eq(snapshots.status, "ok")))
      .orderBy(desc(snapshots.id))
      .limit(1)
      .get();

    let config: {
      intervalMinutes?: number;
      warnPct?: number;
      baseUrl?: string;
      displayCurrency?: "CNY" | "USD";
      demo?: boolean;
    } = {};
    try {
      const parsed = JSON.parse(account.config) as typeof config;
      config = parsed && typeof parsed === "object" ? parsed : {};
      const displayCurrency = parseDisplayCurrency(config.displayCurrency);
      if (displayCurrency) config.displayCurrency = displayCurrency;
      else delete config.displayCurrency;
    } catch {
      /* ignore */
    }
    const warnThreshold = config.warnPct ?? settings.warnPct;
    const warnWindows = (lastOk ? parseWindows(lastOk.windows) : []).filter(
      (w) => !w.minor && typeof w.remainingPct === "number" && w.remainingPct < warnThreshold,
    );

    result.push({
      id: account.id,
      providerId: account.providerId,
      providerName: provider?.name ?? account.providerId,
      providerKind: provider?.kind ?? "builtin",
      providerUnit: provider?.unit ?? "",
      lane: adapterBilling(provider ? getAdapter(provider) : undefined, provider?.kind),
      label: account.label,
      enabled: account.enabled === 1,
      config,
      nextFetchAt: account.nextFetchAt,
      createdAt: account.createdAt,
      latestSnapshot: latest ? serializeSnapshot(latest) : null,
      lastOkSnapshot: lastOk ? serializeSnapshot(lastOk) : null,
      warn: warnWindows.length > 0 || adapterMeta(lastOk?.raw ?? null)?.isAvailable === false,
      warnThreshold,
      spark: dailyTightestSeries(
        (sparkByAccount.get(account.id) ?? []).map((r) => ({
          fetchedAt: r.fetchedAt,
          windows: parseWindows(r.windows),
        })),
        now,
      ),
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
    windows: parseWindows(s.windows),
    balance: parseBalance(s.balance),
    meta: s.raw ? (safeParseMeta(s.raw) as Record<string, unknown> | null) : null,
  };
}

function parseBalance(text: string | null): { amount: number; currency?: string } | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as { amount: number; currency?: string })
      : null;
  } catch {
    return null;
  }
}

function safeParseMeta(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** raw 列形状：{ meta: 适配器 meta, responses }。isAvailable===false 表示官方余额不足以继续调 API。 */
function adapterMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  const parsed = safeParseMeta(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const meta = (parsed as { meta?: unknown }).meta;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
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
      displayCurrency: z.enum(["CNY", "USD"]).optional(),
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
