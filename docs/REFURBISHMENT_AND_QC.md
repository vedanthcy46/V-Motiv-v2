# Refurbishment and quality control

`RefurbishmentWorkOrder` is created only against a canonical internal stock unit. A work order moves through draft, independent cost approval, approved, in progress, and completed states. Starting requires an approved cost decision; completion moves stock to `QC_PENDING`, not to listing readiness.

Cost approval is a separate record. An approver cannot approve their own request. The current permitted approver set is Pricing, Admin, or Super Admin; ordinary Operations and Inventory staff cannot decide it.

`QualityControlReport` is an independent record and is never an amendment to the acquisition inspection. QC may start only once stock is `QC_PENDING`. Where linked to a work order, its author cannot perform the QC review. A pass moves stock to `LISTING_PREPARATION`; rework returns it to `REFURBISHMENT_PENDING`; failure puts it on hold. None of these actions publish a listing.
