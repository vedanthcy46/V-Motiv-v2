# Employee notification event catalog

Generated from `services/api/src/employee-notifications/catalog.ts` (policy version 0). A stored `NotificationRoutingPolicy` row with a higher version replaces an entry's delivery settings, but can never widen branch scope, remove a permission gate or disable or downgrade a CRITICAL alert.

**Emitted** says whether the running code raises the event today. "No" means the catalog, routing and tests exist but no business code calls it yet (the note says what is missing). Nothing here is claimed to work end to end unless it is marked Yes.

Total events: 53. Emitted today: 36. Not yet emitted: 17.

| Event | Module | Severity | Channels | Ack | Dedup (min) | Emitted | Title | Link | Note |
|---|---|---|---|---|---|---|---|---|---|
| `LEAD_ASSIGNED` | SALES | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | A seller lead is assigned to you | `/seller-leads/<id>` |  |
| `CUSTOMER_SELL_SUBMITTED` | SALES | ACTION_REQUIRED | IN_APP | no | 10 | Yes | New seller lead in your branch | `/seller-leads/<id>` |  |
| `LEAD_UNASSIGNED_OVERDUE` | SALES | ACTION_REQUIRED | IN_APP, PUSH | yes | 240 | Yes | A seller lead has no owner | `/seller-leads/<id>` | Raised by the SLA detector. |
| `BUYER_ENQUIRY_SUBMITTED` | SALES | ACTION_REQUIRED | IN_APP | no | 10 | Yes | New buyer enquiry | `/buyer-leads/<id>` |  |
| `SALES_FOLLOW_UP_DUE` | SALES | ACTION_REQUIRED | IN_APP | no | 720 | Yes | A follow-up is due | `/tasks` | Raised by the follow-up detector. |
| `INSPECTION_REVIEW_APPROVED` | SALES | ACTION_REQUIRED | IN_APP | no | - | No | The inspection report is approved | `/seller-leads/<id>` | Staff leg of the existing inspection-approved event is not yet separated from the customer one. |
| `ACQUISITION_OFFER_APPROVED` | SALES | INFORMATIONAL | IN_APP | no | - | No | Your offer was approved | `/seller-leads/<id>` |  |
| `ACQUISITION_OFFER_REJECTED` | SALES | ACTION_REQUIRED | IN_APP | no | - | No | Your offer was not approved | `/seller-leads/<id>` |  |
| `TEST_DRIVE_ASSIGNED` | SALES | ACTION_REQUIRED | IN_APP, PUSH | no | - | Yes | You have a test drive | `/test-drives/<id>` |  |
| `SCRAP_REQUEST_SUBMITTED` | SALES | ACTION_REQUIRED | IN_APP | no | 10 | Yes | New scrap request | `/scrap-requests` |  |
| `INSPECTION_REQUESTED` | OPERATIONS | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | An inspection needs an inspector | `/inspections/requests/<id>` |  |
| `ACQUISITION_OFFER_ACCEPTED_STAFF` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | A seller accepted the offer | `/acquisitions/<id>` |  |
| `VEHICLE_STOCK_INWARD` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | A vehicle was received | `/inventory/<id>` |  |
| `VEHICLE_QC_PASSED` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | Quality check done | `/inventory/<id>` |  |
| `VEHICLE_QC_REWORK_REQUIRED` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | Quality check: rework needed | `/inventory/<id>` |  |
| `VEHICLE_LISTING_READY` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | A listing is ready to publish | `/inventory/<id>` |  |
| `REFURBISHMENT_COST_APPROVAL_REQUESTED` | OPERATIONS | ACTION_REQUIRED | IN_APP | yes | - | Yes | A repair cost needs approval | `/refurbishment` |  |
| `SERVICE_REQUEST_SUBMITTED` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | 5 | Yes | New service booking | `/service/jobs/<id>` |  |
| `SERVICE_ESTIMATE_APPROVED` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | Yes | The customer approved the estimate | `/service/jobs/<id>` |  |
| `RENTAL_BOOKING_CONFIRMED` | OPERATIONS | INFORMATIONAL | IN_APP | no | 5 | Yes | A rental booking is confirmed | `/rentals/bookings/<id>` |  |
| `RENTAL_PICKUP_REMINDER` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | 720 | Yes | A rental pickup is coming up | `/rentals/bookings/<id>` | Raised by the rental detector. |
| `RENTAL_BALANCE_OVERDUE` | OPERATIONS | ACTION_REQUIRED | IN_APP, PUSH | yes | 1440 | Yes | A rental balance is overdue | `/rentals/bookings/<id>` | Raised by the rental detector; the amount stays in Finance. |
| `RENTAL_PICKUP_BLOCKED` | OPERATIONS | ACTION_REQUIRED | IN_APP, PUSH | yes | 120 | No | A pickup is blocked | `/rentals/bookings/<id>` | Safe blocker status only: never payment details. |
| `RENTAL_RETURN_OVERDUE` | OPERATIONS | ACTION_REQUIRED | IN_APP, PUSH | yes | 720 | Yes | A rental car is overdue | `/rentals/bookings/<id>` | Raised by the rental detector. |
| `RENTAL_INCIDENT_REPORTED` | OPERATIONS | CRITICAL | IN_APP, PUSH, EMAIL | yes | - | Yes | A rental incident was reported | `/rentals/bookings/<id>` |  |
| `VEHICLE_MAINTENANCE_BLOCKING` | OPERATIONS | ACTION_REQUIRED | IN_APP | no | - | No | Maintenance is blocking a car | `/rentals/fleet/<id>` |  |
| `FINANCE_READY_FOR_PAYMENT` | FINANCE | ACTION_REQUIRED | IN_APP | yes | - | Yes | A seller payout is ready to prepare | `/seller-settlements` |  |
| `FINANCE_PAYOUT_APPROVAL_REQUESTED` | FINANCE | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | A payout needs your approval | `/payouts/<id>` | The person who prepared it is excluded. |
| `FINANCE_PAYOUT_APPROVED` | FINANCE | ACTION_REQUIRED | IN_APP | no | - | Yes | A payout was approved | `/payouts/<id>` |  |
| `FINANCE_PAYOUT_VERIFIED` | FINANCE | INFORMATIONAL | IN_APP | no | - | Yes | A payout was verified | `/payouts/<id>` |  |
| `PAYMENT_RECONCILIATION_REQUIRED` | FINANCE | ACTION_REQUIRED | IN_APP, PUSH | yes | - | No | A payment needs reconciliation | `/payments/<id>` | Needs a hook in the payment verification code. |
| `PAYMENT_EXCEPTION` | FINANCE | CRITICAL | IN_APP, PUSH, EMAIL | yes | - | No | A payment exception needs attention | `/payments/<id>` |  |
| `REFUND_APPROVAL_PENDING` | FINANCE | ACTION_REQUIRED | IN_APP | yes | - | No | A refund needs approval | `/refunds/<id>` |  |
| `RENTAL_DEPOSIT_RELEASE_PENDING` | FINANCE | ACTION_REQUIRED | IN_APP | no | - | No | A rental deposit is ready to release | `/payments/<id>` |  |
| `PAYMENT_DISPUTE` | FINANCE | CRITICAL | IN_APP, PUSH, EMAIL | yes | - | No | A payment was disputed | `/payments/<id>` |  |
| `INSPECTION_ASSIGNED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | no | - | Yes | New inspection assigned | `/inspections/<id>` |  |
| `INSPECTION_REASSIGNED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | no | - | Yes | An inspection was changed | `/inspections/<id>` |  |
| `INSPECTION_APPOINTMENT_CHANGED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | no | - | Yes | An appointment changed | `/inspections/<id>` |  |
| `INSPECTION_CANCELLED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | no | - | No | An inspection was cancelled | `/inspections/<id>` |  |
| `INSPECTION_REWORK_REQUIRED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | A report needs corrections | `/inspections/<id>` |  |
| `REINSPECTION_REQUESTED` | INSPECTION | ACTION_REQUIRED | IN_APP, PUSH | yes | - | No | A re-inspection is needed | `/inspections/<id>` |  |
| `INSPECTION_REPORT_SUBMITTED` | INSPECTION | ACTION_REQUIRED | IN_APP | no | 5 | Yes | A report is ready for review | `/reviews/<id>` |  |
| `INSPECTION_REPORT_RESUBMITTED` | INSPECTION | ACTION_REQUIRED | IN_APP | no | 5 | Yes | A corrected report is ready | `/reviews/<id>` |  |
| `DISCOUNT_APPROVAL_REQUESTED` | ADMIN | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | A discount needs approval | `/approvals/<id>` | The requester is excluded. |
| `ACQUISITION_OFFER_APPROVAL_REQUESTED` | ADMIN | ACTION_REQUIRED | IN_APP, PUSH | yes | - | Yes | A seller offer needs approval | `/approvals/<id>` |  |
| `EMPLOYEE_INVITE_APPROVAL` | ADMIN | ACTION_REQUIRED | IN_APP, EMAIL | yes | - | No | A privileged invitation needs approval | `/approvals/<id>` |  |
| `ROLE_ESCALATION_REQUEST` | ADMIN | ACTION_REQUIRED | IN_APP, EMAIL | yes | - | No | A role change needs approval | `/approvals/<id>` |  |
| `POLICY_CHANGE_APPROVAL` | ADMIN | ACTION_REQUIRED | IN_APP, EMAIL | yes | - | No | A policy change needs approval | `/approvals/<id>` |  |
| `SENSITIVE_EXPORT_APPROVAL` | ADMIN | ACTION_REQUIRED | IN_APP, EMAIL | yes | - | No | A data export needs approval | `/approvals/<id>` |  |
| `PARTNER_APPROVAL` | ADMIN | ACTION_REQUIRED | IN_APP | yes | - | No | A partner needs approval | `/approvals/<id>` | No partner module exists in V2 yet. |
| `SECURITY_INCIDENT` | ADMIN | CRITICAL | IN_APP, PUSH, EMAIL | yes | - | Yes | A security incident was raised | `/incidents/<id>` | Raised through raiseSecurityIncident(). |
| `INTEGRATION_OUTAGE` | ADMIN | CRITICAL | IN_APP, EMAIL | yes | 30 | Yes | An integration is failing | `/health` | Raised by the outbox health check (dead or stuck events). |
| `CRITICAL_ESCALATION_UNRESOLVED` | ADMIN | CRITICAL | IN_APP, PUSH, EMAIL | yes | 60 | Yes | A critical alert is still unresolved | `/incidents` | Raised by the escalation engine. |
