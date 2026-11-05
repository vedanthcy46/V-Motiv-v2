# Verified in-person acceptance for walk-in sellers

## Problem
A walk-in seller (lead recorded in the Sales portal) has no app account: the lead hangs off a placeholder user
(`manual-…@vmotiv.internal`, firebase uid `manual-…`) that can never sign in. Seller acceptance is only allowed from the
seller's own signed-in app session, and staff may never accept FOR a seller
(`SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION`). So a walk-in offer could never be accepted.

## Design
The seller proves it is them with a one-time code texted to the phone number on the lead.
1. Staff opens the offer and chooses **Accept in person** (only shown for walk-in leads).
2. `POST /sales/seller-leads/:id/offers/:offerId/in-person-acceptance/start` sends a 6-digit code to the lead's phone.
   The code is never returned to staff; only a salted HMAC is stored.
3. The seller reads it out / types it. `POST .../confirm` with `{ challengeId, code }` records the acceptance exactly like the
   app does (offer ACCEPTED, lead ACCEPTED, acquisition case + document checklist) with audit `source: IN_PERSON_OTP`.

Rules (all unit-tested in `services/api/test/in-person-acceptance.test.ts`):
- Only walk-in sellers; app sellers get `SELLER_MUST_ACCEPT_IN_APP`.
- Code valid 10 minutes, 5 attempts (counted atomically before checking), single use, bound to the offer version
  (a revised offer needs a new code), only the staff member who sent it can confirm (one named witness).
- Resend cooldown 60 s, max 3 codes per offer per hour; a new code retires older ones.
- Fails closed: no SMS provider / no secret => `503 SMS_NOT_CONFIGURED`; SMS failure removes the code (`502`).
- Evidence: table `SellerOfferAcceptanceChallenge` (verified phone, offer version, creator, consumed time) plus the audit
  event (masked phone, witness employee id). Raw phone numbers and codes never appear in audit details or logs.

## Configuration
| Setting | Where | Notes |
|---|---|---|
| `ACCEPTANCE_OTP_SECRET` | Worker secret | 16+ chars, required when `NODE_ENV=production` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Worker secrets | |
| `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID` | Worker var/secret | |
| `SMS_SANDBOX_MODE=true` | staging only | logs the code to the server console (`wrangler tail`); ignored if Twilio is set |

Database: run `npm run db:deploy` for migration `20261105020000_seller_offer_acceptance_challenge` (additive).
India note: transactional SMS normally needs a DLT-registered sender and template. `services/api/src/sms.ts` has a single
`SmsSender` function type, so swapping Twilio for MSG91 (or another provider) is one small function.

## Not built (follow-ups)
- Claiming the lead later in the app by signing in with the verified phone number (the lead stays on the placeholder user).
- Staff-visible "accepted in person" badge in lists (the audit trail and acquisition case exist).
