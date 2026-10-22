# V MOTIV V2

Clean rebuild using Express/TypeScript, PostgreSQL/Prisma, Firebase Google sign-in, and Resend.

V1 remains in ../v-motiv-app and ../v-motiv-connect. No V1 source, environment files, migrations, or customer data were copied into V2.

## Implemented foundation and customer mobile slice

Implemented: central API, verified Google identity boundary, customer registration/profile, employee access gate, audit event, welcome-email transactional outbox and worker, customer website sign-in flow, isolated development/test databases, and a customer-only Expo mobile app with its connected V2 business APIs.

The mobile customer scope includes Explore, vehicle details, wishlist, sell-car intake, test-drive requests, request tracking and account/preferences. Inspector and other employee workspaces are deliberately absent. Real Google sign-in, native store builds and email delivery require external configuration. Employee portals remain future milestones.

## Run locally

Node 22.12+ LTS or Node 24 LTS is recommended.

1. Use Node 24 LTS. Run npm ci and npm run db:generate.
2. Start the isolated development database:
   powershell -ExecutionPolicy Bypass -File tooling/start-local-db.ps1
   Alternatively set V2_POSTGRES_PASSWORD and run docker compose up -d.
3. Create services/api/.env using services/api/.env.example. For the native local cluster, use:
   DATABASE_URL=postgresql://vmotiv_v2@127.0.0.1:5440/vmotiv_v2_dev
4. Configure a dedicated development Firebase project, Google sign-in, project ID and Application Default Credentials. See docs/AUTHENTICATION.md.
5. Run npm run db:deploy.
6. Create apps/customer-web/.env.local from its .env.example and enter the Firebase public app configuration.
7. Start npm run dev:api and npm run dev:web in separate terminals.
8. Open http://localhost:3100.

For the customer mobile app, follow docs/CUSTOMER_MOBILE.md. It requires uncommitted Firebase platform files and a native development build; Expo Go cannot load its native authentication modules. Run `npm run dev:mobile` after configuration, or `npm run mobile:android` to create the Android development build.

The native database script uses loopback-only trust authentication for local development. It must never be used on a shared or production host. The Docker alternative uses a password.

## Verification

npm run typecheck
npm run build
npm test

For real database integration tests in PowerShell:
$env:V2_TEST_DATABASE_URL='postgresql://vmotiv_v2@127.0.0.1:5440/vmotiv_v2_test'
npm test

Apply migrations to the isolated test database first by temporarily setting DATABASE_URL to that URL and running npm run db:deploy.
Database tests use synthetic accounts and mocked email sending; they never send real email.

## Email worker

Delivery defaults to disabled. Configure RESEND_API_KEY and verified EMAIL_FROM, explicitly set EMAIL_DELIVERY_ENABLED=true, then run npm run email:worker. See docs/EMAIL_SYSTEM.md.

See docs/V2_AGENT_HANDOFF.md for completed verification and remaining work.

