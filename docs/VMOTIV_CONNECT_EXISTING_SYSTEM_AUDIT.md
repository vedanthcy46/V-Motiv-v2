# V MOTIV Connect — Existing System Audit & Technical Baseline

## 1. System Overview & Physical Location
- **Sibling Workspace Location**: `C:\Users\hp victus\Documents\V Motiv\v-motiv-connect`
- **Backend Architecture**: Node.js (v20+), Express 4.19, TypeScript, Mongoose 8.3 (MongoDB), WebSocket (`ws` 8.16) for real-time signaling.
- **Frontend Architecture**: React 18, Vite 6.4, Tailwind CSS, TanStack React Query, Lucide Icons.
- **Production Target URL**: Configured via `APP_BASE_URL` (e.g. `https://v-motiv.netlify.app` or custom domain `https://connect.vmotiv.com`).

---

## 2. Public QR Token Format & Storage
- **Public Printed URL Scheme**: `https://<APP_BASE_URL>/v/<rawToken>`
- **Token Entropy**: 32-byte cryptographically secure pseudo-random hex string (`crypto.randomBytes(32).toString('hex')` = 64 characters).
- **Zero-Plaintext Storage**: 
  - Raw tokens are never stored in plaintext in the database.
  - Stored in MongoDB collection `qr_tokens` as `tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')`.
  - Preview token format: `vm_` + first 6 characters of `rawToken` (e.g. `vm_8f29c1...`).
- **Token Statuses**:
  - `active`: Eligible for passerby scans, messages, and calls.
  - `revoked`: Permanently disabled. Scans display an explicit security revocation warning.
  - `expired`: Pre-issuance or claim expiration.

---

## 3. Data Model & Privacy Architecture
- **Identity Decoupling**:
  - `User` in Connect platform stores encrypted owner profile (AES-256-GCM for phone numbers and email).
  - Password hashing uses Argon2id (`argon2.hash`).
  - No customer account identity from V2 is implicitly trusted or shared with public scanners.
- **Visitor (Passerby) Session**:
  - Zero registration or login required for public scanners.
  - Ephemeral visitor session token issued upon scanning `/v/:token`.
  - IP addresses are salted and hashed (`visitorIpHash = sha256(salt + ip)`) to prevent tracking while maintaining rate-limit ability.

---

## 4. Telephony & Communication Audit
- **In-Browser WebRTC Peer-to-Peer**:
  - Default voice calling mechanism is browser-to-browser WebRTC via WebSocket signaling.
  - Zero telephone numbers are transmitted over the wire or exchanged between caller and vehicle owner.
  - STUN/TURN servers are configured via environment variables (`STUN_SERVERS`, `TURN_SERVERS`).
- **PSTN Telephony (Twilio / CPaaS)**:
  - Existing codebase has a Twilio voice bridge interface (`TwilioVoiceBridge`).
  - Audited status: `VOICE_LIVE_ENABLED=false` by default.
  - **Indian Regulatory Reality (TRAI/DoT)**:
    - Direct PSTN masked forwarding in India requires a Department of Telecommunications (DoT) licensed Virtual Number / CPaaS provider (e.g., Exotel, Tata Tele, Airtel IQ, or localized Twilio India entity) with strict TRAI anti-spoofing and CLIP (Calling Line Identification Presentation) compliance.
    - System fails closed: When PSTN telephony is disabled or misconfigured, the API returns HTTP 503 with user-friendly WebRTC fallback and SMS/Push alert routing.

---

## 5. Security & Anti-Abuse Controls
- **Rate Limiting**:
  - Rate limiting on public scan endpoint: Max 10 scans per IP per 5 minutes.
  - Rate limiting on alert creation: Max 3 messages per token per IP per 15 minutes.
- **Message Content Filtering**:
  - Length capped at 280 characters.
  - Automated regex scrub for profanity and spam links.
- **Emergency Disclaimer**:
  - Explicit warning rendered on all scan pages: *"For accidents, medical emergencies, or criminal threats, do not wait for a reply — immediately dial 112."*

---

## 6. Build & Typecheck Verification
- **Backend Typecheck**: `npm run typecheck --prefix ..\v-motiv-connect\backend` verified clean with **0 errors**.
- **Frontend Build**: `npm run build --prefix ..\v-motiv-connect\frontend` verified clean in **4.89s** with **0 errors**.
