# V MOTIV Connect — Notification Event Matrix & Webhook Flow

## 1. Event Catalog & Lifecycle
Every action in the V MOTIV Connect platform generates a structured event delivered via HMAC-SHA256 signed webhooks to V MOTIV V2 (`/api/v2/webhooks/connect`).

| Event Key | Trigger | Delivery Target | Push Notification Message |
| :--- | :--- | :--- | :--- |
| `CONNECT_QR_SCANNED` | Visitor scans QR sticker | Owner Mobile | *"Someone just scanned your V MOTIV Connect QR sticker."* |
| `CONNECT_OWNER_ALERT_CREATED` | Visitor submits reason/message | Owner Mobile & Activity Feed | *"🚗 Passerby Alert: [Reason] — [Message Preview]"* |
| `CONNECT_CALL_REQUESTED` | Visitor taps 'Call Owner' | Owner Mobile (High Priority) | *"📞 Passerby requesting private audio call regarding your vehicle."* |
| `CONNECT_CALL_STARTED` | Both parties join WebRTC bridge | Real-time socket | Call In-Progress banner |
| `CONNECT_CALL_COMPLETED` | Audio session ends | Owner Mobile & History | *"Private call ended ([Duration]s)."* |
| `CONNECT_CALL_FAILED` | Audio connection failed/rejected | Owner Mobile & History | *"Private call attempt unanswered."* |
| `CONNECT_QR_DEACTIVATED` | Owner pauses or toggles DND | Connect Proxy | N/A |
| `CONNECT_QR_REISSUED` | Replacement sticker ordered/linked | Audit Log & Customer Email | *"New QR sticker linked to your garage."* |
| `CONNECT_ABUSE_REPORTED` | Owner reports harassment | Trust & Safety Dashboard | High-priority admin incident created |

---

## 2. Webhook Delivery & Deduplication
To guarantee idempotency and prevent duplicate push notifications:

1. **Incoming Webhook Payload**:
   ```json
   {
     "eventId": "evt_948f219a-328d-4a11-b219-c09e382019ab",
     "eventType": "CONNECT_OWNER_ALERT_CREATED",
     "qrTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
     "timestamp": "2026-10-28T11:00:00.000Z",
     "data": {
       "reason": "blocking",
       "message": "Car is blocking driveway entrance",
       "visitorIpHash": "8f92a1...",
       "callSessionId": null
     }
   }
   ```
2. **Signature Verification**:
   - Header `X-Connect-Signature` must match `sha256=HMAC_SHA256(timestamp + "." + body, CONNECT_WEBHOOK_SECRET)`.
3. **Database Idempotency Check**:
   - If `ConnectNotificationReference` already contains an identical event within a 10-second deduplication window, the event is acknowledged with `HTTP 200 OK` but skipped for push dispatch.
4. **Push Notification Delivery**:
   - Dispatched via Expo Push Service using registered FCM/APNs push tokens stored on the vehicle owner's user account.
