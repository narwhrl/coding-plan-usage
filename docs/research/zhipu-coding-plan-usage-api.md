# Zhipu / BigModel Coding Plan usage APIs

Research date: 2026-09-01.

Scope: official BigModel (`docs.bigmodel.cn`, `open.bigmodel.cn`) and Z.AI (`docs.z.ai`, `api.z.ai`) documentation, plus first-party plugin source that official docs point to. Product source in this repository was not inspected.

There is no existing research-note convention under `docs/` (only `docs/design-system.md`). This file is the specified fallback path.

## Answers

### (a) Can Coding Plan aggregate remaining/consumed quota be queried by API?

**Not as a documented public developer API.** Official Coding Plan docs tell users to inspect remaining/consumed credits in the **console** (“用量统计” / Usage Statistics) and token/tool counts in **财务-费用明细** / Charge Type. The published OpenAPI catalogs (`https://docs.bigmodel.cn/openapi/openapi.json`, `https://docs.z.ai/openapi.json`) list no account-level Coding Plan quota, billing, or usage-query path.

Official docs *do* document a **Claude Code plugin** (`glm-plan-usage`) that “query [your] current quota and usage statistics,” personal plan only. That plugin’s first-party script calls three **undocumented-in-OpenAPI** HTTPS GET routes under `/api/monitor/usage/`. Those routes are first-party implementation, not a published API contract.

| Surface | What it exposes | Official status |
| --- | --- | --- |
| Console 用量统计 | 5-hour and weekly credit remaining/consumed | Documented UI, not an API |
| Console 财务-费用明细 | Token counts by price type; MCP call counts | Documented UI, not an API |
| `GET /api/monitor/usage/quota/limit` | Quota percentages (script remaps `TOKENS_LIMIT` → “Token usage(5 Hour)”, `TIME_LIMIT` → “MCP usage(1 Month)”) | First-party plugin only; absent from OpenAPI and API reference |
| `GET /api/monitor/usage/model-usage` | Time-window model usage JSON | Same |
| `GET /api/monitor/usage/tool-usage` | Time-window tool usage JSON | Same |

### (b) Can per-request prompt / completion / total tokens be obtained?

**Yes, on ordinary model HTTP APIs.** Chat Completions responses include `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`, and `usage.prompt_tokens_details.cached_tokens`. Tokenizer `POST /paas/v4/tokenizer` returns prompt/image/video/total token counts for a supplied message list.

Coding Plan credits are **not** those token fields. Credits are computed from tokens and MCP calls with published multipliers, then capped by 5-hour and weekly limits. Per-request `usage` does not return remaining plan credits.

Whether Coding Plan gateway responses on `https://open.bigmodel.cn/api/coding/paas/v4` or `https://open.bigmodel.cn/api/anthropic` always include the same `usage` object is **not separately specified**. Claude compatibility docs show Anthropic Messages calls and do not redefine usage fields.

### (c) Is prompt text retrievable after the fact?

**No documented account API returns prior Coding Plan prompt text.** Chat Completions echo only the assistant `choices` and token `usage`, not a stored copy of the request. Agent “对话历史” is documented only for `slides_glm_agent`. File-content APIs are limited to batch files. Privacy policy describes collection of trial input for model playgrounds and user-driven deletion via console/tickets; it is not a retrieval API for Coding Plan prompts.

### (d) Authentication and endpoint examples (officially documented)

**Standard model API (pay-as-you-go / resource packs, not Coding Plan quota):**

```http
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

International counterpart: `https://api.z.ai/api/paas/v4/chat/completions` with `Authorization: Bearer ZAI_API_KEY`. JWT (HS256) from `id.secret` API keys is also documented for BigModel HTTP.

**Coding Plan inference base URLs** (quota applies only here, in supported tools):

| Protocol | Base URL |
| --- | --- |
| Anthropic Messages | `https://open.bigmodel.cn/api/anthropic` |
| OpenAI Chat Completions | `https://open.bigmodel.cn/api/coding/paas/v4` |
| OpenAI Responses | `https://open.bigmodel.cn/api/v1` |

Personal plan keys come from 个人编程套餐 > 套餐概览. Team keys come from 团队编程套餐 > 我的套餐 and are **not interchangeable** with other platform API keys.

**Official quota-query UX:** install `glm-plan-usage` and run `/glm-plan-usage:usage-query` inside Claude Code. Docs do **not** publish the HTTP paths.

**First-party plugin HTTP (not in API reference / OpenAPI):**

