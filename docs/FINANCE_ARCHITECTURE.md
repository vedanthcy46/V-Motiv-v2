# Finance architecture

## Status: IMPLEMENTED_NOT_VERIFIED

The Finance workspace is `apps/finance-portal` and is served locally with `npm run dev:finance` on port 3600. Its shared API is mounted at `/api/v2/finance`.

The first vertical slice implements seller acquisition payouts only. It reuses `AcquisitionCase`, `AcquisitionSettlement`, accepted `AcquisitionOffer`, document review state, and branch assignment; it does not duplicate customers, employees, vehicles, or settlement cases.

## Financial control flow

1. Finance prepares one idempotent payout instruction after required acquisition documents are verified.
2. The preparer submits it for approval.
3. A different employee with `finance.payout.approve` approves or places it on hold.
4. A separate employee with `finance.payout.execute` records a real manual bank reference. This changes the instruction to `RECONCILIATION_PENDING`; it does not claim payment success.
5. A third employee with `finance.payout.verify` records controlled evidence and verifies the payout. Only then is the shared acquisition settlement set to `PAYMENT_VERIFIED`.

The existing Operations custody/completion gate continues to require `PAYMENT_VERIFIED` and therefore cannot be bypassed by the Finance UI.

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
