# V MOTIV Connect — Telephony, CPaaS & Voice Privacy Architecture

## 1. Zero-Knowledge Voice Model
Vehicle owners must be reachable when their car causes an obstruction or safety hazard, but **under no circumstances should their personal phone number be exposed to a stranger scanning the QR sticker**.

To achieve this, V MOTIV Connect supports two voice pathways:
1. **Primary: In-Browser WebRTC Audio Calling**
2. **Secondary / Fallback: Telecommunications Cloud PSTN Number Masking**

---

## 2. WebRTC In-Browser Audio (Recommended Default)
- **Protocol**: WebRTC (SRTP over DTLS) with WebSocket signaling.
- **Workflow**:
  1. Passerby taps "Call Owner" on `https://<APP_BASE_URL>/v/:token`.
  2. Frontend requests microphone permission and connects to the WebSocket signaling gateway.
  3. The signaling gateway notifies the vehicle owner via Expo Push Notification / WebRTC socket.
  4. Both parties establish an end-to-end encrypted audio stream.
- **Privacy Guarantee**:
  - **Zero phone numbers are used, transmitted, or stored**.
  - Audio operates entirely over IP packets between browser and app/browser.

---

## 3. PSTN Telephony & Indian Telecom Regulations (TRAI / DoT)
Where traditional cellular telephone calls are desired:

### Regulatory Framework (DoT & TRAI)
- In the Republic of India, forwarding phone calls between unknown parties using CLI (Caller Line Identification) spoofing is illegal under Department of Telecommunications (DoT) directives.
- Any service offering masked cellular calling must operate through a licensed Access Service Provider or a registered CPaaS provider (e.g. Exotel, Tata Tele Business Services, Airtel IQ, or localized Twilio India entity) holding proper Virtual Number (DID) allocations.

### Verification of Current Provider State:
- Inspection of `..\v-motiv-connect\backend`:
  - `TwilioVoiceBridge` is implemented with fallback mocks.
  - Environment variable `VOICE_LIVE_ENABLED` is set to `false` by default.
  - Test credentials (`TWILIO_ACCOUNT_SID=AC_mock...`) are present.
- **Fail-Closed Privacy Policy**:
  - If `VOICE_LIVE_ENABLED=false` or provider credentials are invalid, the system **never** returns the owner's raw phone number in client payloads.
  - It safely returns `HTTP 503 Service Unavailable` with message: *"Voice calling is currently offline. Please send a high-priority message alert instead."*

---

## 4. Telephony Audit & Call Session Tracking
Every attempted voice call creates a referenced record in PostgreSQL:
```prisma
model ConnectCallSessionReference {
  id              String   @id @default(uuid())
  callSessionId   String   @unique
  provider        String   // 'webrtc' | 'twilio' | 'exotel'
  status          String   // 'INITIATED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REJECTED'
  durationSeconds Int?
  createdAt       DateTime @default(now())
}
```
This enables vehicle owners to view legitimate call attempt history in the customer mobile app without exposing caller phone numbers.
