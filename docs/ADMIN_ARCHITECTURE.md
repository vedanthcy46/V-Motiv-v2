# V MOTIV V2 Admin Architecture

Status: Phase 1 foundation implemented; later operational-governance modules remain pending.

## Runtime boundaries

- `apps/admin-portal` is the React/TypeScript employee governance frontend. It contains no server credentials or authorization source of truth.
- `services/api` remains the single shared Express/Firebase Admin/Prisma service for customer and employee applications.
- PostgreSQL remains the single V2 database. V1 repositories and data are not referenced.
- Firebase verifies Google identity. PostgreSQL resolves employee state, role assignments, permission assignments, branch scope and audit history.
- Resend delivery uses the existing transactional outbox. Invitation acceptance never depends on provider delivery state.

## Implemented Phase 1 modules

- MFA-gated Admin authentication at `/api/v2/admin/*`.
- One-time operator-only first-Super-Admin bootstrap command; no public bootstrap endpoint.
- Normalized role, permission and branch assignments while retaining the existing employee fields for compatibility.
- Employee list with server pagination, search and filters.
- Cryptographically random, SHA-256-hashed, expiring and single-use employee invitations.
- Verified-email invitation acceptance and Firebase UID linkage.
- Employee suspension/reactivation/deactivation with self-change and last-Super-Admin protections.
- Firebase refresh-token revocation for suspension/deactivation.
- Real employee dashboard counts and scoped audit history.
- Permission-aware Admin navigation and direct URL handling.
- Approval Centre with immutable decision records and controlled execution for privileged employee invitations.
- Branch and service-area administration with server-side scope enforcement, audit events and non-destructive deactivation controls.
- Support-case queue and secure response workflow reusing the customer case data, transactional outbox and branch-city scope; support actions do not alter finance, inspection or vehicle workflow records.

## Deliberate domain boundary

The Admin role catalogue grants governance permissions only. It does not grant transaction authority for finance verification, inspection findings, acquisition pricing, inventory custody, listing publication, sales completion or delivery. Those actions remain in their responsible portals.

## Current frontend layout

```text
apps/admin-portal/
  src/App.tsx       authenticated shell and implemented pages
  src/api.ts        typed Firebase-authenticated API client
  src/firebase.ts   browser Firebase initialization
  src/types.ts      API view types
  src/styles.css    accessible responsive design system
```

The Phase 2–4 navigation destinations are intentionally not rendered as empty screens.
