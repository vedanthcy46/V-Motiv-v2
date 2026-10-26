# Inventory stock inward

## Canonical record

`VehicleStockUnit` is the canonical internal stock record. It is linked one-to-one with `AcquisitionCase`, enforced by a unique database constraint. The stock code is deterministically generated as `VM-STK-` plus the immutable acquisition case reference fragment, so retried stock-inward requests do not produce a second physical vehicle record.

## Gate

Only an Operations-authorized employee may call stock inward, and only after `AcquisitionCase.status = COMPLETED`. Completion itself requires verified/waived documents, a Finance-owned `PAYMENT_VERIFIED` settlement, and a received physical handover with documents. A branch-scoped Operations employee cannot inward a vehicle into an unassigned branch.

## Safety boundaries

- A stock unit starts at `RECEIVED`.
- Acquisition cost is retained internally and is excluded from `GET /api/v2/operations/inventory`.
- A stock unit is not a public `Vehicle` or `VehicleListing`.
- No stock-inward action can publish, reserve, or sell a car.
- A duplicate inward attempt is rejected with `STOCK_INWARD_ALREADY_CREATED`.

The next lifecycle modules are refurbishment cost control and independent QC. Only later steps may establish a vehicle/listing relationship and request publication.
