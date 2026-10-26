# V MOTIV V2 — Domain Event Notification Catalog

Every notification in the V MOTIV platform originates from a strongly-typed domain event.

| Domain Event Key | Category | Default Priority | Deep Link / Action URL | In-App & Push Summary | Transactional Email Template |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `INSPECTION_REQUESTED` | `INSPECTION` | `NORMAL` | `/operations` | New inspection request pending dispatch | `inspection-requested-v1` |
| `INSPECTION_ASSIGNED` | `INSPECTION` | `HIGH` | `vmotiv://inspections/:id` | New Inspection Assigned: [Vehicle Title] | `inspection-assigned-v1` |
| `INSPECTION_REASSIGNED` | `INSPECTION` | `HIGH` | `vmotiv://inspections/:id` | Inspection Reassigned: [Vehicle Title] | `inspection-assigned-v1` |
| `INSPECTION_APPOINTMENT_CHANGED`| `INSPECTION` | `NORMAL` | `vmotiv://inspections/:id` | Appointment Rescheduled: [Date & Time] | `inspection-assigned-v1` |
| `INSPECTION_REPORT_SUBMITTED` | `INSPECTION` | `NORMAL` | `/inspection-review?reportId=:id` | Report Submitted: [Vehicle Title] | `inspection-requested-v1` |
| `INSPECTION_REVIEWER_ASSIGNED` | `INSPECTION` | `NORMAL` | `/inspection-review?reportId=:id` | Assigned for Review: [Vehicle Title] | `inspection-requested-v1` |
| `INSPECTION_REWORK_REQUIRED` | `INSPECTION` | `HIGH` | `vmotiv://inspections/:id` | Corrections Requested: Revision v[N] | `inspection-rework-v1` |
| `INSPECTION_REPORT_RESUBMITTED`| `INSPECTION` | `NORMAL` | `/inspection-review?reportId=:id` | Corrected Report Resubmitted: v[N] | `inspection-requested-v1` |
| `INSPECTION_REVIEW_APPROVED` | `INSPECTION` | `NORMAL` | `/inspection-review?reportId=:id` | Inspection Certified & Approved | `inspection-approved-v1` |
| `INSPECTION_REVIEW_REJECTED` | `INSPECTION` | `NORMAL` | `/operations` | Inspection Report Rejected | `operational-escalation-v1`|
| `CUSTOMER_SELL_SUBMITTED` | `SELLING` | `NORMAL` | `vmotiv://activity` | Selling Request Received [Ref Code] | `selling-requested-v1` |
| `OFFER_COMMUNICATED` | `SELLING` | `HIGH` | `vmotiv://activity` | Official Purchase Offer Available | `offer-communicated-v1` |
| `OFFER_ACCEPTED` | `SELLING` | `HIGH` | `vmotiv://activity` | Purchase Agreement Confirmed | `offer-accepted-v1` |
| `OFFER_DECLINED` | `SELLING` | `NORMAL` | `vmotiv://activity` | Purchase Offer Declined | `operational-escalation-v1`|
| `PAYMENT_DISPATCHED` | `SELLING` | `URGENT` | `vmotiv://activity` | Direct Purchase Payment Initiated | `payment-verified-v1` |
| `PAYMENT_VERIFIED` | `SELLING` | `URGENT` | `vmotiv://activity` | Payment Successfully Transferred | `payment-verified-v1` |
| `BUYER_ENQUIRY_SUBMITTED` | `BUYING` | `NORMAL` | `vmotiv://activity` | Vehicle Enquiry Recorded | `purchase-enquiry-v1` |
| `TEST_DRIVE_REQUESTED` | `BUYING` | `NORMAL` | `vmotiv://activity` | Test Drive Booking Requested | `test-drive-requested-v1` |
| `TEST_DRIVE_CONFIRMED` | `BUYING` | `HIGH` | `vmotiv://activity` | Test Drive Confirmed for [Date] | `test-drive-requested-v1` |
| `RETAIL_QUOTATION_ISSUED` | `BUYING` | `NORMAL` | `vmotiv://activity` | Official Retail Vehicle Quotation | `retail-quotation-v1` |
| `RESERVATION_PLACED` | `BUYING` | `HIGH` | `vmotiv://activity` | Vehicle Reservation Placed | `transactional-v1` |
| `RESERVATION_CONFIRMED` | `BUYING` | `HIGH` | `vmotiv://activity` | Vehicle Reservation Active | `transactional-v1` |
| `LEAD_ASSIGNED` | `SALES` | `NORMAL` | `/sales` | Lead Assigned to Advisor | `transactional-v1` |
| `DISCOUNT_APPROVAL_REQUESTED` | `SALES` | `HIGH` | `/admin/approvals` | Discount Approval Requested | `operational-escalation-v1`|
| `DISCOUNT_APPROVAL_DECIDED` | `SALES` | `HIGH` | `/sales` | Discount Decision: [Approved/Rejected] | `transactional-v1` |
| `EMPLOYEE_INVITED` | `SYSTEM` | `HIGH` | `/accept-invitation?token=:t` | Invitation to Join V MOTIV | `employee-invitation-v1` |
