# Admin API Contracts

All routes require `Authorization: Bearer <Firebase ID token>`. Admin routes additionally require active Admin access and MFA.

| Method | Route | Permission/policy | Result |
| --- | --- | --- | --- |
| `POST` | `/api/v2/staff/invitations/accept` | Valid verified identity + invitation | Activates approved employee role/scope |
| `GET` | `/api/v2/admin/me` | `admin.portal.access` + MFA | Effective roles, permissions and branches |
| `GET` | `/api/v2/admin/dashboard` | `employee.read` | Real scoped employee/invitation counts |
| `GET` | `/api/v2/admin/employees` | `employee.read` | Paginated scoped employees |
| `POST` | `/api/v2/admin/invitations` | `employee.invite`; privilege/scope rules | Creates queued invitation |
| `POST` | `/api/v2/admin/approvals/privileged-invitations` | `employee.invite`, `role.assign` | Proposes high-risk employee access; does not invite yet |
| `GET` | `/api/v2/admin/approvals` | `approval.read` | Paginated branch-scoped approval inbox |
| `POST` | `/api/v2/admin/approvals/:id/decision` | `approval.decide`, `role.assign.privileged`; independent approver | Records decision and executes approved invitation once |
| `PATCH` | `/api/v2/admin/employees/:id/status` | `employee.suspend` or `employee.deactivate` | Changes access and revokes inactive sessions |
| `GET` | `/api/v2/admin/roles` | `role.read` | Active role catalogue and permission descriptions |
| `GET` | `/api/v2/admin/branches` | `branch.read` | Active branches |
| `GET` | `/api/v2/admin/branches/manage` | `branch.read` | Scoped branch configuration, including assignment counts |
| `POST` | `/api/v2/admin/branches` | `branch.manage` | Creates an audited branch using an explicit field allowlist |
| `PATCH` | `/api/v2/admin/branches/:id` | `branch.manage` + scope | Updates approved branch fields or soft-deactivates when no active employee remains assigned |
| `GET` | `/api/v2/admin/service-areas` | `branch.read` | Service-area catalogue, including inactive historical entries |
| `POST` | `/api/v2/admin/service-areas` | `branch.manage` | Creates an audited service area |
| `PATCH` | `/api/v2/admin/service-areas/:id` | `branch.manage` | Soft-activates or deactivates a service area; it does not delete history |
| `GET` | `/api/v2/admin/support/cases` | `support.read` + branch-city scope | Paginated customer support cases and thread history |
| `POST` | `/api/v2/admin/support/cases/:id/replies` | `support.respond` + branch-city scope | Adds a customer-visible support response and queues transactional delivery |
| `PATCH` | `/api/v2/admin/support/cases/:id` | `support.escalate` + branch-city scope | Changes case state and optionally records an internal-only note |
| `GET` | `/api/v2/admin/system-health` | `system.health.read` | Safe API/database/outbox health summary without secrets or recipient data |
| `GET` | `/api/v2/admin/policies` | `policy.read` | Versioned policy metadata; content is not exposed to unauthorized roles |
| `POST` | `/api/v2/admin/policies/proposals` | `policy.propose` | Submits an approval-backed policy revision; it cannot activate itself |
| `GET` | `/api/v2/admin/audit` | `audit.read` | Paginated scoped immutable events |

Errors use `{ "code": "STABLE_MACHINE_CODE" }` without stack traces, tokens, credentials or record-existence detail beyond the authorized workflow. Common codes include `ADMIN_ACCESS_DENIED`, `ADMIN_MFA_REQUIRED`, `PERMISSION_DENIED`, `BRANCH_SCOPE_DENIED`, `INVITATION_INVALID`, `INVITATION_EXPIRED`, `INVITATION_NOT_ACTIVE`, `INVITATION_IDENTITY_MISMATCH`, `PRIVILEGED_ROLE_APPROVAL_REQUIRED`, `SELF_APPROVAL_DENIED`, `APPROVAL_VERSION_MISMATCH`, `APPROVAL_NOT_PENDING`, `APPROVAL_EXPIRED`, `APPROVAL_STALE` and `LAST_SUPER_ADMIN_PROTECTED`.

Phase 2–4 route groups from the blueprint are not claimed here because they are not implemented.
