# V MOTIV public website (`apps/customer-web`)

The public website at `https://vmotiv.in/` is an **information-only** page. It explains the platform and sends visitors to the
mobile app. Everything transactional happens in the app:

- buying: browsing cars, test drives, purchase enquiries
- selling: valuation requests and offers
- car service bookings
- car rentals
- sign-in and account

The website has no sign-in, no booking forms and no inventory listing, and it does not call the customer API (except the
public QR page below). Old links (`/cars`, `/sell`, `/service`, `/rentals`, `/account`) scroll to the "Get the app" section.

## Sections (in order)

1. **Navbar**: shared `@vmotiv/ui` navbar (Home, The Platform, How It Works, Why V MOTIV, About, FAQ, Contact, Get the App, theme switch).
2. **Hero**: headline, "Get the App" and "How It Works" buttons, trust highlights.
3. **The Platform** (`QuickActions.tsx`): four cards explaining Buy, Sell, Service and Rent, then a "Get the V MOTIV app" button.
4. **How It Works**: buying and selling steps, with a note that requests are made in the app.
5. **Why V MOTIV**: accountability pillars.
6. **The App** (`MobileAppSection.tsx`, `#app`): what the app does and the store links.
7. **About**: background and operating hubs.
8. **FAQ**: accessible accordion, including "Can I book or buy through this website?".
9. **Final call to action**, then the shared footer with Terms and Privacy dialogs (`/terms`, `/privacy`).

## Store links

Set `VITE_ANDROID_APP_URL` and `VITE_IOS_APP_URL` (see `.env.example`) when the store listings are live. While a value is empty the
site shows "Android: coming soon" / "iOS: coming soon" instead of a dead button.

## Kept on purpose

`/connect/<token>` is the page a V MOTIV Connect QR sticker opens when scanned with any camera. It does not call or chat: it opens the app (Android intent with a Play Store fallback; custom link on iOS) or offers to install it. Private calls and messages happen only in the app, where "Scan a V MOTIV Connect QR without signing in" on the login screen scans a sticker and opens that car's private call and message options. Set `VITE_ANDROID_APP_URL` / `VITE_IOS_APP_URL` for the store links (Android defaults to the in.vmotiv.customer Play Store page).
It is not a booking and is unchanged.

## Styling

Uses the shared design system (`docs/DESIGN_SYSTEM.md`): shared navbar, footer, dialog and light/dark themes. Unused old styles for the
removed booking screens were deleted from `src/styles.css`.

## Checks

`npm run typecheck -w @vmotiv/customer-web` and `npm run build -w @vmotiv/customer-web`. The unit tests that covered the removed
inventory, test-drive, enquiry and seller-lead API client were removed with it.
