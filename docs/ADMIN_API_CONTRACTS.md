# Admin API Contracts

All routes require `Authorization: Bearer <Firebase ID token>`. Admin routes additionally require active Admin access and second-factor verification (MFA).

| Method | Route | Permission / Policy | Description & Result |
| --- | --- | --- | --- |
| `POST` | `/api/v2/staff/invitations/accept` | Verified identity + token | Activates approved employee role & branch scope |
| `GET` | `/api/v2/admin/me` | `admin.portal.access` + MFA | Current actor profile, roles, permissions, branches |
| `GET` | `/api/v2/admin/dashboard` | `employee.read` | Scoped employee summary, pending tasks & own audit events |
| `GET` | `/api/v2/admin/employees` | `employee.read` | Paginated employee directory with status & search filters |
| `POST` | `/api/v2/admin/invitations` | `employee.invite` | Issues single-use, 256-bit hashed staff invitation link |
| `POST` | `/api/v2/admin/approvals/privileged-invitations` | `employee.invite`, `role.assign` | Proposes dual-control invitation for privileged role |
| `GET` | `/api/v2/admin/approvals` | `approval.read` | Paginated dual-control approval requests in scope |
| `POST` | `/api/v2/admin/approvals/:id/decision` | `approval.decide` | Maker-checker decision; executes approved action once |
| `PATCH` | `/api/v2/admin/employees/:id/status` | `employee.suspend` or `employee.deactivate` | Updates employee status and revokes Firebase refresh tokens |
| `GET` | `/api/v2/admin/roles` | `role.read` | Active role definitions and granular permissions |
| `GET` | `/api/v2/admin/branches` | `branch.read` | Active branches list |
| `GET` | `/api/v2/admin/branches/manage` | `branch.read` | Scoped branch management with employee assignment counts |
| `POST` | `/api/v2/admin/branches` | `branch.manage` | Creates branch with code, name, city, address |
| `PATCH` | `/api/v2/admin/branches/:id` | `branch.manage` + scope | Updates branch or soft-deactivates when no active staff remain |
| `GET` | `/api/v2/admin/service-areas` | `branch.read` | Service area list |
| `POST` | `/api/v2/admin/service-areas` | `branch.manage` | Adds customer service area |
| `PATCH` | `/api/v2/admin/service-areas/:id` | `branch.manage` | Soft-activates or deactivates service area |
| `GET` | `/api/v2/admin/business/selling` | `business.oversight.read` | Live vehicle acquisition leads, latest offers, and status counts |
| `GET` | `/api/v2/admin/business/buying` | `business.oversight.read` | Test drive bookings and customer purchase enquiries |
| `GET` | `/api/v2/admin/business/inventory` | `business.oversight.read` | Showroom inventory, specifications, prices, engagement metrics |
| `GET` | `/api/v2/admin/business/finance` | `business.oversight.read` | Aggregated inventory value, offers issued, settlements, health |
| `GET` | `/api/v2/admin/master-data` | `masterdata.read` | Canonical automotive taxonomy entries |
| `POST` | `/api/v2/admin/master-data` | `masterdata.manage` | Adds taxonomy item (`CAR_MAKE`, `CAR_BODY_TYPE`, etc.) |
| `PATCH` | `/api/v2/admin/master-data/:id` | `masterdata.manage` | Updates taxonomy name, active status, or metadata |
| `GET` | `/api/v2/admin/support/cases` | `support.read` | Paginated support tickets in branch-city scope |
| `POST` | `/api/v2/admin/support/cases/:id/replies` | `support.respond` | Posts reply, delivered via transactional outbox email |
| `PATCH` | `/api/v2/admin/support/cases/:id` | `support.escalate` | Updates ticket status and records internal notes |
| `GET` | `/api/v2/admin/support/privacy-requests` | `privacy.request.manage` | Customer data privacy/erasure compliance requests |
| `PATCH` | `/api/v2/admin/support/privacy-requests/:id` | `privacy.request.manage` | Updates privacy request status and resolution notes |
| `GET` | `/api/v2/admin/communications/outbox` | `email.delivery.read` | Outbox message history with masked recipient PII |
| `GET` | `/api/v2/admin/communications/templates` | `email.delivery.read` | List of canonical transactional email templates |
| `POST` | `/api/v2/admin/communications/outbox/:id/retry` | `email.retry` | Resets delivery attempts and schedules immediate retry |
| `GET` | `/api/v2/admin/exports` | `export.create` | Controlled export job history and status |
| `POST` | `/api/v2/admin/exports` | `export.create` | Queues export; sensitive requests require maker-checker signoff |
| `GET` | `/api/v2/admin/exports/:id/download` | `export.create` | Downloads sanitized CSV file with formula injection protection |
| `GET` | `/api/v2/admin/system-health` | `system.health.read` | Safe system diagnostic metrics and outbox queue status |
| `GET` | `/api/v2/admin/policies` | `policy.read` | Governance policy versions and metadata |
| `POST` | `/api/v2/admin/policies/proposals` | `policy.propose` | Proposes policy revision to dual-control approval centre |
| `GET` | `/api/v2/admin/audit` | `audit.read` | Append-only immutable security and governance audit trail |

## Error Responses

Errors return JSON formatted as `{ "code": "MACHINE_READABLE_CODE" }`. Common error codes:
- `ADMIN_ACCESS_DENIED`: Account is not an active employee with admin access.
- `ADMIN_MFA_REQUIRED`: Verified second-factor session required.
- `PERMISSION_DENIED`: Granular permission missing on server.
- `BRANCH_SCOPE_DENIED`: Record is outside caller's assigned branches.
- `SELF_APPROVAL_DENIED`: Maker cannot approve their own proposal.
- `SELF_STATUS_CHANGE_DENIED`: Administrators cannot suspend themselves.
- `LAST_SUPER_ADMIN_PROTECTED`: System prevents deactivation of the last Super Admin.
- `APPROVAL_NOT_PENDING`: Request has already been decided.
- `EXPORT_NOT_READY`: Export file generation is still pending approval.
- `EXPORT_EXPIRED`: Export link expired (24–48 hour retention).
