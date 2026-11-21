# Employee notification delivery

## Channels

| Channel | Mechanism | When |
|---|---|---|
| In-app | `Notification` row (always) + live SSE stream (`/employees/me/notifications/stream`, fetch-reader with auth header, ~5 s poll server-side, reconnect with backoff) and REST polling every 45 s as fallback | every event |
| Push | `PushTicket` rows drained by the existing Expo worker to the employee's active `PushDevice`s | severity ≠ INFORMATIONAL and the event lists PUSH, push preference on, not in quiet hours (critical ignores quiet hours) |
| Email | `EmailOutbox` row (unique key `emp-notif/<notificationId>`), sent by the existing Resend worker | the event lists EMAIL and email preference is on; critical ignores quiet hours |
| Daily digest | one `EmailOutbox` row per person per day (08:00 IST) listing the titles of their unread items (module and critical flag only, no record details) | digest preference DAILY |

Web push (browser) is **not implemented**.

## Preferences (`/employees/me/notification-preferences`)

Push, email, in-app toggles; quiet hours (start/end); digest OFF/DAILY; muted modules. Muting applies to informational alerts only: critical alerts and work that needs action cannot be muted.

## Devices

`POST /employees/me/notification-devices` registers an Expo token (validated format, platform `android|ios|web`). A changed token replaces the old one; a token used earlier by another employee is released from them; suspension/deactivation releases all of a person's devices; the Inspector app releases its device on sign-out.

## Mobile deep link

A push tap (foreground, background or cold start) reads `{notificationId}` only, calls `GET /employees/me/notifications/:id/open`, and the server answers `allowed: true` with the validated route or a refusal reason (`NO_LONGER_EMPLOYED`, `NO_LONGER_AUTHORISED`, `REASSIGNED`, `RESOLVED`, `EXPIRED`, `NO_LINK`). The app only opens `/inspections/:id` and `/reviews/:id` and shows a plain message for anything else. A handled push is not opened twice.

## What has and has not been verified

Verified in automated tests: queue rows for push and email, payload minimality, preference and quiet-hour rules, idempotent email rows, the real email outbox processor with a recording sender (success, and provider failure → retry with a safe error code and no secret in the row).

**Not verified (no network access to the providers from the build sandbox):** a real Expo push reaching a phone, a real Resend email being delivered, Cloudflare cron firing in production, the SSE stream behind a real serverless edge (long-lived responses may be cut; the client then falls back to polling). Treat these as "to verify after deploy".
