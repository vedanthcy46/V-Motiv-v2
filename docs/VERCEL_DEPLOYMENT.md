# Vercel deployment

Import the V2 repository and set Root Directory to the folder containing this `vercel.json` (`vmotiv-v2` if importing its parent). Do not select the mobile workspace.

- Framework preset: Other
- Install command: `npm ci`
- Build command: `npm run db:generate && npm run build -w @vmotiv/api && npm run build -w @vmotiv/customer-web`
- Output directory: `apps/customer-web/dist`
- Node.js: 24.x

The website and `/api/v1` API share one domain. The mobile app itself is distributed through Android/iOS builds, not Vercel.

## Environment variables

Set these in Vercel before building:

- `NODE_ENV=production`
- `DATABASE_URL`: dedicated V2 Neon pooled PostgreSQL URL with SSL
- `WEB_ORIGIN`: exact HTTPS website origin, without trailing slash
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete Firebase Admin service-account JSON stored as a secret, never a `VITE_` variable
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`: Firebase public web configuration
- `EMAIL_DELIVERY_ENABLED=false` for the HTTP function until a separate email worker is configured

Add the deployed website domain to Firebase Authentication's authorized domains. Local credentials file paths do not work in Vercel.

## Database and email

Apply migrations separately before releasing against a new database: `npm run db:deploy`. Use the deployment database URL and optionally `DIRECT_DATABASE_URL`. Migrations intentionally do not run during every preview build. Preview deployments should use a separate Neon branch and matching Firebase/environment settings.

The API persists transactional emails to the outbox. Run `npm run email:worker` on a persistent worker host with the same database, `RESEND_API_KEY`, verified `EMAIL_FROM`, and `EMAIL_DELIVERY_ENABLED=true`. Vercel request functions do not run the local interval worker. Email delivery is incomplete until that worker is provisioned.

After deployment check `/api/v1/health/ready`, public inventory and Google sign-in. Set the mobile `EXPO_PUBLIC_API_URL` to `https://YOUR_DOMAIN/api/v1` and rebuild the mobile app to use the deployed backend.
