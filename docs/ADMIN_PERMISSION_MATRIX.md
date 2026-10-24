# Admin Permission Matrix

The database catalogue in `services/api/src/admin-catalog.ts` is authoritative. Every route resolves permissions on the server; frontend visibility is convenience only.

| Role | Admin portal | Employee governance | Security/approvals | Support | Audit/health |
| --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Yes, MFA | Full governance catalogue | Privileged assignments and decisions | Yes | Yes |
| `ADMIN` | Yes, MFA | Read, invite, update, suspend; non-privileged role assignment | Read approvals; no privileged assignment | Coordinate | Read |
| `SECURITY_ADMIN` | Yes, MFA | Read and suspend | Privileged access oversight | No default | Read/export and health |
| `SUPPORT_ADMIN` | Yes, MFA | Read within scope | No default | Assign/respond/escalate | Scoped read |
| `AUDIT_VIEWER` | Yes, MFA | Read only | Read only | No default | Read only |
| Sales/Inspector/Operations/Inventory/Listing/Pricing/Finance | No Admin permissions by default | No | Domain portal only | No | No |

Important permission keys include `admin.portal.access`, `employee.read`, `employee.invite`, `employee.update`, `employee.suspend`, `employee.deactivate`, `role.read`, `role.assign`, `role.assign.privileged`, `branch.read`, `branch.manage`, `approval.read`, `approval.decide`, `support.*`, `audit.*`, `export.*`, `email.*`, `policy.*` and `system.health.read`.

`SUPER_ADMIN` does not receive hidden wildcard authority. It receives the explicit governance catalogue and still does not gain finance, inspection, pricing, inventory or delivery actions.

Branch policy:

- A Super Admin can govern all configured branches.
- Other administrators can list, invite or change only records intersecting their assigned branches.
- A client-supplied branch ID is never accepted as proof of scope.
- Inactive or unknown branches cannot be assigned by invitation.
