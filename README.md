# coding-plan-usage

单用户 self-host 的 LLM coding-plan 订阅配额/用量面板：定时通过各家 API 采集配额，SQLite 快照全量入库，展示趋势。GLM / DeepSeek / Codex / Claude / Cursor / Kimi / MiniMax / Grok / Copilot / OpenRouter 十家内置，任意 REST JSON 端点可经声明式 spec 接入。

- 单用户，无注册体系；内置访问口令（`ACCESS_PASSWORD`）
- 凭证 AES-256-GCM 加密入库（`APP_ENCRYPTION_KEY`）
- 60s tick 调度，账户级间隔（默认 15 分钟），连续 3 次失败退避 6h
- 各家原生单位（tokens/credits/请求/货币）+ 统一剩余百分比；不折算 USD
- 余量低于阈值（全局默认 20%，可账户覆盖）红色预警
- 中英双语（cookie `cpu_lang`），明暗主题
- Docker 单容器部署，SQLite 文件卷挂载

## 快速开始（Docker Compose）

```bash
cp .env.example .env
# 编辑 .env：设置 APP_ENCRYPTION_KEY（必填）、ACCESS_PASSWORD（可选）
docker compose up --build -d
# 打开 http://localhost:3000
```

数据落在 `./data/app.db`（卷挂载），重启不丢。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_PASSWORD` | 否 | 访问口令；不设置则免认证 |
| `APP_ENCRYPTION_KEY` | 是 | 凭证加密主密钥（任意非空字符串，scrypt 派生）；设置后勿更换 |
| `SQLITE_PATH` | 否 | SQLite 路径，默认 `./data/app.db`（容器内 `/data/app.db`） |
| `TZ` | 否 | 时区（GLM 查询窗口按服务器本地时间构造） |

## 各家凭证获取（一句话）

| 提供商 | 凭证 | 获取方式 |
|---|---|---|
| GLM Coding Plan | API Key | [Z.ai](https://z.ai) / [智谱开放平台](https://open.bigmodel.cn) 控制台 |
| DeepSeek | API Key | [平台](https://platform.deepseek.com) → API Keys |
| Codex / ChatGPT | auth.json | 本机 `~/.codex/auth.json` 全文粘贴；面板自动刷新 token |
| Claude | .credentials.json | 本机 `~/.claude/.credentials.json` 全文粘贴；面板自动刷新 token |
| Cursor | Session Cookie | 浏览器 Cookie 中的 `WorkosCursorSessionToken` 值 |
| Kimi Coding | API Key | [Kimi](https://www.kimi.com) Coding API Key |
| MiniMax | API Key | [MiniMax 开放平台](https://www.minimax.io) Token Plan Key |
| Grok | auth.json | 本机 `~/.grok/auth.json` 全文粘贴（或其中 `key` 字段值） |
| GitHub Copilot | OAuth/PAT Token | 带 Copilot 权限的 GitHub token |
| OpenRouter | API Key | [OpenRouter](https://openrouter.ai/keys) → Create Key |

非官方端点（Codex/Claude/Cursor/Grok/Copilot）可能随上游变动失效：失败会以红色 error 态呈现在卡片上，最后一次成功数据保留展示，修复凭证或等待上游恢复即可。

## 自定义提供商（声明式）

设置 → 自定义提供商：填 Base URL、路径、认证方式（Bearer 或自定义 Header）、dot-path 字段映射（`data.limits.0.remaining` 支持数组下标）、可选除数与单位；填 API Key 后可先「测试」再创建。无脚本执行，纯声明式。

## 本地开发

```bash
pnpm install
ACCESS_PASSWORD=test APP_ENCRYPTION_KEY=dev pnpm dev
```

测试：`pnpm vitest run`；构建：`pnpm build`。

## 技术栈

Next.js 16（App Router，standalone）· React 19 · Tailwind v4 · coss ui（vendored，`src/components/ui`）· Drizzle ORM + better-sqlite3 · next-intl · next-themes · recharts · zod。UI 规范见 `docs/design-system.md` 与 `AGENTS.md`。
