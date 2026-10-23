# V MOTIV Official Production Website Landing Page

## 1. Overview & Root Route Resolution

The official production landing page for **V MOTIV** (`https://vmotiv.in/`) is implemented in `apps/customer-web` as a responsive, accessible React 19 + TypeScript SPA built with Vite.

When a visitor lands on `https://vmotiv.in/` (or locally `http://localhost:3100/`), the root route `/` resolves directly to the public landing page for both unauthenticated and returning authenticated visitors.

- **Public Discovery**: Unauthenticated visitors have complete access to browse published inventory, explore technical specs, view condition reports, and read buying/selling workflows without any forced login barriers or intro splash screens.
- **Action-Triggered Authentication**: Google Sign-In via Firebase is requested only when a customer initiates an account-scoped action—such as requesting a test drive, submitting a purchase enquiry, requesting a car valuation, or clicking "Sign In".
- **SPA Routing & Redirects**: Netlify SPA rewrite rules are defined in `apps/customer-web/public/_redirects` (`/* /index.html 200`), and browser history synchronization ensures `/`, `/cars`, `/sell`, `/how-it-works`, `/about`, `/contact`, `/terms`, `/privacy`, and `/account` all resolve smoothly.

---

## 2. Brand Identity & Exact Logo Fidelity

All visual assets follow the approved V MOTIV brand guidelines:

- **Primary Navy**: `#061A38` (header, primary buttons, deep contrast backgrounds)
- **Accent Yellow**: `#F7B503` (taglines, badge highlights, callouts)
- **White**: `#FFFFFF` (contrast text and card backgrounds)
- **Official Tagline**: *"YOUR VEHICLE. OUR ACCOUNTABILITY."*
- **Core Headline**: *"A better way to buy and sell your car."*
- **Approved Logo Assets**:
  - Horizontal header brand: `apps/customer-web/public/brand/vmotiv-header-brand-v2.png`
  - Vertical lockup: `apps/customer-web/public/brand/vmotiv-lockup.svg` (incorporates the yellow divider bar and tagline)
  - Vector emblem: `apps/customer-web/public/brand/vmotiv-logo.svg`
  - Favicon & App Icon: `apps/customer-web/public/favicon.ico`, `favicon.png`, `brand/vmotiv-icon.png`

---

## 3. Page Structure & Component Architecture

1. **Header / Navbar (`Navbar.tsx`)**:
   - Persistent sticky header with official horizontal logo linking to `/`.
   - Desktop navigation: Home, Buy Cars, Sell Your Car, How It Works, Why V MOTIV, About, Contact.
   - Account indicator: Clean "Sign In" button (with Google glyph) when unauthenticated; personalized profile pill with status dot when authenticated.
   - Accessible mobile drawer with hamburger toggle.

2. **Hero Section (`Hero.tsx`)**:
   - Eyebrow badge: "ACCOUNTABLE AUTOMOTIVE PLATFORM".
   - Headline: *"A better way to buy and sell your car."*
   - Supporting copy: *"Explore available cars or tell us about the car you want to sell. Clear steps, helpful people and updates throughout your journey."*
   - Callout: *"YOUR VEHICLE. OUR ACCOUNTABILITY."*
   - Dual CTAs: Primary "Explore Cars" (`#cars`), Secondary "Sell Your Car" (`#sell`).
   - Trust highlights bar (Verified Details, Supported Hubs, Clear Process).

3. **Buy / Sell Quick Action Cards (`QuickActions.tsx`)**:
   - **Buy a Verified Car**: Feature checklist and button navigating to live inventory.
   - **Sell Your Car**: Feature checklist and button opening the seller intake modal.

4. **Available Cars Live Preview (`AvailableCars.tsx`)**:
   - Fetches live published vehicles from `GET /api/v1/inventory?limit=6`.
   - Interactive filter chips: All Cars, Petrol, Diesel, Automatic.
   - Vehicle cards display real photos, title, year, odometer (km), fuel type, transmission, city, and price formatted in INR Lakhs (`₹X.XX Lakh`).
   - Honest empty state: *"New cars are coming soon. We only publish cars that meet our strict verification standards."* No fake listings or inflated counts.

5. **How It Works (`HowItWorks.tsx`)**:
   - Tabbed interface switching between:
     - **How Buying Works**: 4 clear steps (Browse Verified Cars, Request a Test Drive, Inspect in Person, Accountable Handover).
     - **How Selling Works**: 4 clear steps (Share Vehicle Details, Schedule Inspection, Receive Clear Offer, Instant Payment & RC Care).

6. **Why V MOTIV (`WhyVMotiv.tsx`)**:
   - 4 foundational pillars: Accountability First, Factual Verification, Clear & Fast Communication, Complete Paperwork Assistance.

7. **Mobile App Showcase (`MobileAppSection.tsx`)**:
   - Highlights the native V MOTIV customer mobile app features (live request tracking, instant offer reviews, integrated support) with Android and iOS platform badges.

8. **About V MOTIV (`AboutSection.tsx`)**:
   - Company background, mission, customer promise, and active operational hubs (Bengaluru, Chennai, Delhi NCR, Hyderabad, Mumbai, Pune) with support hours.

9. **Accessible FAQ Accordion (`FAQSection.tsx`)**:
   - Accessible accordion using `aria-expanded` and `aria-controls` answering common buyer and seller questions.

10. **Final Dual-Action CTA Banner (`FinalCTA.tsx`)**:
    - Direct dual prompt to explore available inventory or sell an existing car.

11. **Site Footer (`Footer.tsx`)**:
    - Complete official logo lockup with tagline *"YOUR VEHICLE. OUR ACCOUNTABILITY."*.
    - Site navigation links, operating hub locations, support email (`support@vmotiv.in`), Terms of Service, and Privacy Policy dialog links.

---

## 4. Modal Dialogs & Interactions

- **`AuthModal.tsx`**: Clean Google Sign-In prompt with descriptive context explaining why an account is needed for the requested action.
- **`AccountModal.tsx`**: Customer profile drawer showing user email, display name, account status, marketing subscription preferences, and Sign Out.
- **`VehicleDetailModal.tsx`**: Full-screen modal for exploring a car's photo gallery, specifications, condition summary, inspection report, and scheduling a test drive or submitting an enquiry.
- **`SellCarModal.tsx`**: 3-step structured seller intake form capturing seller contact, vehicle specifications (make, model, year, fuel, km, expected price), and hub or doorstep inspection preferences.
- **`LegalModal.tsx`**: In-app modal viewer for Terms of Service and Privacy Policy.

---

## 5. Verification & Testing

- **Vitest Unit Suite**: 12 passing unit tests in `apps/customer-web` covering currency formatters (`formatInrPaise`, `formatLakh`), inventory querying, city loading, seller lead submissions, test-drive scheduling, and enquiry requests.
- **TypeScript Typecheck**: `tsc --noEmit` passes cleanly across all workspaces (`@vmotiv/api`, `@vmotiv/customer-mobile`, `@vmotiv/customer-web`).
- **Production Build**: `vite build` outputs optimized static assets (`dist/`) ready for deployment on Netlify, Cloudflare Pages, or Vercel.