```http
GET https://open.bigmodel.cn/api/monitor/usage/model-usage?startTime=...&endTime=...
GET https://open.bigmodel.cn/api/monitor/usage/tool-usage?startTime=...&endTime=...
GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
Authorization: <ANTHROPIC_AUTH_TOKEN>
Accept-Language: en-US,en
Content-Type: application/json
```

Z.AI host: replace origin with `https://api.z.ai`. Token is the Claude Code `ANTHROPIC_AUTH_TOKEN` (Coding Plan key), sent as the raw `Authorization` header value (the script does not prepend `Bearer`).

### (e) Limitations and uncertainty

- Monitor routes are **unsupported public API**: missing from OpenAPI, HTTP guide, and Coding Plan pages. Auth header shape, response schema, stability, and team-plan support are only implied by plugin code. Official plugin docs say **personal plan only**.
- Calling Coding Plan endpoints outside “指定工具与产品环境” does **not** consume Coding Plan credits (standard API billing / error 1113 instead).
- Quota is **credits**, not raw tokens. Off-peak (outside Mon–Fri 14:00–18:00 UTC+8) model credit use is 50% of the base formula.
- Exhausted personal credits wait for the next 5-hour window; they do **not** fall through to cash/resource packs. Team seats can enable overage at 90% of list API price (limited-time, as documented).
- Image/video/search models on the general platform may be per-call, not token-billed; that is unrelated to Coding Plan credit math.
- Knowledge-base `GET /llm-application/open/knowledge/capacity` is knowledge storage usage, not Coding Plan quota.

## Coding Plan (subscription credits)

Primary docs:

- https://docs.bigmodel.cn/cn/coding-plan/overview
- https://docs.bigmodel.cn/cn/coding-plan/team
- https://docs.bigmodel.cn/cn/coding-plan/faq
- https://docs.bigmodel.cn/cn/coding-plan/usage-notes
- https://docs.bigmodel.cn/cn/coding-plan/quick-start
- https://docs.bigmodel.cn/cn/coding-plan/extension/usage-query-plugin
- https://docs.z.ai/devpack/overview
- https://docs.z.ai/devpack/extension/usage-query-plugin

Personal credit caps (overview):

| Plan | 5-hour credits | Weekly credits |
| --- | --- | --- |
| Lite | 2,000 | 10,000 |
| Pro | 12,000 | 60,000 |
| Max | 28,000 | 140,000 |

Team (team page): 标准版 15,000 / 66,000; 高级版 35,000 / 155,000.

Credit formula (same pages):

- Model credits = (input tokens × Input + cached input tokens × Cached Input + output tokens × Output) / 10,000
- MCP credits = call count × Output multiplier

GLM-5.3 multipliers: Input 6.9, Cached Input 1.7, Output 24. GLM-5.3-Flash: 2.3 / 0.56 / 8. Search / reader / zread MCP: Output 1.2.

## Ordinary model API token usage (distinct from Coding Plan)

- Chat Completions: https://docs.bigmodel.cn/api-reference/模型-api/对话补全.md and https://docs.z.ai/api-reference/llm/chat-completion.md
- HTTP + auth: https://docs.bigmodel.cn/cn/guide/develop/http/introduction.md and https://docs.z.ai/api-reference/introduction.md
- Tokenizer: https://docs.bigmodel.cn/api-reference/模型-api/文本分词器.md
- Token concepts: https://docs.bigmodel.cn/cn/guide/start/concept-param.md
- Platform fee FAQ (console 财务总览 / 费用账单, not REST): https://docs.bigmodel.cn/cn/faq/fee-issues
- OpenAPI 1.0.0: https://docs.bigmodel.cn/openapi/openapi.json — no billing/quota query paths

## First-party plugin source (quota HTTP)

Official docs link GitHub `zai-org/zai-coding-plugins`. Script:

https://raw.githubusercontent.com/zai-org/zai-coding-plugins/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs

It selects `open.bigmodel.cn` vs `api.z.ai` from `ANTHROPIC_BASE_URL`, then GETs the three `/api/monitor/usage/*` URLs above.

## Prompt retrieval

- Chat Completions response schema: `id`, `request_id`, `created`, `model`, `choices`, `usage` — no stored prompt replay.
- Agent conversation history: https://docs.bigmodel.cn/api-reference/agent-api/对话历史.md — `slides_glm_agent` only.
- Privacy: https://docs.bigmodel.cn/cn/terms/privacy-policy.md — playground input collection; deletion via 个人中心 / tickets, not a prompt-export API.

## Community VS Code plugin: separate historical tokens vs calls (not prompt text)

