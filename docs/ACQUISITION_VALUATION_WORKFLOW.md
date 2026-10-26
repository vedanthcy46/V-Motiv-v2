# Acquisition Valuation and Offer Gate

An inspection `APPROVED` status means the report is complete and credible; it does not approve acquisition or payment.

1. An authorized pricing employee creates a valuation against an exact approved inspection report revision.
2. The server records resale estimate, refurbishment, other costs, required margin and recommended purchase price in minor units.
3. The valuation enters `PENDING_APPROVAL`.
4. A different authorized pricing employee approves or rejects it. The creator cannot self-approve.
5. Only a pricing-authorized employee can issue an official acquisition offer, and it must reference an `APPROVED` valuation. The offer cannot exceed the approved recommended purchase amount.
6. Seller acceptance remains a distinct customer action; it is not payment, custody, or acquisition completion.

Database migration: `20261025110000_acquisition_valuation_gate`.

API additions under `/api/v2/sales/seller-leads/:id`:

- `GET /valuations`
- `POST /valuations`
- `POST /valuations/:valuationId/decision`

The existing `POST /offers` now requires `valuationId` and the pricing role.
