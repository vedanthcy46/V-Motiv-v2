# Service estimate, decline and cancellation workflow

Status: implemented; API logic covered by unit tests with a mocked database (`services/api/test/service-estimate-workflow.test.ts`); typechecks clean (API, mobile, Operations portal). Not exercised against a real database, device or the live portal.

## Gaps found
1. Cancelling a service left the estimate `SENT_TO_CUSTOMER`, so the app kept offering "Review & Approve" on a cancelled job.
2. `respondToEstimate`, `approveServiceEstimateByStaff` and `createEstimate` never checked the request state: approving after cancellation flipped the request from `CANCELLED` back to `ESTIMATE_APPROVED`; staff could approve a superseded estimate; estimates could be issued on cancelled jobs.
3. After a decline the Operations estimate tab showed the old estimate and no form (it only rendered the form when no estimate existed), so staff could not revise. There was no negotiate or cancel path, and the customer could not cancel once an estimate was pending or declined.
4. Expiry (`validUntil`) was never enforced.
5. Portal types used `PENDING_APPROVAL/REJECTED` while the API uses `SENT_TO_CUSTOMER/DECLINED/SUPERSEDED`, which is why the portal offered "Approve" for any non-approved estimate.
6. Invented prices: the portal pre-filled a fake estimate (labour 1500, oil 2800, filter 450) and a default customer note, and the API silently added a Rs 1,500 "Periodic Inspection" line when a request had no items.

## Workflow now
- **Cancel (customer or staff):** live estimates are voided (`SUPERSEDED`, "Voided: service request cancelled"); dues cleared and payment status `CANCELLED` / `CANCELLED_REFUND_DUE` (earlier change). The app shows the estimate as WITHDRAWN with no actions; Operations shows "Withdrawn (cancelled)" and the reason.
- **Estimate sent:** customer can approve or decline (optional reason: too expensive / second opinion / not needed now / other, plus a note). Expired estimates cannot be answered; the customer is told a new estimate is coming.
- **Declined:** request goes to `ESTIMATE_REJECTED`. Operations gets the reason and three actions: Revise & Resend (editor prefilled from the last version; the new version supersedes the declined one and stays in history), Customer Agreed (records approval after a call), or Cancel Service. The customer can reconsider and approve the same estimate until a revised one is issued, or cancel the service from the app (also allowed while an estimate is pending).
- **Guards:** no estimate actions on cancelled/completed/paid/returned jobs; staff approval only on the live estimate; empty estimates are rejected (no invented line items).

## Per-line approval (built)
- Estimate lines are marked **Required** or **Recommended** by the advisor (Operations estimate editor; default Required for the first line, Recommended for added lines).
- In the app the customer can switch recommended lines off while approving; a live "Your Total" preview shows the effect. Required lines cannot be deferred.
- The API (`respondToEstimate`, new optional `declinedItemIds`) validates the ids, rejects deferring required lines or every line, recalculates subtotal/GST/total in integer paise from the kept lines (`services/api/src/estimate-totals.ts`, also used by `createEstimate`) and stores them on the estimate, so invoices and balances (built from the approved estimate) follow the approved scope. Deferred lines are flagged `isApprovedByCustomer=false`, the history event records "approved N of M items" with approved vs quoted total, and Operations shows each line as REQUIRED / RECOMMENDED / DEFERRED BY CUSTOMER.
- Staff in-person approval always approves the full estimate; to change scope, revise the estimate.
- Tests: `service-estimate-workflow.test.ts` (totals, deferral, required-line guard, unknown ids) and mobile `estimate-totals.test.ts`.
- Work orders: when a work order is created, the approved estimate lines are appended to its instructions ("APPROVED SCOPE"), and deferred lines under "DEFERRED BY CUSTOMER - DO NOT PERFORM" (`formatApprovedScope`).
- Vehicle return: Operations shows a "Vehicle return required" alert on a cancelled job whose car had been checked in at the workshop.
- Not verified: invoice generation end-to-end against a real database after a partial approval. The return alert is based on the existence of a check-in custody record, not on a recorded return handover (no such record type exists yet).

## Recommended next (not built)
1. Cancellation policy: keep a diagnostic/inspection fee when the customer declines after diagnosis, and automate the refund of the rest (today Finance refunds manually).
2. Photo/video evidence on each estimate line (what is worn and why); the biggest trust driver for declined-estimate conversion.
3. Reminders: nudge the customer before `validUntil` and alert Operations if a declined or pending estimate sits untouched for N hours.
4. Record the return handover as a custody record so the return alert can clear itself, and capture a customer-visible cancellation reason code.

## Completed jobs are read-only (like a settled rental)
- API: `assertServiceJobOpen` rejects (409 `SERVICE_JOB_COMPLETED_LOCKED` / `SERVICE_JOB_CANCELLED_LOCKED`) schedule, dispatch, custody check-in/return, diagnosis, estimate create/approve, work order create/update, QC, invoice generation and staff payment recording on a COMPLETED or CANCELLED job. Finance verification of an existing payment record and the customer-side read endpoints are unchanged.
- Operations portal: "completed" now means status COMPLETED/DELIVERED (previously it also required an approved estimate and a zero balance, so jobs without an estimate never locked). Schedule, dispatch, intake, estimate, QC, invoice generation, payment recording and handover all show a locked/read-only state; the cancel button is hidden.
- Tests: `service-estimate-workflow.test.ts` ("completed and cancelled jobs are locked for staff").
