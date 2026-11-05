# Acquisition hand-offs: who is told, and what must be complete

When a customer accepts an offer, the car passes through Sales, Operations, Finance and the Listing Studio. Every
hand-off now tells the next team, and every list updates without a manual refresh.

## Who is notified

| Event | Notified | Opens |
| --- | --- | --- |
| Customer accepts the offer | Operations manager, inventory manager, the assigned salesperson | Operations → Acquisitions |
| All documents verified (ready for payment) | Finance (role and `finance.settlement.prepare`) | Finance → Seller settlements |
| Payout sent for approval | Finance approvers | Finance → Seller settlements |
| Payout approved | The preparer and holders of `finance.payout.execute` | Finance → Seller settlements |
| Vehicle received | Operations and inventory | Operations → Inventory |
| Repair cost needs approval | Pricing approver, admin | Operations → Refurbishment |
| Quality check passed / failed | Listing executive, operations / inventory | Studio / Refurbishment |
| Listing prepared | Pricing approver, listing executive, operations | Operations → Publication |

Notifications are written after the database transaction commits, so a rolled-back change never sends one. The
Finance and Operations portals show them in the same bell as the other portals (`StaffNotificationBell`).

## Realtime

Finance and Operations watch the `finance` and `dispatch` domains. The change probes in `services/api/src/pulse.ts`
cover documents, settlements, payouts, work orders, cost approvals, quality control and listings, so a change made by
another team appears on the open screen within seconds. A background refresh in Operations loads only the data the
open tab shows; opening a tab refreshes it.

## Documents

A document can go straight from REQUESTED or RECEIVED to VERIFIED. Operations has a one-click **Verify** button per
document and **Verify N selected** for several. Rejecting or waiving still opens the dialog (a reason is needed).

## Walk-in cases

Cases created by staff without a customer lead (walk-ins) are visible to Operations and Finance by branch and handover,
not only through the lead assignment.

## Listing completeness

A car cannot be published, and a live listing cannot be saved, without:

- a title (3+ characters), a retail price, at least 3 photos, exterior colour, registration number,
  a customer-facing condition summary, and the branch where it is kept.

The rules live in `services/api/src/listing-readiness.ts`. The server returns `listingGaps` with each stock unit; the
Listing Studio shows the missing items, and the Publish dialog lists them instead of failing.

## Editing a live listing

`PATCH /operations/inventory/:id/listing` edits title, price, colour, condition, registration, features and the
**full ordered photo list** (photos left out are removed, new ones added) while the car stays published. A reserved car's
price is locked. The customer-facing snapshot is updated in the same transaction.

## Conflicts

If a colleague changed a record first, the portal says so in plain words and reloads the latest data.

## Policy left unchanged

Taking custody of the car still requires the seller payment to be verified. That is a business decision, not a defect;
changing it would let a car be collected before the seller is paid.
