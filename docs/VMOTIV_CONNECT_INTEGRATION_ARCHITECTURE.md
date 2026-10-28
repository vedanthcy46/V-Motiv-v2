# V MOTIV Connect — Integration Architecture & System Boundary

## 1. System Integration Overview
V MOTIV V2 (`services/api` and `apps/customer-mobile`) bridges with the existing V MOTIV Connect platform (`v-motiv-connect`) without rewriting the existing infrastructure or invalidating existing printed QR stickers.

```
+-----------------------------------------------------------------------------------+
|                              PUBLIC PASSERBY SCAN                                 |
|                                                                                   |
|  Passerby Smartphone (No App, No Login)                                           |
|       |                                                                           |
|       v                                                                           |
|  HTTPS GET https://v-motiv.netlify.app/v/:token                                   |
|       |                                                                           |
|       v                                                                           |
|  [ V MOTIV Connect Website ] ──(Rate Limit & IP Hash)                             |
|       |                                                                           |
|       +───► WebRTC Audio Signaling (Peer-to-Peer, Zero Number Disclosure)         |
|       |                                                                           |
|       +───► POST /api/v2/webhooks/connect (HMAC-SHA256 Signed Webhook)            |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                             V MOTIV V2 BACKEND                                    |
|                                                                                   |
|  services/api                                                                     |
|    ├── Verify HMAC Signature (X-Connect-Signature vs CONNECT_WEBHOOK_SECRET)      |
|    ├── Query CustomerGarageConnectLink by qrTokenHash                             |
|    ├── Deduplicate event (ConnectNotificationReference)                           |
|    ├── Dispatch Expo Push Notification to Vehicle Owner Phone                     |
|    └── Record ConnectIntegrationAuditEvent                                        |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                            V2 CUSTOMER MOBILE APP                                 |
|                                                                                   |
|  apps/customer-mobile                                                             |
|    ├── My Garage: Connect Status (Active / Paused), QR preview, Toggle, Revoke   |
|    ├── Requests / Activity Feed: Real-time passerby alert notifications           |
|    └── Manage QR Modal: Order Physical Sticker, Link Sticker, View Alert History  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Identity Separation Principle
A strict zero-trust boundary is maintained between system identities:

| Entity | Identity Scope | Storage Location | Exposure |
| :--- | :--- | :--- | :--- |
| **V2 Customer User** | Firebase UID / Postgres UUID | `services/api` (PostgreSQL) | Internal only |
| **Connect Owner** | MongoDB ObjectId | `v-motiv-connect` (MongoDB) | Zero plain disclosure |
| **Garage Vehicle** | Postgres UUID | `services/api` (PostgreSQL) | Owner garage view |
| **Physical Sticker**| 32-byte Random Token | URL printed on physical vinyl | Publicly visible |
| **Database Token**  | SHA-256 Hash of Token | `qr_tokens` & `CustomerGarageConnectLink` | Hash stored, never token |
| **Passerby Visitor**| Ephemeral Session & IP Hash | Memory / Ephemeral Session | Zero account required |

---

## 3. Webhook Contract & Service-to-Service Security
All events dispatched from the Connect platform to V2 are delivered via `POST /api/v2/webhooks/connect`.

### Headers
- `Content-Type: application/json`
- `X-Connect-Signature: sha256=<hex_hmac>`
- `X-Connect-Timestamp: <iso_or_epoch_ms>`

### Verification Formula
```ts
const expectedSignature = crypto
  .createHmac('sha256', process.env.CONNECT_WEBHOOK_SECRET || 'dev-secret')
  .update(`${timestamp}.${JSON.stringify(payload)}`)
  .digest('hex');
```
Timestamps older than 300 seconds are rejected to prevent replay attacks.

---

## 4. Supported Domain Events
1. `qr.scanned`: Triggered when a public visitor scans a valid QR code.
2. `alert.created`: Triggered when a visitor submits an alert message.
3. `call.requested`: Triggered when a visitor initiates an audio session.
4. `call.completed`: Records duration and termination reason.
5. `qr.deactivated`: Triggered upon owner toggle or security revocation.
