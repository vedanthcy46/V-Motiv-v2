# V MOTIV V2 — Notification Recipient & Channel Matrix

This matrix governs exactly who receives which notification and through which channels.

| Business Event Trigger | Primary Recipient | Secondary / Fallback Recipient | In-App | Push (Mobile) | Email (Resend) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Inspection Requested** | Operations Dispatch Queue | Branch Operations Manager | **Yes** | Optional (if staff mobile) | **Yes** |
| **Inspector Assigned** | Assigned Inspector | — | **Yes** | **Yes** (Inspector App) | **Yes** |
| **Appointment Changed** | Assigned Inspector, Customer | Assigned Sales Advisor | **Yes** | **Yes** (Customer & Inspector) | **Yes** |
| **Inspector Reassigned** | Previous Inspector & New Inspector | Operations Dispatcher | **Yes** | **Yes** (Both Inspectors) | **Yes** |
| **Report Submitted** | Review Queue / Reviewers | Branch Quality Manager | **Yes** | Optional (Reviewer App) | **Yes** |
| **Reviewer Assigned** | Selected Reviewer | Review Queue Team | **Yes** | Optional | **Yes** |
| **Corrections Required** | Submitting Inspector | Operations Manager | **Yes** | **Yes** (Inspector App) | **Yes** |
| **Corrected Report Resubmitted** | Assigned Reviewer | Review Queue | **Yes** | Optional | **Yes** |
| **Report Approved** | Sales Owner, Pricing Approver | Customer (Valuation ready) | **Yes** | Optional | **Yes** |
| **Report Rejected / Held** | Sales Owner, Operations Manager | Quality Specialist | **Yes** | Optional | **Yes** |
| **Sell Submission** | Seller (Customer) | Sales Lead Queue | **Yes** | **Yes** (Customer App) | **Yes** |
| **Purchase Offer Made** | Seller (Customer) | Assigned Sales Advisor | **Yes** | **Yes** (Customer App) | **Yes** |
| **Purchase Offer Accepted** | Seller (Customer) | Operations, Finance | **Yes** | **Yes** (Customer App) | **Yes** |
| **Payment Dispatched** | Seller (Customer) | Finance Officer | **Yes** | **Yes** (Customer App) | **Yes** |
| **Payment Verified** | Seller (Customer) | Sales Advisor, Branch Lead | **Yes** | **Yes** (Customer App) | **Yes** |
| **Test Drive Requested** | Customer | Hub Sales Queue | **Yes** | **Yes** (Customer App) | **Yes** |
| **Test Drive Confirmed** | Customer | Assigned Hub Advisor | **Yes** | **Yes** (Customer App) | **Yes** |
| **Quotation Issued** | Buyer (Customer) | Assigned Sales Advisor | **Yes** | Optional | **Yes** |
| **Discount Approved / Rejected**| Requesting Sales Advisor | Branch Sales Manager | **Yes** | Optional | Optional |
| **Employee Invitation** | Invited Employee Work Email | Inviting Administrator | — | — | **Yes** |

---

## Channel Rules

1. **In-App (Durable DB Inbox)**:
   - Always generated for authenticated users regardless of device state or network connection.
   - Retained permanently in PostgreSQL until marked read or archived by user.

2. **Push (Expo / FCM v1)**:
   - Dispatched immediately to registered device tokens with active status.
   - Targeted to specific application (`INSPECTOR` vs `CUSTOMER`).
   - Automatically deactivates token upon receiving `DeviceNotRegistered` error from provider.

3. **Email (Resend Transactional)**:
   - Queued in `EmailOutbox` with idempotency key (`notif-${id}-${timestamp}`).
   - Rendered using responsive HTML branding and signed domain reputation (`resend.com` / `vmotiv.in`).
   - Processed by background outbox worker with exponential backoff (up to 6 attempts).
