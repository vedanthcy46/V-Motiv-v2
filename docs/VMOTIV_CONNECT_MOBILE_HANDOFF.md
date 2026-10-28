# V MOTIV Connect — Mobile Integration Handoff

## Implemented mobile paths

- **Garage → V MOTIV Connect**: owners can scan an official sticker with the device camera to populate the existing secure link flow. The backend continues to validate account ownership and refuses a QR already linked to another Garage vehicle.
- **Account / signed-out access**: “Scan V MOTIV Connect QR” opens a public, anonymous scanner. It uses the existing Connect public APIs for vehicle lookup, private alert creation and an optional call request; it does not create a V2 customer account or disclose owner data.
- **Incoming call notation**: Garage shows a high-priority banner for current `requested`, `validating`, `queued`, `initiating`, or `ringing` Connect calls, followed by recent call history. It does not pretend to answer a call because Connect has not exposed a verified mobile call-control contract.
- **External stickers**: the existing Connect `/v/:token` webpage now offers “Open in V MOTIV app.” Android uses an intent URL with the V MOTIV package and Play Store fallback. iOS opens `vmotiv://connect/scan?token=…`; it falls back only when a real `VITE_VMOTIV_IOS_STORE_URL` has been configured.

## Required deployment configuration

Mobile builds must set the following public values before enabling anonymous in-app lookup:

```env
EXPO_PUBLIC_CONNECT_API_URL=https://<connect-api-host>/api/v1
EXPO_PUBLIC_CONNECT_WEB_URL=https://<connect-web-host>
```

Connect web deployment must set:

```env
VITE_VMOTIV_MOBILE_SCHEME=vmotiv
VITE_VMOTIV_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=in.vmotiv.customer
VITE_VMOTIV_IOS_STORE_URL=https://apps.apple.com/app/id<real-app-id>
```

Rebuild the Android/iOS development or production app after this change: `expo-camera` is a native dependency and camera permission text is included in `app.json`.

## Deliberate boundaries

- A QR scan is never interpreted as account ownership. Garage linking remains server-authorized and can require a claim code.
- Scanned URLs are parsed for a token only; the mobile app never opens an arbitrary scanned URL.
- The public app experience never displays owner name, telephone number, address, VIN, or full registration details beyond what the existing Connect public service intentionally returns.
- PSTN masked calling is still blocked pending a verified India-capable provider. The existing Connect WebRTC/call-request flow is the only flow presented.
