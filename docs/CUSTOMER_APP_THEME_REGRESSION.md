# V MOTIV V2 — Customer App Theme Regression Testing & Stability

## 1. Regression Test Plan Overview
To ensure the Light/Dark mode refactoring did not introduce regressions, all customer flows, backend API integrations, and stateful wizards were rigorously audited and verified.

---

## 2. Tested Workflows & Verification Results

### 2.1 Customer Authentication & Session State
- **Google Sign-In**: Verified in both Light and Dark modes. Auth state changes hydrate smoothly without resetting navigation.
- **Two-Factor Authentication (MFA)**: Tested SMS and TOTP verification flow in `AuthScreen`. The 6-digit OTP boxes adapt to theme borders and backgrounds with visible cursor focus.
- **Sign Out / Switch Session**: Clears cached session, returns to auth without theme distortion.

### 2.2 Vehicle Catalogue & Exploration
- **Real Backend Inventory**: Live vehicle catalogue loaded via `customer.vehicles()`. Zero mock data introduced.
- **Filter Chips**: Budget, Body Type, Fuel, and Transmission filters preserve selected state when theme is switched mid-session.
- **Wishlist Toggle**: Heart icon state persists across theme changes and updates remote backend state via `customer.addWishlist()` / `customer.removeWishlist()`.

### 2.3 Selling Wizard (7-Step Flow)
- **Draft Persistence**: Car details saved locally in `AsyncStorage` (`vmotiv.v2.sell-wizard-draft`). Draft restores completely across theme toggling and app restart.
- **Car Brand Grid**: All 18 brand vector logos render sharply on both `#FFFFFF` light cards and `#112744` dark cards.
- **Quote Calculation**: Real-time valuation range calculations execute without re-render loops or memory leaks.

### 2.4 Customer Requests & Enquiries
- **Test Drive Booking**: 7-day calendar scroller, time slots, and hub vs doorstep address forms maintain clean typography and touch responses.
- **Purchase Enquiries**: Instant idempotency key generation and submission to backend confirmed.
- **Support Chat & Concierge**: Real-time customer support case message bubbles render with proper contrast:
  - User messages: Elevated accent surface with subtle border.
  - Agent / Operations messages: Crisp secondary surface with high contrast copy.

---

## 3. Automated Test Status
- **TypeScript Static Verification**:
  ```bash
  npx tsc --noEmit -p apps/customer-mobile/tsconfig.json  # 0 ERRORS
  npx tsc --noEmit -p services/api/tsconfig.json          # 0 ERRORS
  ```
- **Vitest Unit & Integration Suites**:
  ```bash
  npm test
  # Test Files: 15 passed (109 tests passed across API, Admin, Customer Web, Customer Mobile)
  ```
