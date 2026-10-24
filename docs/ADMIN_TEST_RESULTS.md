# Admin Test Results

Latest local verification: 2026-10-23.

| Check | Result | Evidence |
| --- | --- | --- |
| Full migration chain on disposable PostgreSQL database | VERIFIED | 11 migrations applied; Admin foundation and approval tables checked by deployment |
| API unit and real PostgreSQL integration suite | VERIFIED | 6 files, 50/50 tests passed with isolated `V2_TEST_DATABASE_URL` |
| Admin API client tests | VERIFIED | 1 file, 3/3 tests passed |
| API TypeScript, including bootstrap operator script | VERIFIED | `npm run typecheck -w @vmotiv/api` passed |
| Admin production build | VERIFIED | Vite 7.3.7, 42 modules, production bundle emitted |
| Approval maker-checker | VERIFIED | Independent approval, self-approval denial, execution-once and replay rejection use real PostgreSQL |
| Production serverless ESM boot | VERIFIED | Built `dist/vercel.js` imported under production config and served `health/live` |
| Admin production deployment | NOT_IMPLEMENTED | Domain/project/environment not deployed from this workspace |
| Physical employee invitation email | IMPLEMENTED_NOT_VERIFIED | Outbox + template tested; real rotated Resend configuration not exercised |
| Real Google Admin login and MFA | IMPLEMENTED_NOT_VERIFIED | Backend enforcement and UI implemented; Firebase tenant/MFA setup not exercised |
| Responsive visual browser QA | PARTIALLY_IMPLEMENTED | Responsive CSS/accessibility patterns implemented; authenticated production view not yet tested at all target widths |

Covered security cases include missing/invalid/revoked auth, customer denial, MFA denial, granular-permission denial, real role derivation, branch scope, protected branch/service-area validation, privileged invitation denial, multi-branch approval non-disclosure, hashed invitation, exact-email activation, replay denial, suspension, scoped support reply, safe error contracts and session-revocation invocation.
