# coding-plan-usage

Single-user, self-hosted quota/usage dashboard for LLM coding-plan subscriptions (and a few prepaid API balances): a scheduler collects quotas from each provider's API on an interval, stores full snapshots in SQLite, and charts the trend. Ten providers built in — GLM / DeepSeek API / Codex / Claude / Cursor / Kimi / MiniMax / Grok / Copilot / OpenRouter — and any REST JSON endpoint can be added via a declarative spec.

- Single user, no registration; built-in access password (`ACCESS_PASSWORD`)
- Credentials encrypted at rest with AES-256-GCM (`APP_ENCRYPTION_KEY`)
- 60s tick scheduler, per-account interval (default 15 min), 6h backoff after 3 consecutive failures
- Each provider's native units (tokens/credits/requests/currency) plus a unified remaining percentage; no USD conversion
- Red warning when remaining falls below a threshold (20% global default, overridable per account)
- Bilingual (zh/EN, `cpu_lang` cookie), light/dark theme
- Single-container Docker deployment, SQLite file on a mounted volume
- Optional per-account HTTP / HTTPS / SOCKS5 proxy for collection requests (password stored encrypted)

## Quick start (Docker Compose)

```bash
cp .env.example .env
# Edit .env: set APP_ENCRYPTION_KEY (required), ACCESS_PASSWORD (optional)
docker compose up --build -d
# Open http://localhost:3000
```

Data lives in `./data/app.db` (mounted volume) and survives restarts.

### Pull a published image (GHCR)

Pushes to `main`/`master` (and `v*` tags) build `ghcr.io/<owner>/<repo>` via GitHub Actions. First-time on a public repo: GitHub → Packages → this image → Package settings → Change visibility → Public.

```bash
# public image
docker pull ghcr.io/<owner>/coding-plan-usage:latest

# private image
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

In `docker-compose.yml`, set `image: ghcr.io/<owner>/coding-plan-usage:latest` and drop `build: .` if you only want to pull.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ACCESS_PASSWORD` | No | Access password; unset means no auth |
| `APP_ENCRYPTION_KEY` | Yes | Master key for credential encryption (any non-empty string, scrypt-derived); once set, never change it |
| `SQLITE_PATH` | No | SQLite path, default `./data/app.db` (`/data/app.db` inside the container) |
| `TZ` | No | Timezone (GLM query windows are built from server local time) |

## Getting credentials (one line each)

| Provider | Credential | How to get it |
|---|---|---|
| GLM Coding Plan | API Key | [Z.ai](https://z.ai) / [Zhipu Open Platform](https://open.bigmodel.cn) console |
| DeepSeek API | API Key | Prepaid platform balance (not a coding-plan quota). [Platform](https://platform.deepseek.com) → API Keys |
| Codex / ChatGPT | auth.json | Paste the full contents of your local `~/.codex/auth.json`; the panel refreshes the token automatically |
| Claude | .credentials.json | Paste the full contents of your local `~/.claude/.credentials.json`; the panel refreshes the token automatically |
| Cursor | Session Cookie | The `WorkosCursorSessionToken` value from your browser cookies |
| Kimi Coding | API Key | Coding API Key from [Kimi](https://www.kimi.com) |
| MiniMax | API Key | Token Plan key from the [MiniMax open platform](https://www.minimax.io) |
| Grok | auth.json | Paste the full contents of your local `~/.grok/auth.json` (or just its `key` field) |
| GitHub Copilot | OAuth/PAT Token | A GitHub token with Copilot entitlements |
| OpenRouter | API Key | [OpenRouter](https://openrouter.ai/keys) → Create Key |

Unofficial endpoints (Codex/Claude/Cursor/Grok/Copilot) may break as upstreams change: failures surface as a red error state on the card, the last successful data stays visible — fix the credential or wait for upstream to recover.

## Account proxy

Each account can optionally send its collection requests through an HTTP, HTTPS, or SOCKS5 proxy. Set it on add/edit:

```
http://127.0.0.1:7890
https://user:pass@proxy.example:8443
socks5://127.0.0.1:1080
```

`socks5h://` is accepted and treated as SOCKS5 (DNS is resolved by the proxy). The password is encrypted with `APP_ENCRYPTION_KEY` and never returned by the API; saving the same host/user again keeps the stored password.

## Custom providers (declarative)

Settings → Custom providers: enter a Base URL, path, auth method (Bearer or a custom header), dot-path field mappings (`data.limits.0.remaining` supports array indices), and an optional divisor and unit; with an API key filled in you can "Test" before creating. No script execution — purely declarative.

## Local development

```bash
pnpm install
ACCESS_PASSWORD=test APP_ENCRYPTION_KEY=dev pnpm dev
```

Tests: `pnpm vitest run`; build: `pnpm build`.

## Tech stack

Next.js 16 (App Router, standalone) · React 19 · Tailwind v4 · coss ui (vendored, `src/components/ui`) · Drizzle ORM + better-sqlite3 · next-intl · next-themes · recharts · zod. UI conventions: see `docs/design-system.md` and `AGENTS.md`.
