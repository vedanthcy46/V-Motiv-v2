# Employee notification escalations

An unanswered alert is raised to the next person on a clock. Policies are stored (`NotificationEscalationPolicy`, versioned) with code defaults:

| Policy | Working hours | Steps |
|---|---|---|
| `SALES_LEAD_FIRST_RESPONSE` | yes | 60 min → reports-to; 240 min → queue owner |
| `SALES_LEAD_UNASSIGNED` | yes | 30 min → queue owner; 120 min → admin responder |
| `OPS_DISPATCH_SLA` | yes | 30 min → queue owner; 120 min → admin responder |
| `INSPECTOR_JOB_OVERDUE` | yes | 60 min → queue owner |
| `RENTAL_FOLLOW_UP` | yes | 120 min → reports-to; 480 min → queue owner |
| `FINANCE_STANDARD` | yes | 240 min → reports-to; 1440 min → admin responder |
| `ADMIN_APPROVAL` | yes | 480 min → admin responder |
| `CRITICAL_INCIDENT` | no (day and night) | 10 min → reports-to; 30 min → admin responder |

## Rules

- The clock counts **working time in the branch's timezone** (working hours, rest days, holidays) unless the policy says otherwise. A normal alert raised at night waits until morning; a critical one does not.
- An alert is **skipped** when it was acknowledged, resolved or superseded, **or the work behind it is already done**, which is checked against the live record (lead responded, inspection started, approval decided…), so completed work is never chased.
- Each step fires once per notification and is recorded in `NotificationEscalationEvent` (who, which step, when, why or why skipped). Targets are the manager hierarchy (`reportsToId`), the queue owners, or the admin responders, and are re-checked for eligibility.
- A **critical** alert still unresolved after its last step raises `CRITICAL_ESCALATION_UNRESOLVED` to the admin responders.
- Scans are paged and cached per run so a large backlog cannot starve the worker.

## Time-based detectors (`detectors.ts`)

Raise events on a schedule, de-duplicated by window: unassigned seller leads (`LEAD_UNASSIGNED_OVERDUE`), sales follow-ups due (`SALES_FOLLOW_UP_DUE`), rental pickup reminders, overdue balances and returns, and integration outages. Detector events go through the same outbox, so they are routed, audited and escalated like any other.

## Tested

Working-hour arithmetic; no running at night/rest days; critical clock day and night; unanswered lead → manager once and recorded; finished work and acknowledged alerts never chased; detectors; one cycle pass and mid-cycle restart.
