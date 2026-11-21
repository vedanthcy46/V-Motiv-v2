# V MOTIV V2 — Agent Handoff & Maintenance Guide

## 1. System Summary

The V MOTIV V2 Service Booking Payment System completes the unified automotive service ecosystem across mobile, web, and operations portals:
- **Shared Backend**: Node.js 20, Express, Prisma ORM connected to Neon PostgreSQL.
- **Customer Mobile**: Expo / React Native with Step 6 payment plan selector, live tracking, and balance settlement modal.
- **Operations Portal**: Real-time queue with `PAYMENT STATE` column, dynamic package pricing editor, tax invoice generation (18% GST), and authoritative release gate checklist.
- **Finance Portal**: Centralized audit trail and service invoice ledgers.

---

## 2. Key Codebase Locations

| Functionality | Primary Files |
| :--- | :--- |
| **Prisma DB Schema & Migrations** | `services/api/prisma/schema.prisma`<br>`services/api/prisma/migrations/20261103100000_service_booking_payments/` |
| **Backend Business Logic** | `services/api/src/service-store.ts` |
| **Backend API Endpoints** | `services/api/src/service-router.ts`<br>`services/api/src/finance-router.ts`<br>`services/api/src/finance-store.ts` |
| **Operations Portal UI** | `apps/operations-portal/src/components/ServiceOperationsPanel.tsx`<br>`apps/operations-portal/src/api.ts`<br>`apps/operations-portal/src/types.ts` |
| **Customer Mobile App** | `apps/customer-mobile/src/services/service-api.ts`<br>`apps/customer-mobile/src/screens/ServiceHomeScreen.tsx`<br>`apps/customer-mobile/src/screens/RequestsScreen.tsx`<br>`apps/customer-mobile/src/screens/ServiceRequestDetailsScreen.tsx` |
| **Customer Web** | `apps/customer-web/src/components/ServiceModal.tsx` |
| **Finance Portal** | `apps/finance-portal/src/api.ts` |
| **Automated Tests** | `services/api/test/service-api.test.ts` |

---

## 3. Strict Operating Rules & Constraints

> [!CAUTION]
> **DO NOT PUSH TO GITHUB**: Per user instruction, never execute `git push` or push changes to remote repositories. All commits must remain local on the `master` branch.

1. **Paise Math Only**: Always multiply or divide rupees by 100 using integer math (`BigInt(rupees) * 100n` or `Math.round(Number(paise) / 100)`). Never store floats in monetary database columns.
2. **Never Simulate Payments in Production**: Signature verification via `crypto.createHmac('sha256', secret)` must remain active in production environments.
3. **Release Gate Integrity**: Never allow vehicle release if QC has not passed, estimate is unapproved, tax invoice is missing, or balance due $> 0$.

---

## 4. How to Run & Verify Locally

### 1. Backend Server
```bash
cd services/api
npm run dev
# Starts API server on http://localhost:4100
```

### 2. Operations Portal
```bash
cd apps/operations-portal
npm run dev
# Starts Operations Portal on http://localhost:3002
```

### 3. Customer Mobile App
```bash
cd apps/customer-mobile
npm run start
# Starts Expo Metro bundler
```

### 4. Run Test Suite
```bash
cd services/api
npx vitest run test/service-api.test.ts
```

---
## Audit update 2026-11-04
See `docs/audit/` (MASTER_AUDIT_REPORT, REMEDIATION_LOG, CODEBASE_INVENTORY). Payment signature checks go through `services/api/src/payment-signature.ts`; production has no demo-payment shortcuts. Webhooks verify the raw body (`req.rawBody`, set in `app.ts` and `worker-cf.ts`). Required production secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CONNECT_WEBHOOK_SECRET`.

---
## Employee notification system (2026-11-21)

Full design in `docs/EMPLOYEE_NOTIFICATION_ARCHITECTURE.md` (plus `_EVENT_CATALOG`, `_ROUTING_MATRIX`, `_PERMISSION_MATRIX`, `_OUTBOX`, `_DELIVERY`, `_ESCALATIONS`, `_API_CONTRACTS`, `_TEST_RESULTS`). Code: `services/api/src/employee-notifications/`; shared UI: `packages/ui/src/notifications/`; Inspector inbox: `apps/customer-mobile/src/services/employee-notifications.ts` + `InspectorScreen`.

**To raise a staff notification:** add (or find) the event in `catalog.ts`, then call `enqueueDomainEvent(tx, { eventType, aggregateId, branchId, assigneeUserIds, payload })` inside the business transaction. Never write `Notification` rows for staff directly and never address "all Sales". When work is finished or reassigned call `resolveNotificationsForResource` so old alerts stop being actionable.

**Deploying:** apply migration `20261121030000_employee_notification_pipeline`; run a worker (`worker.ts`) or set `CRON_SECRET` for the Cloudflare cron; designate queue owners in Admin (`/admin/notification-queues`) or alerts fall back to a capped list of branch permission holders.

**Known gaps (do not assume they work):** 17 catalog events are not yet raised by business code (`emitted: false` in the catalog docs); no browser web push; Activity Monitor has no export and cannot filter by branch for events that do not carry `details.branchId`; inspection-review portal still uses the older notification list endpoint (it shows the same rows without acknowledge/severity); external providers (Expo, Resend, Cloudflare cron) were never reached from the build sandbox, so real delivery is unverified.
