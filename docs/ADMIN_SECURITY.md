# Admin Security

## Enforced now

- Firebase ID tokens are checked with revocation enabled.
- Production serverless startup requires `FIREBASE_SERVICE_ACCOUNT_JSON` so revocation checks cannot silently downgrade.
- Verified Google provider and verified email are required.
- Active local user and employee state is required.
- All Admin endpoints require a verified second factor.
- Deny-by-default granular permissions and branch scope are evaluated server-side.
- Invitation tokens use 256 bits of randomness, are hashed at rest in `EmployeeInvitation`, expire and are single use.
- Privileged role invitations require an additional privilege.
- Self-suspension and loss of the only active Super Admin are blocked.
- Sensitive mutations append audit events.
- The public email-drain endpoint was removed.
- CORS accepts exact configured origins; arbitrary `*.vercel.app` origins are no longer accepted.
- Provider exception text is not stored as an email error code.
- No server secret is used in a browser bundle.

## Mandatory operator action

A Resend API key was previously committed as a source fallback. The source fallback has been removed, but repository cleanup does not revoke that key. Revoke/rotate it in Resend, replace the protected deployment secret, and inspect provider activity before enabling delivery.

## Not yet complete

- Admin MFA enrollment, encrypted recovery-code lifecycle and controlled recovery UI.
- Independent maker-checker execution for privileged role changes.
- Security session inventory and access-review workflows.
- Attachment authorization, export download grants and webhook-signature processing (their modules are not built yet).
- Database-level tamper evidence beyond application append-only behavior and restricted UI.
- Dedicated rate limits per sensitive action and formal security penetration testing.
