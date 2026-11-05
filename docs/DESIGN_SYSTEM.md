# V MOTIV web design system (`@vmotiv/ui`)

Every web portal (Admin, Sales, Operations, Finance, Inspection Review and the customer website) uses one shared package,
`packages/ui`, built on **Tailwind CSS 4 + daisyUI 5**. It replaces the six separate stylesheets and the copy-pasted
refresh, live-change, notification and MFA code the portals used to carry.

## Using it in a portal

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
plugins: [tailwindcss(), react()]
```

```css
/* src/styles.css */
@import '@vmotiv/ui/styles.css';
@source '.';
/* only rules that are specific to this portal */
```

```tsx
// main.tsx
import { initTheme } from '@vmotiv/ui';
initTheme();   // applies the saved / system theme before the first paint
```

## What is shared

| Area | Provided by |
| --- | --- |
| Themes | `vmotiv-light`, `vmotiv-dark` (daisyUI themes in `src/styles/theme.css`). Toggle with `<ThemeToggle/>` / `useTheme()`; follows the OS by default. |
| Typography | Inter (self-hosted, no render-blocking font request), one type scale, tabular numbers. |
| Layout | `AppShell` (sidebar + topbar + footer), `SimpleShell`, `AuthLayout`, `CenterState`, public `Navbar` / `SiteFooter`. |
| Surfaces | `Card`, `StatCard`, `PageHeader`, `Modal`, `Drawer`, `ConfirmDialog`. |
| Controls | `Button`, `IconButton`, `TextField`, `SelectField`, `TextareaField`. |
| Status | `Badge`, `StatusBadge`, `CountBadge`, `Alert`, `EmptyState`, `ErrorState`, `NotificationBell`. |
| Feedback | `toast.success/error/info/warning` + `<Toaster/>`, `RequestProgress` (top bar while the server works), `Spinner`, `Skeleton*`, `PageLoader`. |
| Data | `createApiClient` (de-duplicated GETs, one 401 refresh, one retry for idempotent calls, progress bar), `useAction` (instant busy state + toast), `useAutoRefresh`, `useChangeWatcher`, `LiveChangeBar`, `MfaChallengeModal`. |

Existing markup that still uses the older class names (`.button.primary`, `.btn-primary`, `.panel`, `.metric-card`,
`.badge-green`, `.modal-overlay`, `.dialog`, …) is styled by `src/styles/legacy.css` in the same tokens, so it looks and
switches theme exactly like the React components. Dialogs built from `.modal-overlay` get Escape-to-close, scroll lock and
focus handling from `hooks/legacyOverlays.ts`.

### CSS layering

daisyUI 5 emits its components as sub-layers of Tailwind's `utilities` layer. Our chrome and compatibility rules live in
the later sub-layer `utilities.vm`, so they refine daisyUI while plain Tailwind utility classes written on an element still win.

### Colours

Use the daisyUI tokens (`bg-base-100`, `text-base-content`, `border-base-300`, `text-primary`, `bg-error/10`, …) or the
CSS variables (`var(--color-base-100)`, `var(--muted)`, `var(--color-primary)`). Never hard-code a hex colour: it cannot follow the theme.
The sidebar, sign-in panel and public navbar/footer are always brand navy; everything else follows the theme.

## Living style guide

```
npm run showcase -w @vmotiv/ui     # http://localhost:3900
```

## Speed

* Saving something no longer waits for a full data reload: dialogs close as soon as the server confirms, a toast confirms it
  and only the lists that change refresh first (Finance, Operations, Sales).
* Buttons show a spinner the instant they are pressed and ignore double clicks (`Button loading`, `useAction`).
* Sales loads identity, counts and page data in parallel instead of one group after another.
* Identical in-flight GETs share one request; background polling never drives the progress bar.
* Operations' workshop and rental screens (≈270 kB) load only when opened.
* API: read-only count/list batches run concurrently (`Promise.all`) instead of inside a sequential transaction.
