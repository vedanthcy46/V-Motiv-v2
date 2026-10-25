# V MOTIV V2 — Inspector Mobile Android Build Guide

## 1. Application Identity

- Package Identifier: `in.vmotiv.inspector`
- Application Name: `V MOTIV Inspector`
- Target SDK: Expo SDK 57 (React Native 0.86 / 0.88 compatible)
- Primary Platform: Android (Dedicated field inspector app)

## 2. Environment Configuration

Create `apps/inspector-mobile/.env`:
```ini
EXPO_PUBLIC_API_BASE=https://api.vmotiv.in/api/v2
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Your_Firebase_Web_Client_OAuth_ID>.apps.googleusercontent.com
```

For local network USB / emulator debugging:
```ini
# When using Android Emulator pointing to local machine:
EXPO_PUBLIC_API_BASE=http://10.0.2.2:4100/api/v2

# When using physical Android device connected via Wi-Fi:
EXPO_PUBLIC_API_BASE=http://192.168.1.X:4100/api/v2
```

## 3. Google Sign-In & Firebase Setup for Android

1. Download `google-services.json` from the Firebase Console (Project: `vmotiv-v2-dev` or production).
2. Place `google-services.json` in `apps/inspector-mobile/google-services.json`.
3. In Google Cloud Console, add the SHA-1 and SHA-256 fingerprints of your debug keystore and release keystore to the Android OAuth Client.

## 4. Build Commands

### Local Development Client
```bash
# Start local Metro bundler for Inspector:
npm run dev:inspector

# Run on connected Android device via USB:
npm run android -w @vmotiv/inspector-mobile
```

### Production APK / AAB with EAS Build
Configured in `apps/inspector-mobile/eas.json`:

```bash
# Internal Testing APK (Direct APK for field devices):
cd apps/inspector-mobile
npx eas-cli build --platform android --profile preview

# Production Google Play App Bundle (AAB):
npx eas-cli build --platform android --profile production
```