Inspected `sage-z-cn/vscode-glm-plan-usage-plugin` at default branch `master` revision [`e371f28`](https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/commit/e371f2833eb54c8b69d8c94c5acb712b66f72998) (package version `2.5.4`). Compared with official `zai-org/zai-coding-plugins` script at [`0446d0b`](https://github.com/zai-org/zai-coding-plugins/commit/0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254). Product source in this workspace was not used.

The sidebar treats **Tokens** (`词元`) and **Calls** (`调用`) as two independently server-supplied time series from the same `GET /api/monitor/usage/model-usage` body.

**Key distinction:** production `modelCallCount` / `totalUsage.totalModelCallCount` is the **server’s model-call count** for the window (API invocations), **not** a count of human prompts or prompt *text*. The plugin never reconstructs prompts and never splits `prompt_tokens` / `completion_tokens` on this path. The only place calls are computed from tokens is **mock-only** `tokensToCallCounts` in `src/mock-data.ts` (`Math.floor(tokens / 25000)` when `GLM_USE_MOCK=true`). Live `processTrendData` copies `tokensUsage` and `modelCallCount` independently.

### HTTP, auth, unwrap

`UsageQueryService.queryUsage` (`src/usageQuery.ts`) builds `{protocol}//{host}` from `glmPlanUsage.baseUrl` (`ConfigManager.getBaseUrl`). Hosts: `api.z.ai` → platform `ZAI`; `open.bigmodel.cn` or `dev.bigmodel.cn` → `ZHIPU`.

| Call | URL | Query |
| --- | --- | --- |
| 7-day model usage | `{origin}/api/monitor/usage/model-usage` | `startTime`, `endTime` from `getTimeWindow` |
| 30-day model usage | same | `get30DayTimeWindow` |
| tools | `{origin}/api/monitor/usage/tool-usage` | 7-day window |
| quota | `{origin}/api/monitor/usage/quota/limit` | none |

`httpsGet` sends `Authorization: <token>` with **no** `Bearer` prefix, plus `Accept-Language: en-US,en` and `Content-Type: application/json` — same header shape as the official script. Token comes from VS Code `SecretStorage` key `glmPlanUsage.authToken`, not `ANTHROPIC_AUTH_TOKEN`. Body unwrap: `JSON.parse` then `json.data || json`.

Permalinks: [usageQuery.ts L173–191, L241–248, L327–387](https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/usageQuery.ts#L173-L387), [config.ts L12–26](https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/config.ts#L12-L26), [official query-usage.mjs L40–61, L114–124](https://github.com/zai-org/zai-coding-plugins/blob/0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs#L40-L124).

### Server fields (history)

Captured sample `.docs/model-usage.json` (`data` keys): `x_time`, `modelCallCount`, `tokensUsage`, `totalUsage` (`totalModelCallCount`, `totalTokensUsage`, `modelSummaryList`), `modelDataList[]` (`modelName`, `sortOrder`, `tokensUsage`, `totalTokens`), `modelSummaryList`, `granularity: "hourly"`. **No** `modelUsage` array and **no** per-model `modelCallCount` / `callCount` in that sample.

`processTrendData` maps:

- `x_time` → `TrendData.xTime`
- `tokensUsage` → `yValue` (tokens)
- `modelCallCount` → `modelCallCount` (server model-call series; UI label **Calls** / 调用 — not human prompt count)
- `modelDataList[].modelName` → `model`; `.tokensUsage` → `yValue`; `.modelCallCount || .callCount` → `callCount`
- `totalUsage` passed through, default `{ totalModelCallCount: 0, totalTokensUsage: 0 }`

Types: `src/types.ts` `TrendData`, `ModelTrendData`. `ModelUsageData` (`inputTokens`, `outputTokens`, `totalTokens`, `requestCount`) is filled from `modelUsageRaw?.modelUsage || modelUsageRaw` but **no TypeScript consumer** reads `response.modelUsage` after `queryUsage`.

### Date / range logic (local `Date`, not UTC)

`formatDateTime` → `yyyy-MM-dd HH:mm:ss`.

- `getTimeWindow`: start = today − 6 days `00:00:00.000`; end = today `23:59:59.999` (7 local calendar days).
- `get30DayTimeWindow`: start = today − 29 days `00:00:00.000`; end = today `23:59:59.999`.

Official script window is **different**: yesterday at current hour `HH:00:00` through today at current hour `HH:59:59` (~25 hours), one `model-usage` GET, dump JSON, no charts.

Today filter (`filterTodayData` / `filterTodayDataByModel`): keep buckets whose `x_time` **starts with** local `YYYY-MM-DD`.

Daily rollup (`aggregateDailyData` / `aggregateDailyCalls`): `dateKey = x_time.split(' ')[0]`; sum non-null `yValue` (tokens) or `modelCallCount` (calls). Display date: `MM-DD` plus weekday.

`transformResponse` comment: 7-day chart prefers `monthTrend` (30-day GET) because `trend` is treated as hourly / “today-only”; then `dailyData.slice(-7)`. 30-day chart uses full `monthTrend` daily sums. Fallback if no `monthTrend`: reuse the 7-day source for the month object (tokens only; `totalCalls` omitted).

UI range toggle: `Last 7 Days` / `Last 30 Days` (`last7Days` / `last30Days`), persisted as `glmPlanUsage.dayRange` (`SidebarProvider`).

### Formulas (client aggregation only)

Let `T_i` = `tokensUsage[i]`, `C_i` = `modelCallCount[i]`.

- Today tokens = sum of `T_i` for local today; today calls = sum of `C_i` for the same buckets.
- Day `d` tokens = sum of `T_i` with date prefix `d`; day `d` calls = sum of `C_i` for the same prefix.
- Week totals = sum of last 7 daily tokens / calls; month totals = sum of all daily series from the 30-day response.
- Peak hour: max `T_i` / max `C_i` on today’s slice (`getPeakToken` / `getPeakCalls`). Strings like `Peak {formatted}@HH:mm` are built in `dataTransformer` but **not bound** in `htmlTemplate.ts`.
- Display format (`formatTokens`): `>= 1e6` → `{n/1e6:.2f}M`; `>= 1e3` → `{n/1e3:.1f}K`; else integer.

`parseActiveDaysInfo`: unique dates in `x_time` vs dates with `T_i > 0`. Returned as `activeDaysInfo`; **unused in UI**.

`totalUsage.totalTokensUsage` / `totalModelCallCount` are **not** what the sidebar totals display; those totals are the sums above.

### UI labels

Sidebar (`htmlTemplate` + `transformResponse` locales):

- Section: **Today Usage** / 今日用量 — stats **Tokens** / 词元 and **Calls** / 调用; metric radios `data-value="tokens"|"calls"`; chart type Bar / Line.
- Section: **Daily Usage** / 每日用量 — radios **Last 7 Days** / **Last 30 Days**; same Tokens / Calls toggle; footer `Tokens: {total}` and `Calls: {totalCalls}`.
- Charts: `initTodayChart` / `initWeekChart` plot `yValue`/`tokens` or `callCount`/`calls`. If `models.length > 1` but per-model call series is empty, **calls** falls back to the aggregate `modelCallCount` series (comment in `htmlTemplate`).

Quota bars (same query, not history): first `limits[]` with `type === 'TOKENS_LIMIT'` → `Token usage(5 Hour)` / label **5 Hour Quota**; second `TOKENS_LIMIT` → `Token usage(Weekly)` / **Weekly Quota** (`percentage` from server). Official script remaps **every** `TOKENS_LIMIT` to `Token usage(5 Hour)` only. `TIME_LIMIT` → **MCP Monthly Usage** (shown only if `currentUsage > 0`). Status bar: `GLM: {5h}% | {weekly}%` from those percentages, not historical tokens/calls.

### Official vs community

| Behavior | zai-org `query-usage.mjs` | sage-z-cn VS Code plugin |
| --- | --- | --- |
| Endpoints | same three paths | same + **second** `model-usage` (30 days) |
| Auth header | raw `ANTHROPIC_AUTH_TOKEN` | raw SecretStorage token |
| History window | ~25h around “now” | 7 local days and 30 local days |
| Tokens vs calls | printed as raw JSON | separate series + toggle; local daily sums |
| Weekly quota remap | no (all `TOKENS_LIMIT` → 5h) | second `TOKENS_LIMIT` → weekly |

### Limitations

- Monitor APIs remain unofficial (see above).
- `ModelUsageData` / `activeDaysInfo` / peak strings / `totalUsage` window totals are unused or unused-in-UI.
- Sample `modelDataList` lacks per-model call arrays; Calls-by-model depends on `modelCallCount`/`callCount` if the live API sends them (`processTrendData`).
- Time windows use the **local** clock, not a documented server timezone.
- `httpsGet` accepts any 200 JSON; schema is inferred from plugin + `.docs/model-usage.json` / `.docs/limit.json`, not OpenAPI.

Permalink index:

- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/usageQuery.ts
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/types.ts
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/sidebar/dataTransformer.ts
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/statusBar/tooltipBuilder.ts
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/sidebar/htmlTemplate.ts
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/.docs/model-usage.json
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/.docs/limit.json
- https://github.com/sage-z-cn/vscode-glm-plan-usage-plugin/blob/e371f2833eb54c8b69d8c94c5acb712b66f72998/src/mock-data.ts
- https://github.com/zai-org/zai-coding-plugins/blob/0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs
