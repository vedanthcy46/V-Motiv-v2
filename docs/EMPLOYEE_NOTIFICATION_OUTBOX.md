# Employee notification outbox

Table `DomainOutboxEvent`. One row per business event that may notify staff.

## Writing

`enqueueDomainEvent(dbOrTx, { eventType, aggregateId, branchId, actorId, assigneeUserIds, excludeUserIds, payload, dedupKey })`

- Pass the business transaction client so the event commits or rolls back with the change.
- `dedupKey` (explicit) or the catalog's `dedupWindowMinutes` (derived from event type + record) makes repeats collapse into one event. A repeat inside the window is not an error; it returns the existing event.
- The legacy `dispatchDomainEvent` has a shim: catalog events addressed to employees go to the outbox; customer events keep the old path.

## Claiming and processing

- `claimOutboxBatch` uses `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, sets `lockedBy`, `leaseUntil` (60 s) and increments `attempts`. Two workers never take the same row.
- A worker that crashes mid-event leaves `PROCESSING` with an expired lease; the row becomes claimable again. Inbox rows are unique per `(eventId, userId)`, so a re-run never creates a duplicate.
- Success: `PROCESSED` with the routing decision (who and why) stored on the event for audit.
- Failure: `FAILED`, `nextAttemptAt = now + min(30 s × 2^(attempt-1), 1 h)`. After `maxAttempts` the row is `DEAD`: it stays in the table, is counted in `GET /admin/notification-health`, and is never silently dropped.

## Running the worker

`runNotificationCycle` (outbox drain, then every 5 minutes the detectors and escalations, and the 08:00 IST digest) is invoked by:

| Where | How |
|---|---|
| Node host (`server.ts`/`worker.ts`) | in the worker loop |
| Cloudflare Worker | cron trigger `* * * * *` → `scheduled` → internal `POST /api/v2/internal/notifications/run` with header `x-cron-secret` |
| Any scheduler | the same HTTP endpoint |

**Required in each real environment:** apply the migration, and set `CRON_SECRET` (Worker secret / env). Without a running cycle events stay `PENDING` (visible in health) but nothing is lost.

## Tested

Event survives with no worker; replay and duplicate enqueue give one inbox item; failing event backs off and ends DEAD; dedup window; transaction rollback leaves nothing; mid-cycle worker restart loses nothing; 120 events (each enqueued twice) → exactly 120 inbox items in ~1.7 s on a local database.
