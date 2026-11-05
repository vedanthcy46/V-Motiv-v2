# Finance architecture

## Status: IMPLEMENTED_NOT_VERIFIED

The Finance workspace is `apps/finance-portal` and is served locally with `npm run dev:finance` on port 3600. Its shared API is mounted at `/api/v2/finance`.

The first vertical slice implements seller acquisition payouts only. It reuses `AcquisitionCase`, `AcquisitionSettlement`, accepted `AcquisitionOffer`, document review state, and branch assignment; it does not duplicate customers, employees, vehicles, or settlement cases.

## Financial control flow

A seller payout takes three steps and at least two people.

1. **Send for approval.** Finance prepares the payout (beneficiary, account, method) once the acquisition documents are verified. Preparing it is the request for approval; there is no separate "draft" to submit.
2. **Approve.** A different employee with `finance.payout.approve` approves it, or puts it on hold with a note.
3. **Mark as paid.** An employee with `finance.payout.execute` who did not prepare the payout records the bank reference / UTR (and, optionally, a link to the bank advice). This records the transfer and confirms it in one step: the settlement becomes `PAYMENT_VERIFIED`, and Operations, Sales and the seller are notified.

Rules that still hold: the preparer cannot approve or pay their own payout, a bank reference can only be used once, and the bank statement import matches the reference afterwards as the independent check. Refunds work the same way (request, approve, mark as paid).

The earlier chain (prepare, submit, approve, record execution, confirm reconciliation) needed four different people. Its endpoints (`/submit`, `/execute`, `/reconcile`) remain so that payouts already in flight can be finished: releasing may be done by the approver, and confirming must be done by someone other than the preparer and the person who recorded the transfer.

The existing Operations custody/completion gate continues to require `PAYMENT_VERIFIED` and therefore cannot be bypassed by the Finance UI.

Finance screens refresh by themselves at each hand-off: payout changes, newly accepted offers and verified documents all signal the Finance portal.

## New records

- `FinancePayoutInstruction`: immutable-history-oriented payout lifecycle, idempotency key, masked beneficiary identifier, makers/checkers, version, and bank reference.
- `FinancePaymentEvidence`: private evidence reference and observed timestamp, linked to the verifier and payout.

Migration: `services/api/prisma/migrations/20261026140000_finance_seller_payouts`.

## Permissions

The `FINANCE` role receives read/prepare permissions only. High-risk approval, execution, and verification permissions are deliberately separate and must be assigned by an administrator using the existing direct employee permission mechanism.

## Provider status

No bank or payment-provider integration is implemented. Execution is explicitly a controlled manual-bank record; verified status requires separate evidence. No fake payment provider response is generated.

## Not yet implemented

Buyer collections, partial receipts/allocations, refunds, expense payments, bank statement imports, double-entry ledger, invoices, and profitability are not implemented by this first vertical slice.
