# Employee notification permission matrix

## Who may do what with the notification system

| Capability | Permission | Where enforced |
|---|---|---|
| Read my own inbox, preferences, devices | any active employee (identity is taken from the token, never from the request) | `employees/me` router: `requireEmployee` |
| See the routing overview and pipeline health | `system.health.read` | `/admin/notification-routing`, `/admin/notification-queues` (GET), `/admin/notification-health` |
| Change a routing policy | `policy.approve` | `PUT /admin/notification-routing/:eventType` (audited, validated) |
| Add or remove a queue owner | `employee.update` | `/admin/notification-queues` (audited) |
| Activity Monitor (separate from alerts) | `audit.read` or `business.oversight.read`; non-global staff are limited to their branches | `GET /admin/activity-monitor` |

## Permissions that gate event delivery

An employee must hold one of these (through a role or granted directly), or one of the event's listed roles, to be eligible for the events in the routing matrix. Assignees are exempt.

- `approval.decide`
- `export.sensitive.approve`
- `finance.payout.approve`
- `finance.payout.execute`
- `finance.portal.access`
- `finance.settlement.prepare`
- `inspection.assignment.assign`
- `inspection.review.queue.read`
- `policy.approve`
- `role.assign.privileged`

## Rules the tests prove

- A suspended or deactivated employee receives nothing and cannot read an inbox (`EMPLOYEE_REQUIRED`); their devices are released.
- Another employee's notification id is indistinguishable from a missing one (404) for read, acknowledge and open.
- Filtering by a branch the employee is not authorised for is refused (403).
- Reading, acknowledging or opening a notification never changes the business record behind it.
- A policy change cannot widen branch scope, drop the permission gate, or switch off or downgrade a CRITICAL alert.
