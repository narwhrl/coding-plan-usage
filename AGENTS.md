<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Project constraints — coding-plan-usage

## UI rules

- Use only the vendored components in `src/components/ui/` (54 primitives, a one-time copy from the @coss registry).
- **Never** `pnpm add @coss/ui` — that npm package does not exist (registry 404).
- **Never** pull components from the registry again, unless the user explicitly asks to add a primitive.
- Colors/radii/spacing come only from the tokens in `src/app/globals.css` (`:root`/`.dark` CSS variables → `@theme inline`); no hardcoded hex/oklch inside components.
- Style new components after cal.com's restrained look: white background with gray scale, black primary CTA, 8/12/16 spacing rhythm; see `docs/design-system.md`.
- Builtin provider icons are vendored monochrome SVGs keyed by adapter id (`src/lib/provider-icons.ts`); custom providers fall back to a two-letter monogram. Do not add brand-icon npm packages.

## Architecture rules

- The flow for adding a provider adapter lives in the last section of `docs/design-system.md` and in `src/server/adapters/registry.ts`.
- The `windows` JSON shape of SQLite snapshots is a front/back-end contract (see the comment in `src/server/db/schema.ts`); any change must be synced with the frontend.
- Credentials are stored only as AES-256-GCM ciphertext (`src/server/crypto.ts`); no code path may persist or log them in plaintext.
