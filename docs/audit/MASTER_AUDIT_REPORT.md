# Master Audit Report — PARTIAL (first pass)

**Scope honesty.** This pass covered repository discovery, a targeted fake-data and payment-security sweep, and fixes for the three confirmed defects in `REMEDIATION_LOG.md`. Mobile/web/backend performance, DB index review, IDOR testing and cross-portal workflow tracing are **not done**; they need measurement (devices, a staging DB) and a much larger read. The reports MOBILE/WEB/BACKEND_PERFORMANCE, DATABASE, SECURITY, WORKFLOW_INTEGRATION, PAYMENT_FINANCE, SOURCE_OF_TRUTH_MATRIX, HARDCODED_VALUES and DEPLOYMENT_READINESS are not yet written.

## Confirmed findings
| ID | Sev | App | Finding | Status |
|---|---|---|---|---|
| VM-AUDIT-001 | P0 | API | Client-controlled demo flags bypass payment signature | FIXED (unit-tested) |
| VM-AUDIT-002 | P0 | API | Default webhook secrets; webhook not verified against raw bytes | FIXED (unit-tested) |
| VM-AUDIT-003 | P1 | Web | Fabricated booking/reservation codes | FIXED |
| VM-AUDIT-004 | P1 | API | Service payment verify trusted client amount | FIXED (unit-tested, not live) |
| VM-AUDIT-005 | P1 | API | Rental/service verification never confirmed amount/currency with Razorpay | FIXED (unit-tested, not live); server-side order creation still missing |
| VM-AUDIT-006 | P2 | API | `Math.random` business identifiers: fleet number (`rental-store.ts:2397`, ops panel :645), request numbers (`service-store.ts:1561,2238,3332`); collision risk, no unique-retry seen | DISCOVERED |
| VM-AUDIT-007 | P2 | API | Walk-in customers created with synthetic `walkin_*` Firebase UIDs/emails (`service-store.ts:2198`, `rental-store.ts:2712`) | DISCOVERED (needs review) |

## Suspected, not measured (Cloudflare Workers specific)
- `express-rate-limit` uses its default in-memory store (`app.ts:280`): per-isolate, so rate limits are largely ineffective on Workers. Use Cloudflare rate-limiting rules or KV/Durable Objects.
- `express.json({limit:'50mb'})` and the bridge buffer whole bodies; Workers memory is 128MB.
- `socket.io` (`connect-realtime.ts`), `sharp`, and the in-memory `memorySignalsByCall` map in `connect-store.ts` will not work or persist across isolates.
- Prisma over Neon HTTP (`poolQueryViaFetch`): confirm interactive `$transaction` atomicity before trusting rental holds and payment allocation in production.
- Email outbox draining (`drainOutbox`) needs a Cron Trigger; `wrangler.jsonc` has none and `EMAIL_DELIVERY_ENABLED` is `false`.
- No CI or secret scanning; stray artifacts in the working tree (`dist*`, `.vercel-entry-check`, 547KB `postgres-local.log`).

## Tests available
API: vitest, 186 pass / 23 skipped (5 skipped files, reasons not yet investigated). Customer web: 14 pass. Mobile: 3 test files, not run. Portals: effectively untested.

## Next steps (priority)
1. Staging test of payment and webhook with Razorpay test keys (VM-AUDIT-004/005).
2. Verify Neon-over-fetch transaction semantics.
3. IDOR / authorization test pass per portal.
4. Measure: mobile profile, endpoint latency, `EXPLAIN` on rental availability and list queries.
5. Add CI (typecheck + vitest) and Cron Trigger config.
