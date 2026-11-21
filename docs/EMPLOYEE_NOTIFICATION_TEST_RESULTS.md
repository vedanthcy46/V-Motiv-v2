# Employee notification system: test results

Run on 2026-11-21 against a real local PostgreSQL 16 (`vmotiv_v2_test`, isolated; the test files refuse any other database). No external provider was called.

## Commands

```bash
cd services/api
V2_TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:<port>/vmotiv_v2_test npx vitest run test/employee-notifications
V2_TEST_DATABASE_URL=… npx vitest run          # whole API suite
npx tsc --noEmit -p .                           # API typecheck (clean)
cd packages/ui && npx vitest run               # shared UI
cd apps/customer-mobile && npx vitest run      # mobile (includes inspector route/payload validation)
```

## Results

| Suite | Result |
|---|---|
| `employee-notifications-database` (routing, queues, fallback, dedupe, suspended, reassignment, outbox reliability, retry/DEAD, dedup window, privacy, push, critical, policy governance) | pass |
| `employee-notifications-api` (auth, own-inbox isolation, branch filter, read/ack don't change business records, authorise-open, preferences, devices, SSE, admin governance, Activity Monitor) | pass |
| `employee-notifications-escalation` (working-hours math, escalation once and recorded, no chasing finished work, night vs critical, detectors, worker cycle and restart) | pass |
| `employee-notifications-scenarios-database` (inspector push and job route; finance blocker reaches branch rental manager with only the safe reason; routine event has no push/email; critical + approval emails through the real outbox processor; email-off preference; provider failure retained for retry with safe error code; 120-event volume) | pass |
| Whole API suite | **622 passed, 4 failed** (see below) |
| `packages/ui` | 12 passed |
| `apps/customer-mobile` | 142 passed |
| API, Sales, Operations, Finance, Admin, mobile typecheck | clean, except mobile `expo-application` types (module not installed in the sandbox; pre-existing) |
| Sales / Admin portal production build | built |

### Failures that are not part of this work

- `test/customer.test.ts` (3 to 4 tests): the shared test database contains published listings from other runs, so "customer-scoped" counts differ.
- `test/inspection-database.test.ts`: `MISSING_REQUIRED_CHECK:ev_hybrid.charging_port`, an inspection template data issue unrelated to notifications.
- `apps/admin-portal` `api.test.ts` "returns the backend error contract without exposing a response body": pre-existing mismatch on `details` (fails identically without these changes).
- `quotation-response-database` can flake under full-suite parallel load; it passes on its own.

## Measured (local database, one worker, not a production benchmark)

- 120 events, each enqueued twice with the same dedup key → exactly 120 inbox items, zero duplicates; enqueue 0.36 s, enqueue plus processing 1.7 s (about 14 ms/event).
- Event with no worker running survives and is delivered once a worker starts; replays create no second inbox item; a failing event backs off and ends DEAD with the error kept.

## Not measured, not verified

- Real Expo push delivery and tap-to-open on a device (needs EAS project id, a physical device and Expo access).
- Real Resend delivery (needs the Resend key and a verified domain). The queue rows and the outbox processor are tested with a recording sender.
- Cloudflare cron firing, and SSE through the production edge.
- End-to-end browser clicks of the new web screens (built and typechecked, not exercised in a browser in this session).
