import { z } from "zod";
import type { Adapter, AdapterResult } from "./types";

/**
 * 声明式自定义提供商：REST JSON 端点 + dot-path 字段映射，无脚本执行。
 * spec 经 zod 校验后包装成 Adapter；结果=单窗口，值统一除以 divisor。
 */

export const DeclarativeSpecSchema = z.object({
  baseUrl: z.string().url(),
  method: z.literal("GET"),
  path: z.string().startsWith("/"),
  headers: z.record(z.string(), z.string()).optional(),
  /** bearer: apiKey 进 Authorization: Bearer；header: apiKey 进指定 header */
  auth: z.union([
    z.object({ type: z.literal("bearer") }),
    z.object({ type: z.literal("header"), header: z.string().min(1) }),
  ]),
  mapping: z.object({
    total: z.string().optional(),
    used: z.string().optional(),
    remaining: z.string().optional(),
    resetAt: z.string().optional(),
  }),
  divisor: z.number().positive().optional(),
  unit: z.string().min(1),
});

export type DeclarativeSpec = z.infer<typeof DeclarativeSpecSchema>;

/** dot-path getter，支持 a.b.0.c 数组下标。 */
export function getByDotPath(source: unknown, dotPath: string): unknown {
  if (!dotPath) return undefined;
  let current: unknown = source;
  for (const segment of dotPath.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function declarativeAdapter(name: string, spec: DeclarativeSpec): Adapter {
  return {
    id: `custom:${name}`,
    name,
    unit: spec.unit,
    fields: [
      { key: "apiKey", label: "API Key", kind: "text", secret: true },
    ],
    async fetchUsage(ctx): Promise<AdapterResult> {
      const apiKey = (ctx.credentials.apiKey ?? "").trim();
      if (!apiKey) throw new Error(`${name}: missing apiKey`);
      const base = spec.baseUrl.replace(/\/+$/, "");
      const url = `${base}${spec.path}`;
      const headers: Record<string, string> = {
        accept: "application/json",
        ...(spec.headers ?? {}),
        ...(spec.auth.type === "bearer"
          ? { Authorization: `Bearer ${apiKey}` }
          : { [spec.auth.header]: apiKey }),
      };

      const res = await ctx.fetchFn(url, { headers });
      if (!res.ok) {
        throw new Error(`${name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const body = (await res.json()) as unknown;

      const divisor = spec.divisor ?? 1;
      const total = toNumber(getByDotPath(body, spec.mapping.total ?? ""));
      const used = toNumber(getByDotPath(body, spec.mapping.used ?? ""));
      const remaining = toNumber(getByDotPath(body, spec.mapping.remaining ?? ""));
      const resetRaw = getByDotPath(body, spec.mapping.resetAt ?? "");
      const resetNum = toNumber(resetRaw);
      const resetAt =
        typeof resetRaw === "string" && Number.isFinite(Date.parse(resetRaw))
          ? new Date(Date.parse(resetRaw)).toISOString()
          : resetNum !== null && resetNum > 1e9
            ? new Date(resetNum > 1e12 ? resetNum : resetNum * 1000).toISOString()
            : null;

      const totalDiv = total !== null ? total / divisor : undefined;
      const usedDiv = used !== null ? used / divisor : undefined;
      const remainingDiv = remaining !== null ? remaining / divisor : undefined;
      const effRemaining = remainingDiv ?? (totalDiv !== undefined && usedDiv !== undefined ? totalDiv - usedDiv : undefined);
      const remainingPct =
        totalDiv !== undefined && totalDiv > 0 && effRemaining !== undefined
          ? Math.max(0, Math.min(100, (effRemaining / totalDiv) * 100))
          : undefined;

      if (totalDiv === undefined && usedDiv === undefined && remainingDiv === undefined) {
        throw new Error(`${name}: none of mapping {total,used,remaining} resolved to a number`);
      }
      return {
        windows: [
          {
            kind: "credits",
            unit: spec.unit,
            ...(usedDiv !== undefined ? { used: usedDiv } : {}),
            ...(totalDiv !== undefined ? { total: totalDiv } : {}),
            ...(effRemaining !== undefined ? { remaining: effRemaining } : {}),
            remainingPct,
            resetAt,
          },
        ],
      };
    },
  };
}

