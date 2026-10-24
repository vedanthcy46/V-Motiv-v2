# Admin Workflows

## 1. First Administrator Bootstrap & Seed

1. An operator creates and verifies the intended Google/Firebase identity.
2. The operator runs `npm run bootstrap:admin -w @vmotiv/api` (or `npm run seed:admin -w @vmotiv/api`) with verified environment credentials.
3. The command checks the Firebase UID, verified email, and Google sign-in provider.
4. A PostgreSQL transaction with an advisory lock guarantees atomic verification and seed.
5. Canonical roles, permissions, branches, and master data items are created or updated idempotently.
6. The created Super Administrator signs in with Google and completes second-factor verification before accessing protected `/api/v2/admin/*` endpoints.

## 2. Employee Invitation & Onboarding

1. An MFA-authenticated administrator with `employee.invite` enters the employee's full name, work email, designated title, and assigned branches.
2. If assigning an operational role (e.g. `SALES_EXECUTIVE`, `INSPECTOR`, `OPERATIONS_MANAGER`), the backend creates an expiring one-time invitation record.
3. If proposing a privileged role (`SUPER_ADMIN`, `SECURITY_ADMIN`, `FINANCE`), the submission is routed to the Maker-Checker Approval Centre requiring a business justification and independent sign-off.
4. The invitation token is generated with 32 cryptographically secure random bytes, hashed via SHA-256 for database storage, and delivered via the Resend transactional email outbox.
5. The employee signs in with the exact Google work email that received the invitation.
6. On acceptance, the backend binds the employee record, assigns roles and branch scopes, marks the token as used, and journals the event to `AuditEvent`.

## 3. Account Suspension & Deactivation

1. An authorized administrator specifies an action (`SUSPENDED` or `DEACTIVATED`) and mandatory justification text.
2. The server verifies that the caller is not suspending themselves (`SELF_STATUS_CHANGE_DENIED`), that the target is within the administrator's branch scope, and that the organization never deactivates its last active Super Administrator (`LAST_SUPER_ADMIN_PROTECTED`).
3. Both `Employee` and `User` records are updated atomically.
4. Firebase Admin SDK revokes the target user's active refresh tokens (`revokeTokens(firebaseUid)`).
5. The API checks active status on every request, ensuring access is blocked immediately without waiting for token expiry.

## 4. Dual-Control Maker-Checker Approvals

1. **Proposal**: A maker proposes a privileged action (Privileged Role Invitation, Policy Amendment, or Sensitive Customer PII Export).
2. **Advisory Lock & Self-Approval Prevention**: The approval request is locked via `pg_advisory_xact_lock(bigint)`. The system verifies `requesterId !== actor.userId`.
3. **Optimistic Concurrency**: Every approval request maintains a version integer. Decisions verify the caller's version to prevent race conditions or duplicate execution.
4. **Execution**:
   - For Privileged Invitations: atomically creates the invitation and queues the transactional email.
   - For Sensitive Exports: changes status from `APPROVAL_PENDING` to `READY`, generating sanitized CSV content.
   - For Policy Proposals: records the approved revision.

## 5. Master Data Management

1. Administrators with `masterdata.read` view canonical makes, body types, fuel types, transmission types, and document types.
2. Administrators with `masterdata.manage` add new entries with category, code, name, and optional parent hierarchy (e.g., car models referencing car makes).
3. Changes and status toggles are journaled in `AuditEvent`.

## 6. Controlled Reports & CSV Exports

1. An administrator requests an export of `INVENTORY`, `AUDIT`, `EMPLOYEES`, or `CUSTOMERS`.
2. Operational datasets (`INVENTORY`, `AUDIT`, `EMPLOYEES` without PII) generate instantly with status `READY`.
3. Datasets classified as `sensitive: true` (or containing customer PII) automatically generate an `ApprovalRequest` (`SENSITIVE_EXPORT_PROPOSAL`) with status `APPROVAL_PENDING`.
4. Formula Injection Protection (`escapeCsvCell`) automatically prepends `'` to any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
5. Upon download, the file is transferred over an authenticated bearer channel and delivered via client-side Blob generation.

## 7. Customer Privacy Requests (DPDP / GDPR)

1. Customer data access, erasure, or consent withdrawal requests appear in the Support & Privacy queue.
2. An authorized administrator inspects the customer details and updates the status (`PENDING`, `PROCESSING`, `COMPLETED`, `REJECTED`) with a resolution note.
3. Every resolution is recorded in the audit trail.

## 8. Multi-Factor Authentication (MFA)

1. Privileged Admin roles require second-factor verification.
2. In local development or testing, developers can enroll phone MFA using `npm run mfa:enroll -- <phone_number>`.
3. The Admin Portal includes an inline modal (`MfaChallengeDialog`) that prompts for the 6-digit SMS OTP when Firebase throws `auth/multi-factor-auth-required`.
4. When testing without SMS carrier billing, developers can configure Firebase Phone Authentication test numbers or toggle `ENFORCE_ADMIN_MFA=false`.
