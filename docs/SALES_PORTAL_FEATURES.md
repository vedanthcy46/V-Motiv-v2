# V MOTIV V2 — Sales Executive Portal Feature Specifications

## 1. Overview & Work Queue Module
- **Live KPI Cards**:
  - `Seller Leads To Qualify`: Unassigned or qualifying acquisition leads awaiting first contact.
  - `Follow-ups Due Today`: Scheduled tasks with `dueAt` falling within the current calendar day.
  - `Upcoming Test Drives`: Appointments requested or confirmed for assigned hub locations.
  - `Active Purchase Offers`: Versioned acquisition offers awaiting customer response.
- **My Work Queue**:
  - Quick action table for leads requiring immediate executive intervention.
  - Direct links to seller drawer and buyer details.
- **Notifications Topbar Pill**:
  - Real-time unread count indicator.
  - Instant dropdown displaying unassigned leads, overdue tasks, and pending appointments.

---

## 2. Seller Leads & Acquisition Workflow (Workflow A)
- **Omni-Channel Lead Ingestion**:
  - Automatically captures seller leads from the Customer Mobile App and public website.
  - **Manual Lead Entry Modal**: Allows sales executives to record walk-in or phone enquiries with full vehicle specs, seller details, and initial notes.
- **Lead Qualification**:
  - Status progression: `SUBMITTED` ➔ `QUALIFYING` ➔ `INSPECTION_SCHEDULED` ➔ `OFFER_PENDING` ➔ `OFFERED` ➔ `ACCEPTED` / `REJECTED` / `CANCELLED`.
  - Claim Lead: Atomic self-assignment of unassigned branch leads.
  - Qualify Action: Qualified vs. Disqualified with predefined reason codes and notes.
- **Interactions Timeline**:
  - Multi-channel logging: Phone Call, Email, In-person Meeting, Internal Note.
  - Predefined outcomes: `CONNECTED`, `ATTEMPTED`, `NO_ANSWER`, `RESCHEDULE_REQUESTED`, `INFORMATION_PROVIDED`.
- **Vehicle Inspection Coordination**:
  - Request inspection at Hub or Home.
  - Select preferred date and appointment time slot.
  - Real-time view of inspection summary and approved findings.
- **Acquisition Offers**:
  - Issue versioned purchase offers with validity windows and commercial terms.
  - Record customer decision: `ACCEPTED`, `DECLINED` (with decline reason), or counter-offer.

---

## 3. Buyer Leads & Retail Enquiries (Workflow B)
- **Inbound Stock Enquiries**:
  - Captures customer purchase interest linked directly to exact published inventory listings.
  - Displays customer name, phone, email, and preferred city.
- **Lead Progression**:
  - Status progression: `RECEIVED` ➔ `IN_REVIEW` ➔ `CONTACTED` ➔ `CLOSED`.
  - Direct conversion to Test Drive appointment or Retail Quotation.

---

## 4. Vehicle Inventory Stock (Read-Only)
- **Authoritative Stock Visibility**:
  - Real-time catalogue of approved, published company inventory.
  - Filters by Make, Model, Fuel Type, Transmission, City, and Price.
  - Displays verified odometer reading, registration city, and color.
  - Non-financial view protecting acquisition cost and margin thresholds.

---

## 5. Test Drive Management
- **Booking & Scheduling**:
  - Book showroom hub or home test drive appointments for customers.
  - Specify vehicle, customer, date, and time slot.
- **Status Lifecycle**:
  - `REQUESTED` ➔ `CONFIRMED` ➔ `COMPLETED` / `CANCELLED` / `NO_SHOW`.
  - Executive notes and feedback recording.

---

## 6. Retail Quotations & Vehicle Reservations
- **Itemized Retail Quotations**:
  - Generate official quotations referencing vehicle listings and customer records.
  - Itemized charges: Base price, RTO charges, Insurance, Warranty, Fastag, Accessories.
  - Built-in discount deduction.
  - Printable / printable-ready quotation number format (`VM-QUO-YYYY-XXXX`).
  - Status lifecycle: `DRAFT` ➔ `SUBMITTED` ➔ `APPROVED` ➔ `SENT` ➔ `ACCEPTED` / `DECLINED` / `EXPIRED`.
- **Managerial Discount Exceptions**:
  - Executive can request a price exception with commercial justification.
  - Operations Manager / Admin can approve or reject discount requests.
- **Concurrency-Safe Stock Reservations**:
  - Place a time-bound reservation on a specific vehicle against a customer quotation.
  - Automatically prevents overlapping active reservations on the same vehicle listing.
  - Explicit release reservation mechanism with recorded reason.

---

## 7. Tasks & Follow-ups CRM
- **Structured Action Items**:
  - Task types: `CALL`, `EMAIL`, `MEETING`, `INSPECTION_COORDINATION`, `TEST_DRIVE_FOLLOW_UP`, `QUOTATION_FOLLOW_UP`, `DOCUMENT_FOLLOW_UP`.
  - Priority levels: `LOW`, `NORMAL`, `HIGH`, `URGENT`.
  - Due date tracking with automatic overdue flagging.
  - Completion modal requiring `actualOutcome` documentation.

---

## 8. Customer 360 Profiles
- **Unified Client Directory**:
  - Search customers by name, phone, or email.
  - 360 Drawer consolidating all customer activities:
    - Inbound selling requests.
    - Vehicle purchase enquiries.
    - Test drive appointment history.
    - Verified addresses on file.

---

## 9. Communications (Outbound Transactional Email)
- **Pre-approved Templates**:
  - `ENQUIRY_ACK`: Acknowledgment of vehicle enquiry.
  - `ADDITIONAL_DETAILS_REQUESTED`: Valuation detail request.
  - `INSPECTION_CONFIRMED`: Appointment confirmation.
  - `OFFER_COMMUNICATED`: Purchase offer notification.
  - `QUOTATION_SENT`: Official retail quotation.
  - `TEST_DRIVE_CONFIRMED`: Test drive schedule confirmation.
- **Transactional Queue**:
  - Emails are safely queued into `EmailOutbox` for delivery by the Resend background worker.

---

## 10. Performance & Funnel Reports
- **Real-Time Visual Funnels**:
  - Seller Acquisition Funnel (`SUBMITTED` ➔ `QUALIFYING` ➔ `INSPECTION_SCHEDULED` ➔ `OFFERED` ➔ `ACCEPTED`).
  - Buyer Enquiry Funnel (`RECEIVED` ➔ `IN_REVIEW` ➔ `CONTACTED` ➔ `CLOSED`).
  - Test Drive Conversion Funnel.
  - Total completed inspections and issued offers.
