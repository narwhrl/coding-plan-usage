import { clampPercent, type Adapter, type AdapterResult, type Window } from "./types";

/**
 * Grok / SuperGrok（非官方 gRPC-web）。
 * 凭证=粘贴 ~/.grok/auth.json（scope→{key,email} 映射；优先 https://auth.x.ai:: OIDC scope，
 * 其次 /sign-in legacy，再任意含 key 条目；也接受直接粘贴 token 字符串或 {"key":"..."}）。
 * POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig，
 * body=5 字节空 grpc-web 帧，响应为 protobuf；按 token-monitor grokLimits.js（MIT）启发式扫描：
 * - fixed32(field#1, 0-100) = 已用百分比
 * - varint 秒级时间戳：path 1.4.1=周期起，1.5.1=重置（否则最早未来时间戳）
 * - trailer grpc-status 非 0 → 错误
 */

const GRPC_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";

function bufferFrom(value: ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.alloc(0);
}

function readProtoVarint(bytes: Buffer, start: number): { value: number; offset: number } | null {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < bytes.length && shift <= 63n) {
    const byte = bytes[offset];
    value |= BigInt(byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value: Number(value), offset };
    shift += 7n;
  }
  return null;
}

type ProtoField = { path: number[]; value: number; order: number };

function scanProto(data: Buffer, depth: number, path: number[], state: { fixed32: ProtoField[]; varint: ProtoField[]; order: number }): void {
  if (!data.length || depth > 8) return;
  let offset = 0;
  while (offset < data.length) {
    const key = readProtoVarint(data, offset);
    if (!key) return;
    offset = key.offset;
    const field = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    if (field <= 0) return;
    const nextPath = path.concat(field);
    if (wireType === 0) {
      const read = readProtoVarint(data, offset);
      if (!read) return;
      state.varint.push({ path: nextPath, value: read.value, order: state.order++ });
      offset = read.offset;
    } else if (wireType === 1) {
      if (offset + 8 > data.length) return;
      offset += 8;
    } else if (wireType === 2) {
      const read = readProtoVarint(data, offset);
      if (!read) return;
      offset = read.offset;
      const end = offset + read.value;
      if (read.value < 0 || end > data.length) return;
      if (read.value > 0) scanProto(data.subarray(offset, end), depth + 1, nextPath, state);
      offset = end;
    } else if (wireType === 5) {
      if (offset + 4 > data.length) return;
      state.fixed32.push({ path: nextPath, value: data.readFloatLE(offset), order: state.order++ });
      offset += 4;
    } else {
      return;
    }
  }
}

function grpcWebDataFrames(data: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (offset + 5 > data.length) return [];
    const flags = data[offset];
    const length = data.readUInt32BE(offset + 1);
    const start = offset + 5;
    const end = start + length;
    if (end > data.length) return [];
    if ((flags & 0x80) === 0) frames.push(data.subarray(start, end));
    offset = end;
  }
  return frames;
}

function grpcWebTrailerFields(data: Buffer): Record<string, string> {
  const fields: Record<string, string> = {};
  let offset = 0;
  while (offset + 5 <= data.length) {
    const flags = data[offset];
    const length = data.readUInt32BE(offset + 1);
    const start = offset + 5;
    const end = start + length;
    if (end > data.length) break;
    if ((flags & 0x80) !== 0) {
      const text = data.subarray(start, end).toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        if (separator <= 0) continue;
        fields[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
      }
    }
    offset = end;
  }
  return fields;
}

function parseGrokToken(rawCredential: string): string {
  const raw = rawCredential.trim();
  if (!raw) throw new Error("Grok: missing credentials");
  // 直接是 token 或 JSON
  if (!raw.startsWith("{")) return raw.replace(/^"|"$/g, "");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Grok: auth.json is not valid JSON");
  }
  if (typeof parsed.key === "string" && parsed.key.trim()) return parsed.key.trim();
  const entries = Object.entries(parsed).filter(
    ([, v]) => v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string" && ((v as { key?: unknown }).key as string).trim() !== "",
  ) as [string, { key: string }][];

  const oidc = entries.find(([scope]) => scope.startsWith("https://auth.x.ai::"));
  const legacy = entries.find(([scope]) => scope === "https://accounts.x.ai/sign-in" || scope.includes("/sign-in"));
  const picked = oidc || legacy || entries[0];
  if (!picked) throw new Error("Grok: auth.json has no entry with a key field — re-paste ~/.grok/auth.json");
  return picked[1].key.trim();
}

