# Employee notification, alert and escalation system: architecture

One system for staff (Sales, Operations, Finance, Admin, Inspectors). Customer notifications keep their own path. PostgreSQL (Prisma) is the only store; there is no second notification database, and no standalone mobile app (the Inspector mode inside `customer-mobile` is the staff app).

## Flow

```
business code ──(same DB transaction)──▶ DomainOutboxEvent (PENDING)
                                              │  worker claims with FOR UPDATE SKIP LOCKED + lease
                                              ▼
                       event catalog + NotificationRoutingPolicy (versioned)
                                              ▼
              recipient resolution (assignment · queue ownership · branch · permission)
                                              ▼
              Notification row per employee (idempotent: unique eventId + userId)   ◀── the inbox, source of truth
                         │                │                │
                    in-app (SSE/poll)   PushTicket → Expo   EmailOutbox → Resend
                                              ▼
              read · acknowledge · resolve/supersede · escalation (NotificationEscalationEvent)
```

Delivery channels are optional additions to the inbox row: if push or email fails, the inbox item still exists.

## Principles

1. **The event is saved with the business change.** `enqueueDomainEvent(tx, …)` joins the caller's transaction, so a rolled-back change leaves no event, and a committed change always has one (tested).
2. **Never role-broadcast.** Recipients come from the specific record: the assignee, the work queue's designated owners (`NotificationQueueMember`), or, when nobody is designated, a flagged and capped fallback of permission holders in the event's branch. Platform administrators are a last resort and only for critical admin events.
3. **Eligibility is re-checked at delivery and again on open**: active employee and user, permission or role gate, branch authorisation (global only for SUPER_ADMIN), and for jobs the live assignment.
4. **No sensitive data in notifications.** Each event lists the payload fields it may keep (`allowedFields`); everything else is dropped before storage. Push carries only `{notificationId, module, actionRoute, severity}`. Email contains the title, the safe body and a portal link.
5. **Links are allow-listed routes, not URLs.** `routes.ts` has a per-module pattern list; anything with a scheme, host, `//` or `..` is refused on the way in and on the way out. A route never grants access: opening re-authorises.
6. **Reading is not acting.** Mark-read and acknowledge change only the inbox row.
7. **Honest status.** The catalog marks each event `emitted` or not; docs and the Admin overview never claim an event works when no code raises it.

## Code map (`services/api/src/employee-notifications/`)

| File | Responsibility |
|---|---|
| `catalog.ts` | Event definitions, default escalation policies |
| `routes.ts` | Allowed action routes per module |
| `routing.ts` | Recipient strategies, eligibility, capped fallback |
| `policy.ts` | Effective policy = code default + latest stored version; validated updates |
| `outbox.ts` | Enqueue, claim with lease, backoff, DEAD state |
| `processor.ts` | Event → inbox rows → push tickets / email rows |
| `inbox.ts` | List, counts, read, acknowledge, authorise-open, preferences, devices |
| `router.ts` | HTTP contracts and the SSE stream |
| `governance.ts` | Routing overview, queue owners, pipeline health, Activity Monitor |
| `resolve.ts` | Mark notifications resolved/superseded when the work is done or reassigned |
| `branches.ts`, `workhours.ts` | Branch lookup for leads; working-hours clock in the branch timezone |
| `detectors.ts`, `escalation.ts`, `digest.ts`, `cycle.ts` | Time-based events, escalation, daily digest, one worker pass |

Schema: `prisma/migrations/20261121030000_employee_notification_pipeline`.

## Clients

- Web portals: shared `@vmotiv/ui` (`EmployeeNotificationBell`, `NotificationInbox`, `useEmployeeNotifications`). `/notifications` page and bell in Sales, Operations, Finance and Admin. Admin also has the **Activity Monitor** page.
- Inspector mobile: inbox, acknowledge, push tap → job, device registration (`customer-mobile`, Inspector mode).

## Activity Monitor is separate

It reads `AuditEvent` (what happened), never creates alerts, requires `audit.read` or `business.oversight.read`, is branch-scoped for non-global staff, and shows only an allow-listed subset of each event's details.
