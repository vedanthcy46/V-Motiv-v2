# V MOTIV V2 — Notification & Communication System Architecture

## 1. System Overview

The V MOTIV V2 Notification & Communication Engine is a unified, durable, and asynchronous system providing multi-channel dispatch across the entire business ecosystem:
- **Customer Mobile App** (`apps/customer-mobile`)
- **Inspector Mobile Portal** (`apps/customer-mobile` Inspector Mode)
- **Customer Web Portal** (`apps/customer-web`)
- **Inspection Review Portal** (`apps/inspection-review-portal`)
- **Operations & Dispatch Portal** (`apps/operations-portal`)
- **Sales Executive Portal** (`apps/sales-portal`)
- **Admin & Oversight Portal** (`apps/admin-portal`)

The engine orchestrates three distinct notification channels:
1. **In-App Notifications**: Durable PostgreSQL database inbox (`Notification` model) acting as the single source of truth.
2. **Push Notifications**: Device-level push via Expo Push Service backed by FCM v1 credentials for Android & APNs for iOS.
3. **Transactional Email**: Resend integration featuring verified HTML lockups, outbox queuing, idempotency keys, and webhook delivery status tracking.

---

## 2. Architectural Blueprint

```mermaid
flowchart TD
    subgraph Trigger["1. Business Event Trigger"]
        E1["Inspection Assigned"]
        E2["Report Submitted"]
        E3["Corrections Requested"]
        E4["Report Approved"]
        E5["Sell / Buy Enquiries"]
    end

    subgraph Core["2. Shared Backend (Express + PostgreSQL)"]
        NS["NotificationService"]
        DB_INBOX[("Durable Inbox\nNotification Table")]
        DB_PUSH[("Push Outbox\nPushTicket Table")]
        DB_EMAIL[("Email Outbox\nEmailOutbox Table")]
        PREFS["User Preferences\n& Quiet Hours Check"]
    end

    subgraph Worker["3. Notification Worker (Asynchronous Daemon)"]
        W_PUSH["Expo Push Dispatcher\n(Batches of 100)"]
        W_RECEIPT["Receipt Poller\n(Every 30s)"]
        W_EMAIL["Resend Email Sender\n(Exponential Backoff)"]
    end

    subgraph Channels["4. Delivery Channels"]
        CH_INAPP["In-App Notification Center\n(Mobile & Web Bells)"]
        CH_PUSH["Expo Push Service / FCM v1\n(Device Lock Screen)"]
        CH_EMAIL["Resend Transactional API\n(Verified Customer Inboxes)"]
    end

    subgraph Apps["5. Target Recipients"]
        APP_INSP["Inspector Mobile App"]
        APP_CUST["Customer Mobile & Web"]
        APP_REV["Review Portal"]
        APP_SALES["Sales Portal"]
        APP_OPS["Operations Portal"]
        APP_ADMIN["Admin Portal"]
    end

    Trigger --> NS
    NS --> PREFS
    PREFS --> DB_INBOX
    PREFS --> DB_PUSH
    PREFS --> DB_EMAIL

    DB_INBOX --> CH_INAPP
    DB_PUSH --> W_PUSH --> CH_PUSH
    W_RECEIPT --> CH_PUSH
    DB_EMAIL --> W_EMAIL --> CH_EMAIL

    CH_INAPP --> APP_INSP & APP_CUST & APP_REV & APP_SALES & APP_OPS & APP_ADMIN
    CH_PUSH --> APP_INSP & APP_CUST
    CH_EMAIL --> APP_INSP & APP_CUST & APP_SALES
```

---

## 3. Core Principles & Guarantees

1. **Durable Source of Truth**:
   The PostgreSQL `Notification` record is the primary durable store. Push notifications and transactional emails are delivery mechanisms, never substitutes for saved application state. If a phone is in airplane mode or push permissions are disabled, the user still sees their notifications in their application inbox.

2. **Decoupled Asynchronous Delivery**:
   Network calls to external third-party APIs (Expo and Resend) are never performed inside critical database transaction blocks. Business transactions commit immediately after persisting outbox work (`PushTicket` and `EmailOutbox`), and the background worker dispatches them asynchronously.

3. **Safe Lock Screen Payloads**:
   Push notification payloads delivered to lock screens contain only public, non-sensitive summaries (e.g., `New Inspection Assigned: 2022 Honda City · Tap to open`). Sensitive data (PII, VIN, customer phone numbers, banking coordinates) are strictly restricted behind authenticated app boundaries.

4. **Recipient Privacy & Quiet Hours**:
   User notification preferences (`NotificationPreference`) support quiet hours (default 22:00 to 08:00). Non-urgent notifications respect quiet hours, while urgent operational escalations (`priority: URGENT`) bypass quiet hours.
