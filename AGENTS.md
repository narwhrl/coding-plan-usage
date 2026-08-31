<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Project constraints — coding-plan-usage

## UI 规则

- 只允许使用已 vendored 的 `src/components/ui/` 组件（54 个原语，来自 @coss registry 的一次性拷贝）。
- **禁止** `pnpm add @coss/ui`——该 npm 包不存在（registry 404）。
- **禁止**再次从 registry 拉取组件，除非用户明确要求补原语。
- 颜色/圆角/间距只用 `src/app/globals.css` 的令牌（`:root`/`.dark` CSS 变量 → `@theme inline`）；禁止组件内写死 hex/oklch。
- 新组件样式参照 cal.com 克制风格：白底灰阶、黑主 CTA、8/12/16 间距节奏；详见 `docs/design-system.md`。
- 提供商图标一律两字母 monogram 文本，不引入品牌图标依赖。

## 架构规则

- 新增提供商适配器流程见 `docs/design-system.md` 末节与 `src/server/adapters/registry.ts`。
- SQLite 快照的 `windows` JSON 形状是前后端契约（`src/server/db/schema.ts` 注释），改动需同步前端。
- 凭证只存 AES-256-GCM 密文（`src/server/crypto.ts`），任何路径不得明文落库或写日志。