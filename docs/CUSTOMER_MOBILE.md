# Customer mobile app

## Scope

`apps/customer-mobile` is the V2 iOS/Android customer application. It carries forward only the customer journeys identified in V1:

- Firebase Google sign-in and secure session restoration.
- Public Explore/search published inventory and view vehicle specifications before sign-in; personal actions request Google sign-in.
- Save/remove wishlist vehicles.
- Submit and cancel test-drive requests.
- Submit a sell-car acquisition request with a resumable on-device draft and idempotent retry key.
- Track customer-owned selling requests, test-drive requests, purchase enquiries and support cases in Activity.
- Complete the required first-sign-in Terms acknowledgement, then view/update customer name, phone and optional marketing-email consent.
- Manage customer-scoped saved addresses independently of addresses already recorded on submitted requests.

It contains no inspector navigation, employee workspace, staff permissions, OTP/SMS login, inspection forms or employee role switch. Brand icon/splash assets were copied from the V1 customer bundle because the user explicitly requested the customer mobile details; application source and obsolete authentication code were rebuilt.

## Required external configuration

Use a dedicated V2 Firebase project. Never commit the following files:

- `apps/customer-mobile/google-services.json` for Android.
- `apps/customer-mobile/GoogleService-Info.plist` for iOS.

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the Firebase/Google web OAuth client ID used to exchange the native Google ID token. Set `EXPO_PUBLIC_API_URL` to an address the device can reach. The fallback handles the Android emulator (`10.0.2.2`) and Expo development host, but an explicit HTTPS URL is required outside local development.

The package identifiers are `in.vmotiv.customer`. Register the Android SHA-1/SHA-256 signing fingerprints and iOS bundle ID in the same V2 Firebase project. Replace the EAS project placeholder in `app.json` with the real project ID before cloud builds.

For a USB-connected Android development device, run `npm run mobile:usb` from the workspace root before opening the app. This forwards both Metro (8081) and the API (4100). Development requests follow the current Metro host, including USB localhost, so no fixed Wi-Fi IP is needed. For Wi-Fi development, run Metro in LAN mode with a reachable local API. A shipped build still needs an explicit HTTPS API URL.

This app uses native Firebase and Google Sign-In modules, so Expo Go is not supported. Create a development build using Node 24 LTS:

```powershell
npm ci
npm run db:generate
npm run mobile:android
```

On macOS, `npm run mobile:ios` builds the iOS development client. Real OAuth verification requires authorized Android/iOS clients and a reachable API with Firebase Admin credentials.

## API contract

The mobile app calls only V2 `/api/v1` endpoints. Every request carries a Firebase ID token, the API verifies revocation and the Google provider, and all customer-owned records are selected using the verified UID's local user ID.

The app supports safe custom-scheme links for public routes, including `vmotiv://vehicles/<listing-id>` and `vmotiv://explore`. Private screens still enforce authentication after the link is opened; no link embeds a token or privileged state.

API calls have a 15-second deadline covering token lookup, response parsing and one token-refresh retry. Temporary API failures retain the Google session for a retry. Successful empty `204` responses are accepted. Fake preview tokens are not accepted by the API.

The launch reveal uses official vector artwork in a full-window native presentation with translucent system bars, seven-second scene timing, Skip and reduced-motion support. The native Android splash uses the transparent brand emblem; the reveal no longer renders a portrait screenshot inside the device.

Implemented routes:

- `POST /auth/sync`, `GET/PATCH /me`
- `GET /inventory`, `GET /inventory/:id`, `GET /cities` (inventory is public; supplied valid Firebase identity personalizes saved state)
- `GET /me/wishlist`, `PUT/DELETE /me/wishlist/:id`
- `POST /test-drive-requests`, `GET /me/test-drive-requests`, `PATCH /test-drive-requests/:id/cancel`
- `POST /acquisition-leads`, `GET /me/acquisition-leads`
- `GET/POST/DELETE /me/saved-searches`, `GET/POST /me/purchase-enquiries`, `GET/POST /me/support-cases`, `GET /me/activity`, `GET/POST/DELETE /me/addresses`

Customer mutations queue transactional receipt emails through the server-side outbox. A receipt records a request; it never represents an inspection, offer, stock reservation, finance approval, payment, delivery, or test-drive confirmation.

Supported cities are served by `GET /cities` and are operator-configured records. The app never infers coverage from GPS or accepts an arbitrary selling location. A deployment must configure at least one active city before the sell journey can be submitted.

Test-drive requests include a supported city plus hub/home preference. They remain `REQUESTED` until an operational availability process records a later outcome; the customer app does not create a confirmation from a preferred date or slot.

Inventory is intentionally empty until an authorized future inventory workflow publishes listings. No demo vehicles or real V1 data are copied.

## Verification

- Expo dependency compatibility check passes.
- TypeScript strict checking passes for all workspaces.
- Android Metro production bundle completes with `--no-bytecode` on the current host.
- Hermes generation must be repeated on Node 24 LTS; Node 25 is outside Expo 58's supported engine range and failed to spawn the Windows Hermes compiler.
- Native launch and real Google sign-in remain external acceptance checks because platform Firebase credential files were not supplied.
