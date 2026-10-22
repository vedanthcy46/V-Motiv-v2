# Google authentication

## Setup
Create a dedicated Firebase development project, enable Google in Authentication, and register a web app.
Authorize localhost for development. Production requires the actual approved HTTPS domain.
Populate apps/customer-web/.env.local with the public Firebase app values shown in its example.
Set FIREBASE_PROJECT_ID in services/api/.env. Configure Application Default Credentials outside this repository, or set GOOGLE_APPLICATION_CREDENTIALS to an external credential file.
Never put Admin credentials in VITE_ variables. Never copy V1 credentials.

The web client uses Firebase session persistence, onIdTokenChanged, Google popup sign-in and SDK sign-out.
Firebase manages session credentials; the application never stores a separate long-lived API token.
API requests carry short-lived Firebase ID tokens over HTTPS in deployed environments.
Admin SDK verifyIdToken(token, true) validates tokens and revocation; the API also requires the Google provider and a verified email.
Profile fields originate from the verified token at first registration. Frontend UID/email/role payloads are rejected.

## Routes
- GET /api/v1/health/live: process health.
- GET /api/v1/health/ready: database readiness, no credentials returned.
- POST /api/v1/auth/sync: empty body; register or retrieve current local account.
- GET /api/v1/me: protected local profile.
- GET /api/v1/employee/me: active local employee and second factor required.

Account status is checked on each request. Suspension takes effect on the next API request even with an otherwise valid Firebase token.
SDK sign-out removes the browser session; global device revocation is a separate future security workflow.

## Employee provisioning
No public employee creation/role assignment endpoint exists.
Current employee gate fails closed until an explicit approved invitation/bootstrap process links a verified UID to an active employee record.
Do not use email-domain matching or assign ADMIN to a public Google sign-in.
Employee invitations, secure initial-admin bootstrap, location/resource middleware for business APIs and privileged reauthentication UI remain to implement.
Firebase/Google identity alone does not prove vehicle ownership or bank/legal identity.

## External verification
Live OAuth, token revocation with the configured Firebase project, and native mobile OAuth are not verified without project credentials.
Official references:
https://firebase.google.com/docs/auth/admin/verify-id-tokens
https://firebase.google.com/docs/auth/web/google-signin
https://firebase.google.com/docs/auth/admin/manage-sessions

