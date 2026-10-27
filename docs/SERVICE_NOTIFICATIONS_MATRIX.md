# V MOTIV V2 — Service Lifecycle Notifications Matrix

## 1. Overview
Automotive service requires continuous, transparent customer communication to eliminate uncertainty. The centralized notification engine dispatches events across in-app notification center, Expo push notifications, and transactional emails (via Resend).

---

## 2. 17 Lifecycle Notification Events

| Event Type | Trigger | Recipients | Deep Link / Action URL | In-App / Push Title |
| :--- | :--- | :--- | :--- | :--- |
| `SERVICE_REQUEST_SUBMITTED` | Customer submits booking | Customer, Service Advisor | `vmotiv://service-requests/:id` | Car Service Request Received |
| `SERVICE_APPOINTMENT_SCHEDULED` | Advisor confirms appointment | Customer | `vmotiv://service-requests/:id` | Service Appointment Scheduled |
| `SERVICE_PICKUP_DISPATCHED` | Logistics dispatches driver | Customer | `vmotiv://service-requests/:id` | Pickup Driver En Route |
| `SERVICE_VEHICLE_ARRIVED` | Car arrives at hub | Customer | `vmotiv://service-requests/:id` | Vehicle Arrived at Hub |
| `SERVICE_CUSTODY_CHECKIN` | Inward custody sheet verified | Customer | `vmotiv://service-requests/:id` | Vehicle Safely Checked In |
| `SERVICE_DIAGNOSIS_COMPLETED` | Tech records scan findings | Service Advisor | `/ops/service/jobs/:id` | Technical Diagnosis Completed |
| `SERVICE_ESTIMATE_ISSUED` | Advisor creates quote | Customer | `vmotiv://service-requests/:id` | Estimate Ready for Review |
| `SERVICE_ESTIMATE_APPROVED` | Customer approves quote | Service Advisor, Tech | `/ops/service/jobs/:id` | Service Estimate Approved |
| `SERVICE_ESTIMATE_DECLINED` | Customer declines quote | Service Advisor | `/ops/service/jobs/:id` | Service Estimate Declined |
| `SERVICE_WORK_STARTED` | Tech starts work order | Customer | `vmotiv://service-requests/:id` | Servicing & Repairs Underway |
| `SERVICE_WORK_COMPLETED` | Tech finishes repairs | Service QC | `/ops/service/jobs/:id` | Repairs Done · Awaiting QC |
| `SERVICE_QC_PASSED` | QC inspector passes vehicle | Customer, Advisor | `vmotiv://service-requests/:id` | Quality Inspection Passed |
| `SERVICE_QC_REWORK` | QC inspector flags issue | Assigned Tech | `/ops/service/jobs/:id` | Quality Adjustment Required |
| `SERVICE_INVOICE_GENERATED` | Final invoice ready | Customer | `vmotiv://service-requests/:id` | Service Invoice Available |
| `SERVICE_PAYMENT_VERIFIED` | Finance verifies payment | Customer, Hub Manager | `vmotiv://service-requests/:id` | Service Payment Verified |
| `SERVICE_RETURN_DISPATCHED` | Return driver dispatched | Customer | `vmotiv://service-requests/:id` | Vehicle Out for Return Delivery |
| `SERVICE_COMPLETED` | Car handed back to customer | Customer | `vmotiv://service-requests/:id` | Service Completed |
| `SERVICE_CANCELLED` | Booking cancelled | Customer, Advisor | `vmotiv://service-requests/:id` | Service Booking Cancelled |
