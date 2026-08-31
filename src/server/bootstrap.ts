import { getDb, migrate } from "./db";
import { providers } from "./db/schema";
import { BUILTIN_ADAPTERS } from "./adapters/registry";

/**
 * 启动幂等 upsert 10 行 builtin providers（id 同 adapter id，顺序按 BUILTIN_ADAPTERS）。
 * 已存在的行只刷新 name/unit/sortOrder。
 */
export function bootstrapProviders(): void {
  const db = getDb();
  const now = new Date().toISOString();
  for (let i = 0; i < BUILTIN_ADAPTERS.length; i++) {
    const adapter = BUILTIN_ADAPTERS[i];
    db.insert(providers)
      .values({
        id: adapter.id,
        kind: "builtin",
        name: adapter.name,
        unit: adapter.unit,
        declarativeSpec: null,
        sortOrder: i,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: providers.id,
        set: { name: adapter.name, unit: adapter.unit, sortOrder: i },
      })
      .run();
  }
}

let bootstrapped = false;

/** 进程级幂等入口：API route / instrumentation 首次触达时迁移 + 预置 providers。 */
export function ensureBootstrapped(): void {
  if (bootstrapped) return;
  migrate();
  bootstrapProviders();
  bootstrapped = true;
}
