# V MOTIV Connect — Privacy, Security & Anti-Abuse Defenses

## 1. Zero Personal Data Exposure (Zero-Knowledge)
When a passerby scans a physical QR code on a vehicle, the public web interface renders **ONLY**:
- Generic vehicle description (e.g. `Maruti Suzuki Swift · White`).
- Pre-curated reason selection cards.
- Message input field.
- Emergency services guidance.

The public interface **NEVER** displays:
- Vehicle registration / license plate number.
- Owner name, photograph, or gender.
- Owner phone number, email address, or residential address.
- Past maintenance history, service records, or valuation quotes.

---

## 2. Multi-Tier Anti-Abuse & Rate Limiting

| Attack Vector | Countermeasure | Implementation |
| :--- | :--- | :--- |
| **QR Code Scraping** | Sliding-window IP Rate Limit | Max 10 scans / IP / 5 mins via Express limiter |
| **Alert Notification Flooding** | Per-Token Cooldown | Max 3 messages / token / IP / 15 mins |
| **Passerby Stalking / Tracking**| Hashed Visitor Fingerprint | `visitorIpHash = sha256(secret_salt + visitor_ip)` |
| **Prank / Harassment Calling** | Call Session Throttling | Max 1 voice call request / 10 mins per visitor |
| **Abusive Language / Defamation**| Pre-dispatch Content Filter | Capped at 280 chars; profanity regex sanitization |
| **Emergency Delays** | 112 Prominent Disclaimer | Prominently displayed on all scan pages |

---

## 3. Reason Cards & Structured Triage
To minimize friction and prevent harassment, the public scan UI provides 4 quick-tap reason buttons:

1. 🚗 **Vehicle Blocking Access**: Pre-populates *"Your vehicle is currently blocking my driveway / exit. Could you please move it?"*
2. 💡 **Lights Left On**: Pre-populates *"Your headlights or interior cabin lights appear to have been left on."*
3. ⚠️ **Vehicle Needs Attention**: Pre-populates *"Your vehicle has a flat tire / open window / perimeter alarm sounding."*
4. 💬 **Other Concern**: Freeform text input up to 280 characters.

---

## 4. Owner Abuse Reporting & One-Tap Revocation
Inside the V2 Customer Mobile App:
- **Report Abuse**:
  - Tapping "Report Misuse / Spam" alerts the 24/7 V MOTIV Trust & Safety moderation team.
  - The offending visitor IP hash is permanently blacklisted across the entire Connect cluster.
- **Revoke Sticker**:
  - In the event of persistent harassment, vandalism, or sticker cloning, the owner can tap "Revoke Lost / Stolen Sticker".
  - This immediately invalidates the cryptographic token hash in PostgreSQL and MongoDB.
  - Future scans display a permanent red revocation warning.
