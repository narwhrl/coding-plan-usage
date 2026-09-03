# DeepSeek official API (not a Coding Plan)

Research date: 2026-09-03.

Scope: official DeepSeek API documentation (`api-docs.deepseek.com`, Chinese counterpart `api-docs.deepseek.com/zh-cn`). Product source in this repository was inspected after the notes below.

DeepSeek does **not** sell a Coding Plan (no 5-hour / weekly credit windows, no plan quota, no reset cadence). The platform is a prepaid, pay-as-you-go model API: tokens are billed against account balance.

## Answers

### (a) Is there a Coding Plan quota API?

**No.** Official docs have no Coding Plan product, no `/api/monitor/usage/*` analogue, and no remaining-percent / reset-window fields.

The only documented account-level billing endpoint is:

```http
GET https://api.deepseek.com/user/balance
Authorization: Bearer $DEEPSEEK_API_KEY
```

Docs: https://api-docs.deepseek.com/api/get-user-balance/ and https://api-docs.deepseek.com/zh-cn/api/get-user-balance

Response (official example):

```json
{
  "is_available": true,
  "balance_infos": [
    {
      "currency": "CNY",
      "total_balance": "110.00",
      "granted_balance": "10.00",
      "topped_up_balance": "100.00"
    }
  ]
}
```

| Field | Official meaning |
| --- | --- |
| `is_available` | Whether the balance is sufficient for API calls |
| `currency` | `CNY` or `USD` |
| `total_balance` | Total available = granted + topped-up (JSON **string**) |
| `granted_balance` | Not-expired granted / complimentary balance (string) |
| `topped_up_balance` | Manually topped-up balance (string) |

There is **no** documented remaining percentage, plan total, or `resetAt`. Inventing `remainingPct: 100` from `remaining === total === amount` is incorrect: the current prepaid pot is not a coding-plan quota.

### (b) Can aggregate usage / spend history be queried?

**No documented account API.** Official catalogs list:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/user/balance` | Prepaid balance + availability |
| `GET` | `/models` | Available model ids |
| `POST` | `/chat/completions` | Inference (OpenAI-compatible) |
| `POST` | `/completions` | FIM beta (`base_url=https://api.deepseek.com/beta`) |
| Anthropic | `https://api.deepseek.com/anthropic` | Messages-compatible inference |

Per-request token counts appear only on the inference response `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`, cache hit/miss, `reasoning_tokens`). Those are not an account usage history API. Community tools that show “today / 7-day usage” replay **local** session logs.

### (c) How is the API billed?

https://api-docs.deepseek.com/quick_start/pricing/

- Expense = tokens × published price (per 1M tokens). Peak hours (UTC Mon–Fri 01:00–04:00 and 06:00–10:00) are 2× off-peak.
- Deduction: granted balance first, then topped-up balance.
- Models (as of research date): `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp`.
- Concurrency limits (account-level, not a consumable quota): Pro 500 / Flash 2500 / Vision 2500. Over limit → HTTP 429. https://api-docs.deepseek.com/quick_start/rate_limit

HTTP 402 = insufficient balance (top up on the platform). Do not treat 402 as a retryable inference error.

### (d) Authentication

Bearer API key from https://platform.deepseek.com → API Keys. Same key for balance and inference. Base URL `https://api.deepseek.com` (OpenAI format).

## Implication for this dashboard

This panel can honestly show **prepaid balance composition** and **availability**, and can chart **remaining amount over time** from our own snapshots. It must not:

- emit fake 5h / weekly / monthly coding-plan windows
- set `remainingPct` (there is no official plan total)
- treat DeepSeek as a GLM / MiniMax / Kimi-style Coding Plan
