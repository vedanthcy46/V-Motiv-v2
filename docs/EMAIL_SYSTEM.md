# Resend email foundation

Welcome email v1 is a plain-text transactional message stored alongside user creation in PostgreSQL.
Email credentials and sending execute only in the API worker. No browser can submit arbitrary recipients, template text or send commands.
EMAIL_DELIVERY_ENABLED=false is the default. Worker startup fails if delivery is disabled or unconfigured.

## Configure
Verify an approved sending domain in Resend. Set RESEND_API_KEY and EMAIL_FROM in services/api/.env.
The proposed notifications@vmotiv.in sender is not assumed to exist or be verified.
No DNS changes or live sends were made.
Enable delivery explicitly only after verification and run npm run email:worker.

## Reliability
PostgreSQL FOR UPDATE SKIP LOCKED leases one event at a time. Sender and message content freeze at first attempt.
Retries use the same eventKey as Resend's idempotency key. Attempts use exponential backoff and stop after six attempts.
Ambiguous attempts older than 23 hours enter REVIEW_REQUIRED, within Resend's documented 24-hour idempotency window.
This avoids silently resending an old uncertain event after provider deduplication expires.
ACCEPTED records provider API acceptance, not delivery to the recipient.
Failures retain safe error codes. Raw provider errors and recipient payloads are not logged.
Business registration commits independently of subsequent provider availability.

## Remaining email work
Signed webhook ingestion, deduplicated delivery/bounce/complaint history, suppression synchronization, operational templates and staff invitations are pending.
Marketing campaigns, consent history and unsubscribe/preferences endpoints are not implemented. New accounts default to marketingConsent=false. Transactional events currently include welcome, selling-request receipt, test-drive-request receipt, purchase-enquiry receipt and support-case receipt; an event receipt never promises operational approval or confirmation.
Do not run promotional sends until consent, suppression and unsubscribe acceptance tests exist.
Test sender injection is confined to automated tests; there is no production test-auth or test-email bypass.

Official references:
https://resend.com/docs/dashboard/emails/idempotency-keys
https://resend.com/changelog/managing-webhooks-via-api

