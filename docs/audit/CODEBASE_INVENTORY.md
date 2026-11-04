# Codebase Inventory (verified 2026-11-04, branch `master`, base commit ca8209c)

Monorepo, npm workspaces (`services/*`, `apps/*`), Node ^22.13. No CI config (`.github` absent). Deploy target: **Cloudflare Workers** (`wrangler.jsonc` in api + 5 portals); legacy `vercel.json` and `api/` entry still present.

| Component | Path | Stack | TS files | Tests | Status |
|---|---|---|---|---|---|
| API | `services/api` | Express 5 + Prisma 6.19 (Neon adapter), zod, firebase-admin, Resend, Cloudinary | 42 (~28k LOC, mostly `src/*-store.ts`) | 22 files; 186 pass / 23 skipped | VERIFIED_WORKING (typecheck + vitest) |
| Customer mobile | `apps/customer-mobile` | Expo ~57 / RN 0.86 | 70 | 3 | IMPLEMENTED_NOT_VERIFIED |
| Customer web | `apps/customer-web` | React + Vite, wrangler | 27 | 2 (14 pass) | PARTIALLY_IMPLEMENTED (service/rental modals have no backend; VM-AUDIT-003) |
| Admin / Sales / Ops / Finance / Inspection-review portals | `apps/*-portal` | React + wrangler | 2-9 each | admin 1, others 0 | IMPLEMENTED_NOT_VERIFIED |
| Inspector mobile | `apps/inspector-mobile` | **0 TS files** | 0 | 0 | NOT_IMPLEMENTED in this repo (docs only) |

- Entry points: Workers `services/api/src/worker-cf.ts` (Node-http bridge around Express `createApp` in `app.ts`); Node `server.ts`/`dev.ts`; email worker `worker.ts`.
- Schema: `services/api/prisma/schema.prisma` (2950 lines), 31 migrations.
- Auth: Firebase ID token verification (`auth.ts`, `edge-auth.ts`) + DB-backed RBAC in `*-store.ts`.
- Secrets: `secrets/`, `.env`, `storage/` are git-ignored (checked with `git check-ignore`).
- Docs: 120+ feature docs in `docs/`; handoff `docs/V2_AGENT_HANDOFF.md`.
