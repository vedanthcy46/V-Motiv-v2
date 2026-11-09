# Counter customers and the service job steps

## Counter (walk-in) customers: service and rentals

At the service desk or rental hub, staff enter the customer's name, phone and **Gmail** (both are required).

- **No account yet:** an account is created with that phone and Gmail, so the booking and its history are waiting for them.
  An email is sent with the Play Store link and the instruction to sign in with that Gmail (`PLAY_STORE_URL`, one invitation per account).
- **Account exists** (matched by Gmail or phone): no second account is created. The booking is added to it. A phone and a Gmail
  that belong to two different accounts are refused (`CUSTOMER_IDENTITY_CONFLICT`).
- **First sign-in:** when the customer signs in to the app with Google using that Gmail, they get the pre-created account, with
  all service and rental history. This only ever applies to accounts created by staff at the counter, never to staff accounts.

The booking response carries `customerAccount` (`created`, `existing`, `appInviteEmailed`) and Operations shows it to the advisor.

## Service job steps

Steps open one after another (`services/api/src/service-steps.ts`, enforced by the API and mirrored in the Operations portal):

1. Schedule → 2. Dispatch pickup (doorstep jobs only) → 3. Intake and custody → 4. Estimate and approval →
5. Quality control (only after the estimate is accepted) → 6. Invoice (after QC passes) → 7. Release and handover
(also blocked until the invoice is paid).

A step that is not open yet is greyed out with a lock and says what to finish first. The server answers
`SERVICE_STEP_OUT_OF_ORDER` if it is attempted anyway.

## Accepting an estimate for the customer

The job always waits for the customer. Staff can record the acceptance themselves only after the popup
"Have you contacted the customer about this price?" is confirmed with **Yes, continue**. The API refuses it otherwise
(`CUSTOMER_CONTACT_CONFIRMATION_REQUIRED`) and records the confirmation in the job history.
