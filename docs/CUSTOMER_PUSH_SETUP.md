# V MOTIV V2 — Customer Mobile Push Notification Setup

## 1. Overview
The Customer Mobile App (`in.vmotiv.customer`) receives transactional updates for vehicle valuations, direct purchase offers, test drive schedule confirmations, and payment verifications.

---

## 2. Notification Permissions & Opt-in

- Push permission is requested gracefully when the customer registers, signs in, or initiates an active transaction (e.g. submitting a car for sale or requesting a test drive).
- If permission is denied or revoked in device settings:
  - The app gracefully falls back to the in-app durable activity inbox (`Activity` tab).
  - Transactional emails are dispatched via Resend to ensure zero loss of critical updates.

---

## 3. Device Token Registration

Upon sign-in, `AuthProvider.tsx` invokes:
```typescript
registerForPushNotificationsAsync('CUSTOMER');
```
This performs:
1. `Notifications.getExpoPushTokenAsync()`
2. `POST /api/v2/push-devices` with payload:
   ```json
   {
     "token": "ExponentPushToken[...]",
     "app": "CUSTOMER",
     "platform": "ANDROID"
   }
   ```
3. Idempotently upserts the token in `PushDevice` bound to the authenticated `userId`.

---

## 4. Deep Links Handled
- `vmotiv://activity`: Opens customer Activity timeline.
- `vmotiv://vehicles/:listingId`: Opens vehicle specification page.
- `vmotiv://support`: Opens support case history.
- `vmotiv://privacy`: Opens privacy governance settings.
