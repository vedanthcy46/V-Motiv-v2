# V2 architecture

## Current executable structure
- services/api: Express 5, TypeScript, Prisma 6, Firebase Admin, Resend.
- apps/customer-web: React 19, Vite 7, Firebase modular Auth.
- apps/customer-mobile: Expo 58/React Native 0.88, native Firebase Auth and native Google Sign-In; customer workspace only.
- tooling: isolated local PostgreSQL setup.
- services/api/prisma: fresh schema and additive migration.
- services/api/test: HTTP authorization and real PostgreSQL transaction coverage.

npm workspaces provide a single lockfile. No V1 UI or dependencies were copied.
PostgreSQL is the only business database. Firebase supplies verified identity; no Firestore operations are used.
API port 4100, customer development website port 3100, database port 5440 avoid V1's ports.

## Current vertical slice
Google SDK sign-in -> Firebase ID token -> Admin SDK verification (with revocation) -> verified UID -> local PostgreSQL user -> profile.
First registration atomically creates user, audit event and welcome-email outbox row. Concurrent registration is serialized by a PostgreSQL transaction advisory lock.
Customers never acquire employee access automatically. The Employee model defaults to inactive and has server-owned role, permissions and location IDs. The employee profile gate additionally requires a Firebase second-factor claim.

## Customer domain slice
The V2 API now owns fresh vehicle/listing/media, wishlist, test-drive request and acquisition-lead records. Customer records are always scoped from the verified Firebase UID through the local active User. Published inventory alone is exposed. Customer changes create audit events where business state is created or cancelled.

## Following milestones
Complete live native OAuth/store-build acceptance after Firebase platform credentials are supplied. Create sales, inspector, operations, finance and admin apps only when their real workflows begin.
Introduce shared packages only once there are consumers. Do not create empty portal shells to imply completion.

