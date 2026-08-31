import type { Adapter } from "./types";
import { glmAdapter } from "./glm";
import { deepseekAdapter } from "./deepseek";
import { codexAdapter } from "./codex";
import { claudeAdapter } from "./claude";
import { cursorAdapter } from "./cursor";
import { kimiAdapter } from "./kimi";
import { minimaxAdapter } from "./minimax";
import { grokAdapter } from "./grok";
import { copilotAdapter } from "./copilot";
import { openrouterAdapter } from "./openrouter";
import { declarativeAdapter, DeclarativeSpecSchema, type DeclarativeSpec } from "./declarative";
import type { Provider } from "../db/schema";

/** 内置 10 家（顺序即 providers.sortOrder）。 */
export const BUILTIN_ADAPTERS: Adapter[] = [
  glmAdapter,
  deepseekAdapter,
  codexAdapter,
  claudeAdapter,
  cursorAdapter,
  kimiAdapter,
  minimaxAdapter,
  grokAdapter,
  copilotAdapter,
  openrouterAdapter,
];

export function getBuiltinAdapter(id: string): Adapter | undefined {
  return BUILTIN_ADAPTERS.find((a) => a.id === id);
}

/**
 * builtin → registry 查找；custom → declarative spec 包装。
 * spec 非法时返回 undefined（调用方决定 404/400）。
 */
export function getAdapter(provider: Provider): Adapter | undefined {
  if (provider.kind === "builtin") return getBuiltinAdapter(provider.id);
  if (provider.kind !== "custom" || !provider.declarativeSpec) return undefined;
  const parsed = DeclarativeSpecSchema.safeParse(safeJson(provider.declarativeSpec));
  if (!parsed.success) return undefined;
  return declarativeAdapter(provider.name, parsed.data as DeclarativeSpec);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