function parseGrpcBilling(data: Buffer, nowMs: number): Window[] {
  let payloads = grpcWebDataFrames(data);
  if (payloads.length === 0 && data.length > 0 && data[0] > 0 && data[0] % 8 <= 5) payloads = [data];
  if (payloads.length === 0) throw new Error("Grok web billing returned no protobuf payload");

  const state = { fixed32: [] as ProtoField[], varint: [] as ProtoField[], order: 0 };
  for (const payload of payloads) scanProto(payload, 0, [], state);

  const percentField = state.fixed32
    .filter((f) => f.path[f.path.length - 1] === 1 && Number.isFinite(f.value) && f.value >= 0 && f.value <= 100)
    .sort((a, b) => a.path.length - b.path.length || a.order - b.order)[0];

  const timestamps = state.varint
    .filter((f) => f.value >= 1_700_000_000 && f.value <= 2_100_000_000)
    .map((f) => ({ ...f, ms: f.value * 1000 }));
  const futureResets = timestamps.filter((f) => f.ms > nowMs);
  const preferredStart = timestamps.filter((f) => f.path.join(".") === "1.4.1").sort((a, b) => b.ms - a.ms)[0] ?? null;
  const preferredReset =
    futureResets.filter((f) => f.path.join(".") === "1.5.1").sort((a, b) => a.ms - b.ms)[0] ?? futureResets.sort((a, b) => a.ms - b.ms)[0] ?? null;

  const hasUsagePeriod = state.varint.some((f) => {
    const key = f.path.join(".");
    return key.startsWith("1.6") || (key === "1.8.1" && (f.value === 1 || f.value === 2));
  });
  const noUsageYet = !percentField && state.fixed32.length === 0 && preferredReset && hasUsagePeriod;
  const percent = percentField ? percentField.value : noUsageYet ? 0 : null;
  if (percent === null) throw new Error("Could not parse Grok web billing usage");

  const usedPct = clampPercent(percent);
  const minutes =
    preferredStart && preferredReset && preferredReset.ms > preferredStart.ms
      ? Math.round((preferredReset.ms - preferredStart.ms) / 60000)
      : preferredReset
        ? Math.round((preferredReset.ms - nowMs) / 60000)
        : null;
  const days = minutes !== null ? Math.round(minutes / (24 * 60)) : null;
  const label = days !== null && days >= 4 && days <= 12 ? "Weekly" : "Monthly";

  return [
    {
      kind: "credits",
      label,
      unit: "percent",
      remainingPct: Math.max(0, Math.min(100, 100 - (usedPct ?? 0))),
      resetAt: preferredReset ? new Date(preferredReset.ms).toISOString() : null,
    },
  ];
}

export const grokAdapter: Adapter = {
  id: "grok",
  name: "Grok / SuperGrok",
  unit: "percent",
  fields: [
    {
      key: "authJson",
      label: "auth.json (~/.grok/auth.json) 或 token",
      kind: "json",
      secret: true,
      placeholder: '{"https://auth.x.ai::...":{"key":"..."}}',
    },
  ],
  async fetchUsage(ctx): Promise<AdapterResult> {
    const token = parseGrokToken(ctx.credentials.authJson ?? "");
    const res = await ctx.fetchFn(GRPC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-XAI-Token-Auth": "xai-grok-cli",
        Accept: "*/*",
        "Content-Type": "application/grpc-web+proto",
        "User-Agent": "Grok Build",
        Origin: "https://grok.com",
        Referer: "https://grok.com/?_s=usage",
        "x-grpc-web": "1",
        "x-user-agent": "connect-es/2.1.1",
      },
      body: Buffer.from([0, 0, 0, 0, 0]),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Grok web billing rejected credentials (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`Grok web billing HTTP ${res.status}`);

    const body = bufferFrom(await res.arrayBuffer());
    const trailers = grpcWebTrailerFields(body);
    const rawStatus = trailers["grpc-status"] ?? "";
    if (rawStatus && rawStatus !== "0") {
      const message = trailers["grpc-message"] ?? "";
      const status = Number(rawStatus);
      const authFailure =
        status === 16 ||
        (status === 7 && /bad-credentials|unauthenticated/i.test(message));
      throw new Error(
        authFailure
          ? "Grok web billing rejected credentials"
          : `Grok web billing RPC failed (status ${rawStatus}${message ? `: ${message}` : ""})`,
      );
    }
    return { windows: parseGrpcBilling(body, ctx.now().getTime()) };
  },
};
