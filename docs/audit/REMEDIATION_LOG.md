# Remediation Log

## VM-AUDIT-001 (P0) Payment verification bypass in production — FIXED, unit-verified
- Where: `services/api/src/rental-store.ts` (`verifyPayment`, `verifyBalancePayment`), `services/api/src/service-store.ts` (booking create ~L1634, service payment verify ~L3543).
- Problem: the signature check was skipped when `paymentGateway` was `DEMO|TEST|CASH|OFFLINE`, or `gatewayPaymentId` started `pay_demo_`/`pay_srv_`/`pay_bal_`, or `gatewaySignature` started `demo_`. All are client-controlled, so a signed-in customer could mark a rental/service payment VERIFIED without paying. The secret also fell back to `'dev_secret_key_12345'`.
- Fix: new `src/payment-signature.ts::assertGatewayPaymentSignature`. In `NODE_ENV=production`: `RAZORPAY_KEY_SECRET` mandatory (else 503, fail closed), all three proof fields required, constant-time HMAC compare, no demo shortcuts. Non-production behaviour unchanged so fixtures/tests still work. `wrangler.jsonc` sets `NODE_ENV=production`, so the Workers deploy is covered.
- Tests: `test/payment-signature.test.ts` (new). Full API suite: 186 pass.

## VM-AUDIT-002 (P0) Webhook secrets defaulted / signature skipped — FIXED, unit-verified
- `rental-router.ts` Razorpay webhook: default secret `dev_webhook_secret_key_12345`; HMAC over `JSON.stringify(req.body)` (not raw bytes), enforced only in production; it then passed the *webhook* signature to `verifyPayment`, which could never match the checkout HMAC.
- `connect-router.ts`: default secret `vmotiv_connect_secret_default`; unsigned requests accepted.
- Fix: `assertWebhookSignature` (secret and signature mandatory in production, constant-time, raw bytes). Raw body captured in `app.ts` (`express.json` `verify`) and in the Cloudflare bridge `worker-cf.ts` (which pre-parses JSON and so bypasses Express parsing). The rental webhook derives the checkout-style HMAC server-side from `RAZORPAY_KEY_SECRET` after authenticating the event.
- Behaviour change: Connect bad signature is now 400 (was 401); `connect-api.test.ts` #10 updated to set `CONNECT_WEBHOOK_SECRET`.
- NOT verified: live Razorpay webhook delivery on Cloudflare (needs staging plus `RAZORPAY_WEBHOOK_SECRET` / `RAZORPAY_KEY_SECRET` via `wrangler secret put`).

## VM-AUDIT-003 (P1) Website fabricated service/rental confirmations — FIXED, typecheck-verified
- `apps/customer-web/src/components/ServiceModal.tsx` and `RentalsModal.tsx` generated `SRV-`/`RNT-<year>-<random>` and showed success with no API call.
- Fix: fabricated reference removed; now shows an honest "not available on the website yet, nothing was created" error. A real web booking flow remains an integration gap (no web API client for service/rental).

## VM-AUDIT-004/005 (P1) Recorded payment amounts never checked against what the gateway captured — FIXED (unit-tested with mocked gateway), NOT live-verified
- Problem: a valid Razorpay HMAC only proves Razorpay signed an `order|payment` pair. Nothing compared the captured amount, currency, status or order to the booking. A customer could pay Rs 1 on any merchant order and (a) service balance: claim any `amountPaise` and be recorded as paying it (`service-store.ts::verifyCustomerGatewayPayment`), (b) service booking and rental advance/balance: be marked paid in full with server-derived amounts (`service-store.ts` booking create, `rental-store.ts::verifyPayment`, `verifyBalancePayment`). A payment id could also settle several service requests.
- Fix: new `src/razorpay-gateway.ts::assertCapturedAmount` (production only): server-to-server `GET /v1/payments/{id}` with 8s timeout; requires status `captured`, currency INR, `order_id` equal to the claimed order, amount >= expected (exact for service booking and a client-claimed service amount). Service balance now records the gateway-captured amount, not the client claim; a payment id already used on another service request returns 409 `PAYMENT_ALREADY_USED`.
- Tests: `test/razorpay-gateway.test.ts`; API suite 191 pass / 23 skipped; typecheck clean.
- Requires production secret `RAZORPAY_KEY_ID` (in addition to `RAZORPAY_KEY_SECRET`); missing keys fail closed with 503.
- REMAINING GAP: the API never creates Razorpay orders. `gatewayOrderId` comes from the client, so the order is not bound to a specific booking/amount at creation time. Proper fix: server-side `POST /v1/orders` (amount from booking, `receipt` = booking id), store the order id on a PENDING payment record, and verify against that stored order. Needs Razorpay keys and a staging test. The fetch also runs inside the DB transaction for rental/service-booking paths (bounded by 8s timeout vs 15s tx timeout); moving it before the transaction is a worthwhile follow-up.
- Also unverified: whether the mobile app performs real Razorpay checkout or still sends demo values (`ServiceRequestDetailsScreen.tsx` mentions Razorpay; client side not inspected). If it sends demo values, production payments will now be rejected until real checkout is wired.
- UPDATE (client inspected): the customer mobile app has **no real Razorpay checkout**. `RentalCheckoutScreen.tsx:374-379` and `RentalBookingDetailsScreen.tsx:113-118` hardcode `pay_demo_<timestamp>` / `demo_sig_verified_vmotiv` and offer a "Sandbox / Demo Gateway" option; no Razorpay SDK is in `apps/customer-mobile/package.json`. Consequence: with VM-AUDIT-001/004 fixed, rental payments from the app are rejected in production (correct), and the previous "paid" rentals were never real money. Production payments need: server-side order creation, Razorpay checkout in the app, then verification. This is the top blocker for payments going live.

## Sandbox / demo payment gateway (explicit, guarded) for testing rental and service
- Why: after VM-AUDIT-001 the app's demo payments (`pay_demo_*`, `DEMO` gateway) are rejected on any deployment with `NODE_ENV=production`, which includes the Cloudflare Worker.
- Switch: `PAYMENT_SANDBOX_MODE=true` (`payment-signature.ts::isSandboxPaymentsEnabled`). Local dev/tests: always on, as before. Deployed worker: on only when the variable is set AND `RAZORPAY_KEY_ID` is not a live key (`rzp_live_...`). Demo-shaped proofs are accepted; any real-looking proof is still HMAC-verified, and Razorpay amount checks are skipped only for demo proofs.
- `GET /api/v2/payments/config` returns `{ sandbox }`. The app shows a "TEST MODE" banner on rental checkout and the service pay-balance sheet when true.
- `services/api/wrangler.jsonc` now has an `env.staging` (`vmotiv-api-staging`, `PAYMENT_SANDBOX_MODE=true`). Deploy with `wrangler deploy --env staging`; set that worker's secrets separately (`DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, ...). Origins there are copied from production; change them for a staging website/app if you have one.
- DANGER: point the staging worker at a SEPARATE database. Sandbox payments create bookings/service requests marked paid with no money received; on the production database they would look like real revenue.
- Production worker (`vmotiv-api`) is unchanged: sandbox off, demo payments rejected.
- Tests: 203 API tests pass (3 new sandbox tests).
