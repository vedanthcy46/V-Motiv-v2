# V MOTIV V2 — Notification System Security & Privacy Standards

## 1. Zero Client Credential Exposure
- `RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and database credentials reside exclusively in server-side environment variables.
- Mobile apps (`customer-mobile`) and web portals communicate only through authenticated Express endpoints (`/api/v2/*`).

---

## 2. Lock Screen Payload Sanitization
Push notifications delivered to mobile device lock screens follow strict privacy rules:
- **Allowed on Lock Screen**: Generic vehicle model summary (`2022 Honda City`), job assignment identifier, and actionable status cues (`New Inspection Assigned`, `Corrections Requested`).
- **Forbidden on Lock Screen**: Full VIN numbers, customer contact numbers, customer residential addresses, financial payout amounts, bank account coordinates, and private inspection defect photographs.

All sensitive data requires unlocking the phone, launching the authenticated app, and validating server-side authorization.

---

## 3. PII Masking in Employee Portals
- Customer and employee email addresses rendered in the Communications Outbox and Audit dashboards are masked using RFC compliant email masking (`v***v@gmail.com`).
- Raw email addresses and phone numbers are visible only to employees holding explicit `customer.pii.read` or `employee.pii.read` permissions.

---

## 4. Quiet Hours & Delivery Throttling
- The system enforces user-configurable quiet hours (default: 22:00 to 08:00).
- Marketing and non-critical operational messages are held in the database inbox without alerting the user's device during quiet hours.
- Only critical emergency escalations (`priority: URGENT`) bypass quiet hours.
