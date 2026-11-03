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
