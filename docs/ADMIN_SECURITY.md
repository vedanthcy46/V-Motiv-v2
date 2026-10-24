# Admin Security

## Enforced Security Controls

1. **Authentication & Identity Verification**:
   - Every protected request checks Firebase ID tokens with revocation verification enabled (`checkRevoked: true`).
   - Verified Google provider (`google.com`) and verified email (`email_verified: true`) are mandatory.
   - Verified second-factor (`sign_in_second_factor`) is required on all `/api/v2/admin/*` routes when `ENFORCE_ADMIN_MFA !== 'false'`.
   - Production startup strictly requires `FIREBASE_SERVICE_ACCOUNT_JSON` to prevent revocation check downgrades.

2. **Authorization & Least Privilege**:
   - Deny-by-default granular RBAC with server-evaluated permissions. Frontend UI controls are purely cosmetic and non-authoritative.
   - Scope isolation: Non-Super Admin administrators can only access and govern records within their assigned branch scope.
   - Client-supplied branch IDs are never trusted as proof of scope.

3. **Dual-Control Maker-Checker Architecture**:
   - Enforced for privileged role assignments (`SUPER_ADMIN`, `SECURITY_ADMIN`, `FINANCE`), policy amendments, and sensitive customer PII exports.
   - Advisory locking (`pg_advisory_xact_lock`) prevents race conditions.
   - Self-approval is strictly forbidden (`SELF_APPROVAL_DENIED`).
   - Single-use, version-tracked approvals prevent duplicate execution.

4. **Spreadsheet Formula Injection Defense**:
   - In accordance with OWASP CSV Injection guidelines, all exported CSV data is sanitized via `escapeCsvCell`.
   - Any cell value starting with `=`, `+`, `-`, `@`, `\t`, or `\r` is escaped with a leading single quote (`'`), neutralizing spreadsheet formula execution.

5. **PII Masking & Privacy Controls**:
   - Transactional email delivery logs mask recipient email addresses (`ro***t@domain.com`) in all administrator-facing queries.
   - Customer privacy requests (DPDP / GDPR) provide structured erasure and access lifecycle tracking with immutable audit trails.

6. **Invitation Token Cryptography**:
   - 256 bits of cryptographically secure random bytes generated via `node:crypto`.
   - Only SHA-256 hashes are stored in PostgreSQL (`EmployeeInvitation.tokenHash`).
   - Invitation links are one-time use and enforce strict expiration (24–168 hours).

7. **Session Revocation & Anti-Lockout**:
   - Suspending or deactivating an employee immediately calls Firebase Admin SDK `revokeRefreshTokens(firebaseUid)`.
   - Local active status check denies access immediately without waiting for token cache expiration.
   - Protection against self-suspension (`SELF_STATUS_CHANGE_DENIED`) and accidental lockout of the organization's last Super Admin (`LAST_SUPER_ADMIN_PROTECTED`).

8. **Network & Transport Hygiene**:
   - Strict CORS policy requiring explicit configured origins (`ADMIN_WEB_ORIGIN`, `WEB_ORIGIN`). Wildcard subdomain matching is disabled.
   - Download endpoints stream files over authenticated bearer-token fetch requests rather than exposing public URLs.
