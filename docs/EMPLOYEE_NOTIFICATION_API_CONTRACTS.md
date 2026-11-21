# Employee notification API contracts

Base `/api/v2`. All routes need a verified Firebase token for an **active employee**; the employee is taken from the token, never from the request. Errors use `{ code }` with the HTTP status.

## My inbox: `/employees/me`

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Query: `module, severity, unread, actionRequired, branchId, from, to, cursor, limit(≤50)`. Returns `{ items, nextCursor, unreadCount, actionRequiredCount, branches }`. Another branch's `branchId` → 403 `BRANCH_NOT_AUTHORISED` |
| GET | `/notifications/unread-count` | `{ count, actionRequired, critical }`, optional `module` |
| POST | `/notifications/read-all` | Body `{ module? }` |
| PATCH | `/notifications/:id/read` | Own notification only; someone else's → 404 |
| POST | `/notifications/:id/acknowledge` | Changes the inbox row only |
| GET | `/notifications/:id/open` | `{ allowed: true, actionRoute }` or `{ allowed: false, reason }`; re-checks employment, assignment, branch, resolved/superseded/expired |
| GET | `/notifications/stream` | Server-Sent Events: `ready`, `notification`, `end` (`NOT_AUTHORISED` or `RECONNECT`); comment keep-alives; re-checks employment each tick |
| GET/PATCH | `/notification-preferences` (alias `/notifications/preferences`) | `pushEnabled, emailEnabled, inAppEnabled, quietHoursEnabled, quietHoursStart, quietHoursEnd, digestFrequency (OFF/DAILY), mutedModules` |
| POST | `/notification-devices` | `{ token, app, platform: android|ios|web, installationId?, projectId? }` → 201 `{ id, … }`; bad token → 400 `INVALID_EXPO_PUSH_TOKEN` |
| DELETE | `/notification-devices/:id` | Own device only |

Item: `{ id, createdAt, readAt, acknowledgedAt, resolvedAt, supersededAt, severity, module, portal, title, body, resourceType, resourceId, actionRoute, branchId, requiresAck, read, actionable }`.

## Administration: `/admin`

| Method | Path | Permission |
|---|---|---|
| GET | `/notification-routing` | `system.health.read`: events, effective policy, emitted flag |
| PUT | `/notification-routing/:eventType` | `policy.approve`: new policy version; cannot widen scope, drop a gate, or disable/downgrade CRITICAL; audited |
| GET / POST / DELETE | `/notification-queues[/:id]` | read `system.health.read`; write `employee.update` (audited) |
| GET | `/notification-health` | `system.health.read`: outbox counts by status, oldest pending, DEAD, delivery counts |
| GET | `/activity-monitor` | `audit.read` or `business.oversight.read`. Query: `from,to,domain,actorId,branchId,outcome,resourceId,page,limit`. Branch-scoped; safe details only |

## Internal

`POST /internal/notifications/run` with header `x-cron-secret: $CRON_SECRET` runs one worker cycle (used by the Cloudflare cron trigger).
