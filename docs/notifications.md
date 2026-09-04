# Notifications (webhook)

Outbound alerts are a single generic webhook: the app POSTs JSON to a URL you own, and you fan it out
from there (n8n, Bark, a Slack/Discord incoming hook, your own script). There are no built-in IM or
email templates on purpose — one contract is easier to keep working than five vendor formats.

Configure it under **Settings → General → Notifications**. The URL and the signing secret are stored
as a single AES-256-GCM blob (same key as provider credentials, `APP_ENCRYPTION_KEY`); the API only
ever returns the host and whether a secret is set, so both inputs behave like the credential fields
in the account editor: leave them blank to keep the current value.

## When it fires

Each poll is collapsed into one of three levels:

- `error` — the poll failed (HTTP error, bad credentials, undecryptable credentials).
- `low` — some non-minor window is below the warn threshold, or the provider reports the balance as
  unusable (`isAvailable: false`, e.g. DeepSeek). This matches the yellow badge in the UI exactly.
- `ok` — everything else.

Delivery happens on level **transitions**, not on every poll. At a 15-minute interval, notifying on
every poll would be a firehose.

| Transition | Event |
| --- | --- |
| `ok`/`error`/first-ever → `low` | `quota_low` |
| `ok`/`low`/first-ever → `error` | `poll_error` |
| `low`/`error` → `ok` | `quota_recovered` |
| first-ever → `ok` | *nothing* |
| same abnormal level, repeated | re-sent once the minimum repeat interval has elapsed |
| same `ok` level, repeated | *nothing* |

Two extra guards:

- `poll_error` waits for the **second** consecutive failure, so a single 5xx blip stays quiet.
- The minimum repeat interval (default 6 h) is measured from the last *successful* delivery, so a
  failed webhook is retried on the next poll rather than being suppressed.

Each event type can be switched off independently. Manual refreshes go through the same path — a
state change is a state change.

## Request

```
POST <your url>
content-type: application/json
x-cpu-event: quota_low
x-cpu-signature: sha256=<hex>   # only when a secret is configured
```

Timeout is 10 seconds. Delivery failures are logged as `[notify] delivery failed: <status>` and never
affect polling; the URL, the secret and the payload are never logged.

## Payload

```json
{
  "version": 1,
  "event": "quota_low",
  "firedAt": "2026-09-04T05:00:00.000Z",
  "account": {
    "id": "3f1c…",
    "label": "work",
    "providerId": "glm",
    "providerName": "GLM"
  },
  "level": "low",
  "previousLevel": "ok",
  "threshold": 20,
  "window": {
    "kind": "weekly",
    "label": null,
    "remainingPct": 12.5,
    "remaining": 1250,
    "total": 10000,
    "unit": "tokens",
    "resetAt": "2026-09-08T00:00:00.000Z"
  },
  "error": null,
  "consecutiveFailures": 0
}
```

- `event` — `quota_low` | `quota_recovered` | `poll_error` | `test`
- `level` / `previousLevel` — `ok` | `low` | `error`; `previousLevel` is `null` on the first ever
  evaluation of an account.
- `threshold` — the effective warn percentage for that account (per-account value, else the global one).
- `window` — the tightest non-minor percentage window of the snapshot, or `null` for `poll_error`.
- `error` — the (already truncated) error text, only for `poll_error`.
- `account` is `null` for `test` events.

`version` is bumped only on breaking changes to this shape.

## Verifying the signature

Sign the **raw request body**, not a re-serialized copy of the parsed JSON.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, header, secret) {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```bash
# reproduce the header from a captured body
printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex
```

## Wiring it up

- **n8n / Node-RED** — point the URL at a Webhook node and branch on `event`. This is the path to
  take if you want Telegram, Feishu, WeCom or email: the fan-out lives in your automation tool.
- **Bark / ntfy** — these expect their own body shape, so put a one-line transform in front rather
  than pointing the URL straight at them.
- **Slack / Discord** — the incoming-webhook URL already embeds a token, which is exactly why the URL
  is stored encrypted and only its host is echoed back to the UI.
- **Local testing** — `Send test` posts a `test` event using the saved configuration (it works while
  the switch is off, so you can verify connectivity before enabling). Only `http` and `https` URLs
  are accepted.
