# Admin Permission Matrix

The database catalogue in `services/api/src/admin-catalog.ts` is authoritative. Every route resolves permissions on the server; frontend visibility is convenience only.

| Role | Admin portal | Employee governance | Security/approvals | Business Oversight & Master Data | Support & Privacy | Audit, Reports & Email |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Yes, MFA | Full governance catalogue | Privileged assignments & decisions | Full oversight & master data manage | Full support & privacy manage | Full audit, sensitive exports & email |
| `ADMIN` | Yes, MFA | Read, invite, update, suspend; non-privileged roles | Read approvals; no privileged assignment | Read oversight & master data manage | Coordinate & privacy requests | Read audit, standard exports & email |
| `SECURITY_ADMIN` | Yes, MFA | Read and suspend | Privileged access & sensitive export decisions | Read oversight | Privacy compliance audit | Read/export audit & health |
| `SUPPORT_ADMIN` | Yes, MFA | Read within scope | No default | Read oversight | Assign, respond, escalate & privacy manage | Scoped email monitoring |
| `AUDIT_VIEWER` | Yes, MFA | Read only | Read only | Read oversight & master data (read) | Read only | Read audit & reports only |
| Sales/Inspector/Operations/Inventory/Listing/Pricing/Finance | No Admin permissions by default | No | Domain portal only | Domain portal only | Domain portal only | No |

### Authoritative Permission Catalogue

| Permission Key | Description | Roles Assigned |
| --- | --- | --- |
| `admin.portal.access` | Authenticate and view Admin Portal | All Admin roles |
| `employee.read` | View staff directory within branch scope | Super Admin, Admin, Security Admin, Support Admin, Audit Viewer |
| `employee.invite` | Issue one-time staff invitations | Super Admin, Admin |
| `employee.suspend` | Suspend or reactivate employee accounts | Super Admin, Admin, Security Admin |
| `employee.deactivate` | Permanently deactivate employee accounts | Super Admin |
| `role.read` | View role catalog and permissions | Super Admin, Admin, Security Admin, Audit Viewer |
| `role.assign` | Assign non-privileged business roles | Super Admin, Admin |
| `role.assign.privileged` | Assign Super Admin / Security Admin / Finance roles | Super Admin (via Maker-Checker proposal) |
| `branch.read` | View operating branches and service areas | All Admin roles |
| `branch.manage` | Add or activate/deactivate branches & service areas | Super Admin, Admin |
| `approval.read` | View dual-control approval requests | All Admin roles |
| `approval.decide` | Approve or reject pending proposals | Super Admin, Security Admin |
| `business.oversight.read` | View real selling, buying, inventory & finance feeds | Super Admin, Admin, Security Admin, Audit Viewer |
| `masterdata.read` | View canonical automotive taxonomy | Super Admin, Admin, Security Admin, Audit Viewer |
| `masterdata.manage` | Add or update canonical taxonomy codes | Super Admin, Admin |
| `support.read` | View customer support cases | Super Admin, Admin, Support Admin |
| `support.respond` | Reply to customer tickets via email outbox | Super Admin, Support Admin |
| `support.escalate` | Modify ticket status and internal notes | Super Admin, Admin, Support Admin |
| `privacy.request.manage` | Manage customer data privacy & erasure requests | Super Admin, Admin, Security Admin, Support Admin |
| `email.delivery.read` | View transactional outbox & email templates | Super Admin, Admin, Security Admin, Support Admin |
| `email.retry` | Trigger delivery retry for failed outbox emails | Super Admin, Admin |
| `audit.read` | View immutable audit event stream | Super Admin, Admin, Security Admin, Audit Viewer |
| `export.create` | Generate CSV exports (inventory, audit, staff) | Super Admin, Admin, Security Admin |
| `export.sensitive.approve` | Authorize sensitive PII customer export jobs | Super Admin, Security Admin (Maker-Checker) |
| `policy.read` | View versioned governance policies | All Admin roles |
| `policy.propose` | Propose governance policy updates | Super Admin |
| `system.health.read` | View operational health and provider status | Super Admin, Admin, Security Admin |

`SUPER_ADMIN` does not receive hidden wildcard authority. It receives the explicit governance catalogue and still does not gain finance, inspection, pricing, inventory or delivery actions.

Branch policy:

- A Super Admin can govern all configured branches.
- Other administrators can list, invite or change only records intersecting their assigned branches.
- A client-supplied branch ID is never accepted as proof of scope.
- Inactive or unknown branches cannot be assigned by invitation.
