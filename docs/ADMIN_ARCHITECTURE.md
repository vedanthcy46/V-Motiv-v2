# V MOTIV V2 Admin Architecture

Status: Phase 1 Foundation & Phase 2 Full Operational Governance Implemented.

## Runtime boundaries

- `apps/admin-portal` is the React/TypeScript employee governance frontend. It contains no server credentials or authorization source of truth.
- `services/api` remains the single shared Express/Firebase Admin/Prisma service for customer and employee applications.
- PostgreSQL (`neondb` on AWS / local `127.0.0.1:5440/vmotiv_v2_dev`) remains the single V2 database. V1 repositories and data are not referenced.
- Firebase verifies Google identity. PostgreSQL resolves employee state, role assignments, permission assignments, branch scope, maker-checker approvals and audit history.
- Resend delivery uses the transactional outbox (`EmailOutbox`). Invitation acceptance never depends on provider delivery state. All outbox entries mask recipient PII in administrator queries.

## Implemented Governance Modules

1. **Identity & MFA Authentication Boundary**:
   - Google identity authenticated via Firebase with mandatory MFA requirement (`auth/multi-factor-auth-required` phone/totp).
   - `/api/v2/admin/*` middleware enforces `ADMIN_MFA_REQUIRED` when `ENFORCE_ADMIN_MFA` is active.
   - Operator bootstrap script (`scripts/seed-admin.ts`) guarantees Super Admin identity idempotently without exposing public bootstrap endpoints.

2. **Employee & Role Lifecycle**:
   - Granular RBAC (`roleAssignments` & `branchAssignments`) with branch-scoping.
   - Cryptographically random SHA-256 hashed one-time invitation tokens expiring in 24–168 hours.
   - Immediate suspension and deactivation with automatic Firebase refresh token revocation via Firebase Admin SDK.
   - Protection against self-suspension and last Super Admin removal.

3. **Maker-Checker Dual Control & Approval Centre**:
   - Two-person rule enforced via PostgreSQL transaction with Postgres advisory locks (`pg_advisory_xact_lock`).
   - Requester cannot approve their own proposal (`SELF_APPROVAL_DENIED`).
   - Covers: Privileged Role Invitations (`SUPER_ADMIN`, `SECURITY_ADMIN`, `FINANCE`), Policy Changes, and Sensitive Customer PII Exports (`SENSITIVE_EXPORT_PROPOSAL`).

4. **Business Oversight (Read-Only Operational Feeds)**:
   - **Selling (Acquisitions)**: Live lead pipeline, status distribution counts, latest valuation offer, city branch scoping.
   - **Buying (Enquiries & Test Drives)**: Active doorstep & Hub test drive bookings, purchase enquiries with customer details.
   - **Showroom & Inventory**: Live listing catalog, vehicle specifications, pricing in ₹, engagement counters (test drives, enquiries, wishlist).
   - **Finance Oversight**: Real-time aggregated active inventory value, issued acquisition offers value, pending settlement counts, and reconciliation health status.

5. **Master Data Catalog**:
   - Canonical automotive taxonomy items: `CAR_MAKE`, `CAR_BODY_TYPE`, `FUEL_TYPE`, `TRANSMISSION_TYPE`, `DOCUMENT_TYPE`.
   - Granular permissions: `masterdata.read`, `masterdata.manage`.
   - Non-destructive activation/deactivation and audit tracking for taxonomy modifications.

6. **Customer Support & Privacy Compliance**:
   - Concierge Support Cases queue with customer email replies through transactional outbox and internal administrator notes.
   - Privacy Requests (`DATA_EXPORT`, `DATA_ERASURE`, `CONSENT_WITHDRAWAL`) lifecycle management (`PENDING`, `PROCESSING`, `COMPLETED`, `REJECTED`) with resolution tracking and audit logging.

7. **Email Operations & Delivery Monitoring**:
   - Live transactional email outbox monitoring with masked recipient PII (`ro***t@domain.com`).
   - Summary statistics by state (`PENDING`, `SENT`, `FAILED`, `DEAD_LETTER`).
   - Controlled retry for failed deliveries resetting backoff counters.
   - Catalog of canonical transactional email templates.

8. **Audit Trail & Controlled Reports**:
   - Append-only `AuditEvent` log with actor, action, target entity, outcome, and metadata.
   - Asynchronous `ExportJob` generation for Inventory, Audit Logs, and Employee Directory.
   - Spreadsheet formula injection protection (`escapeCsvCell`) neutralizing `=`, `+`, `-`, `@`, `\t` prefixes.
   - Maker-checker signoff required for sensitive customer PII exports before downloadable file availability.
   - Secure authenticated blob download avoiding unauthenticated direct GET URLs.

## Deliberate domain boundary

The Admin role catalogue grants governance permissions only. It does not grant transaction authority for finance verification, inspection findings, acquisition pricing, inventory custody, listing publication, sales completion or delivery. Those actions remain in their responsible portals.

## Frontend Layout

```text
apps/admin-portal/
  src/App.tsx       authenticated shell, navigation and all 10 governance views
  src/api.ts        typed Firebase-authenticated API client
  src/firebase.ts   browser Firebase initialization
  src/types.ts      strongly-typed API models and pagination contracts
  src/styles.css    accessible, responsive V MOTIV dark design system (#061A38 / #F7B503)
```
