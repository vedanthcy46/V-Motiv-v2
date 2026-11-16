# Plan: the vehicle-scrapping journey on the website

Status: **approved and built** (see `docs/SCRAP_MODULE_ARCHITECTURE.md`, section 3c, for what was built, how it was checked and what was not). This page is the plan it followed. Correction to the plan below: the shared `createApiClient` did **not** originally keep the response body on `ApiError`; it now passes it as `details` (a one-line change in `packages/ui/src/api/client.ts`, covered by the ui tests), which the per-field errors depend on.

## 1. Where things stand (read from the code)

- `apps/customer-web` is a public marketing site: React 19 + Vite, no router, no sign-in, no API calls. Its only dependencies are `@vmotiv/ui`, `react`, `react-dom`. It deploys as static assets (Cloudflare `wrangler.jsonc`, single-page fallback already on; `vercel.json` also rewrites everything to `index.html`).
- The other web portals already show the pattern to copy: `apps/admin-portal/src/firebase.ts` (Firebase web config from `VITE_FIREBASE_*`, persistence, popup resolver) and the shared `createApiClient` in `packages/ui/src/api/client.ts` (token injection, one forced refresh on rejection, timeouts, `ApiError` that keeps the response body in `details`, which carries the scrapping API's per-field errors).
- The API side is ready: scrapping routes need only a verified Firebase token and a customer record. A first-time customer is created by `POST /api/v2/auth/sync`; the profile (phone, terms) is `GET/PATCH /api/v2/me`. CORS already allows `WEB_ORIGIN` (`https://vmotiv.in`, set in `render.yaml`).
- `public/_headers` sets `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`, but **no `Cross-Origin-Opener-Policy`**. Google sign-in in a popup needs `same-origin-allow-popups`; the dev server sets it, production does not.
- Business logic for the journey already exists as pure TypeScript with tests: `apps/customer-mobile/src/services/scrap-form.ts` and `scrap-text.ts` (no React Native imports). The questionnaire itself comes from the server.

## 2. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Allow customers to sign in on the website at all.** Today the site is anonymous and sends people to the app. This adds a signed-in area. | Yes, but only for the scrapping area, loaded on demand so the landing page stays as fast as it is now |
| 2 | **How the website shares the form logic with the app** | Import the two pure files from the app's folder (`../../customer-mobile/src/services/...`). Zero duplication and **no `package-lock.json` change**. It is an unusual cross-app import, so it needs a build check (see step 1). The tidier long-term option is a new shared workspace package, which changes the lockfile. |
| 3 | **Firebase `authDomain`.** The default `<project>.firebaseapp.com` can be blocked by browsers that restrict third-party storage (Safari, some Chrome settings), which breaks sign-in for those visitors. | Serve the auth helper from `vmotiv.in` itself, or use the redirect flow as the fallback. Decide before launch |
| 4 | **Web onboarding.** The app makes a new customer add a phone number and accept the terms before anything else. | Same rule on the web: the scrapping area needs a complete profile |
| 5 | **Parity.** The website will have the same limits as the app: no photo or document upload (private storage is still undecided), no inspection result yet. | Accept the same limits and say so on the page |

## 3. Scope

Pages (all under `/scrap`, matching the app): introduction, new request (the same seven steps), my requests, request details with offer response, cancel and concerns. The rest of the site is untouched and stays anonymous.

Not in scope: anything the app cannot do yet (uploads, inspection result, certificate viewing), a second set of business rules (the server remains the only authority), and any change to the existing landing page content.

## 4. Steps

Each step ends with typecheck, tests, and a build, and nothing ships until all are done.

**Step 1: foundations (no user-visible change).**
- Add `firebase` (`^13.1.0`, as the other portals) to `apps/customer-web/package.json`. **This updates `package-lock.json`**, so it must be committed together; Render does not build this app, but Cloudflare/Vercel builds that use `npm ci` will fail if they are out of step.
- Add `src/firebase.ts`, modelled on the admin portal, reading `VITE_FIREBASE_*` (public by design; no secrets) and the API base through `resolveApiBase`.
- Prove the cross-app import of the two pure files builds under `vite build` and `tsc`. If it does not, fall back to decision 2's alternative before going further.
- Add a minimal History-API router (no dependency): four routes, link handling, back/forward, 404 inside `/scrap`. The existing single-page fallback already serves `index.html` for these paths.

**Step 2: sign-in and account.**
- Google sign-in with popup, falling back to redirect when the popup is blocked. Handle: user closes the popup, popup blocked, network failure, account disabled (`ACCOUNT_INACTIVE`), unverified email.
- On sign-in: `POST /auth/sync`, then `GET /me`. If the profile has no phone or terms acceptance, show a profile step (same requirements as the app) and `PATCH /me`.
- Token held in memory by Firebase; nothing stored by us. Sign-out clears the local draft copy.
- Add `Cross-Origin-Opener-Policy: same-origin-allow-popups` for the site in `public/_headers` (and `vercel.json` if Vercel serves it).

**Step 3: the intake wizard.**
- Server-side draft with debounced autosave and a copy in `localStorage` (the web counterpart of the app's AsyncStorage copy), with the same rules: only changed fields sent, refused fields held back and shown, version conflict reloads the server draft, create is idempotent through a submission key.
- Real HTML forms: `<label>` for every input, `fieldset`/`legend` and radio groups for choices, `aria-live` regions for save status and errors, focus moved to the first error on a rejected step, 44px minimum touch targets, usable at 320px width and by keyboard alone. Back button and browser back both keep answers.

**Step 4: tracking.**
- Requests list (cursor paging) and details with the same content and the same plain wording as the app (from `scrap-text.ts`), offer accept/reject with an explicit confirmation, cancel, raise a concern. Refreshes on focus and on a visible "Refresh" control.

**Step 5: hardening and checks.**
- Tests: the existing pure-logic tests already cover the shared rules. New tests for the router, the draft storage and the autosave state machine (plain vitest with a fake `localStorage`; no new test dependencies). Browser component tests would need `jsdom` and Testing Library, which change the lockfile: propose separately.
- Manual QA matrix (needed, because no browser test exists): Chrome, Safari (desktop and iPhone), Firefox, Android Chrome; popup blocked; third-party storage blocked; offline mid-wizard; two tabs editing one draft; slow network; screen reader pass on the wizard; zoom to 200%.
- Performance: load the scrapping area and Firebase with a dynamic `import()` so the landing page bundle does not grow; measure the landing page before and after rather than assuming.
- Security review: no secrets in the bundle; CORS verified for `vmotiv.in` and `www.vmotiv.in` (check the second is in the allowed origins); response and error messages shown without echoing raw server text into the page unescaped; Firebase authorised domains set.

## 5. Infrastructure checklist (outside the code)

1. Firebase console: add `vmotiv.in` and `www.vmotiv.in` (and the preview domain, if used) to Authorised domains.
2. Build environment for the website: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_API_BASE` (the same values the other portals use).
3. Confirm `WEB_ORIGIN` (Render) covers every origin the site is served from.
4. Decide the `authDomain` approach (decision 3).
5. Update the privacy page (`public/privacy.html`) to say the website now signs people in and what it stores, **before** launch.

## 6. Risks

- **Sign-in in browsers that restrict third-party storage.** The most likely cause of "it works for me but not for some customers". Mitigated by decision 3 and the redirect fallback; needs real testing on Safari.
- **Lockfile drift** from adding `firebase` (step 1). Mitigated by committing the lockfile with the change and building once from a clean install.
- **Cross-app import** (decision 2) is unconventional; a build check in step 1 decides whether it is acceptable.
- **No browser tests.** The manual matrix in step 5 stands in for them and must actually be run.
- **Scope creep** into a general customer web app (buy, sell, service). This plan deliberately does not add those.

## 7. Estimate and order

Steps 1 and 2 first (they are the risky ones and make nothing visible). Then 3, 4, 5. Nothing about the order depends on the later scrapping phases, so this can run alongside Phase 4 (the sales portal), but the website should not launch before Phase 5's inspection result exists if you want it to match the app's final journey.
