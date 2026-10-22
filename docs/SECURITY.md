# Security boundaries

Implemented:
- Firebase Admin verification with revocation on each protected request.
- Verified Google provider/email requirement.
- Local account suspension checks and unique UID mapping.
- No automatic email-based identity merge or employee escalation.
- Employee gate requires active server-owned employee record and second-factor claim.
- Helmet headers, exact CORS origin, bearer API (no authentication cookies), body limits and rate limiting.
- Registration transaction includes audit and email outbox.
- Credentials and raw provider failures excluded from API responses.
- API worker is private; no arbitrary public send endpoint.
- Local database URLs restricted to isolated V2 development/test names at runtime.
- Secrets, database storage, dependencies and builds ignored by Git.
- Marketing defaults off.
- Customer wishlist, selling requests and test drives are scoped to the verified Firebase UID's active local account.
- Customer inputs use strict schemas; unknown role/identity fields are rejected.
- Native Firebase platform credentials and Google service files are Git-ignored.

Current limits:
- Employee invitations/bootstrap and employee-domain RBAC/scope enforcement are upcoming. Customer business endpoints exist; staff mutation endpoints do not.
- Production deployment requires HTTPS termination, correct proxy configuration, private database access, secret management and shared rate-limit infrastructure for multiple instances.
- Native development PostgreSQL uses local trust authentication bound to 127.0.0.1. Use the password-protected Docker option or a secured managed database outside individual development.
- API currently binds 127.0.0.1. Configure deployment listener/proxy deliberately.
- Resend signed webhooks, suppressions and marketing administration remain pending.
- Application code provides no identity migration or production admin bypass.
- Current Expo/Metro dependencies have upstream npm audit advisories without a non-breaking current-SDK resolution; review patched SDK releases before production release. Do not use npm's suggested downgrade to Expo 44.
- Do not label production-ready until real OAuth, mail, signed native builds and staff approval controls are verified.

