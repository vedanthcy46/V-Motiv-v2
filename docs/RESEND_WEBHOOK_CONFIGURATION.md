# V MOTIV V2 — Resend Webhook Configuration

## 1. Webhook Endpoint
The API server exposes an idempotent webhook listener at:
```
POST https://api.vmotiv.in/api/v2/webhooks/resend
```

---

## 2. Event Types Handled

The webhook handles four critical lifecycle events:

1. `email.sent`: Provider accepted the message into transmission queues.
2. `email.delivered`: Recipient mail exchanger confirmed delivery into inbox. Updates `EmailOutbox.state = 'ACCEPTED'`.
3. `email.bounced`: Hard bounce or invalid mailbox. Updates `EmailOutbox.state = 'FAILED'` and sets `lastErrorCode = 'RESEND_BOUNCED'`.
4. `email.complained`: Recipient marked message as spam. Updates `EmailOutbox.state = 'FAILED'` and sets `lastErrorCode = 'RESEND_COMPLAINED'`.

---

## 3. Idempotent Deduplication

Every incoming webhook event is tracked in PostgreSQL via `ResendWebhookEvent`:
- Unique key: `eventId` (from Resend `data.id` or root `id`).
- If an event is re-delivered by Resend, it is safely acknowledged with HTTP 200 without executing duplicate database mutations.

---

## 4. Setup in Resend Dashboard

1. Navigate to **Resend Dashboard -> Webhooks**.
2. Click **Add Webhook**.
3. **Endpoint URL**: `https://api.vmotiv.in/api/v2/webhooks/resend`
4. **Events to Send**:
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
5. Save webhook.
