# V MOTIV V2 — Customer App Theme Route Audit

## 1. Audit Scope
Every navigable route in [`apps/customer-mobile/src/navigation/CustomerNavigator.tsx`](file:///apps/customer-mobile/src/navigation/CustomerNavigator.tsx) has been verified for correct theme inheritance, contrast ratios, and edge-to-edge system styling.

---

## 2. Route Audit Table

| Stack / Route Name | Component | Status Bar | Background Token | Surface Token | Text Primary Token |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`Tabs` -> `Home`** | `HomeScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Tabs` -> `Explore`** | `ExploreScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Tabs` -> `Sell`** | `SellScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Tabs` -> `Activity`** | `RequestsScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Tabs` -> `Account`** | `AccountScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Vehicle`** | `VehicleScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`VehicleGallery`** | `VehicleGalleryScreen`| Hidden / Dark | `#000000` | `rgba(0,0,0,0.7)` | `#FFFFFF` |
| **`InspectionHighlights`**| `InspectionHighlightsScreen`| Dynamic | `colors.background`| `colors.surface` | `colors.textPrimary` |
| **`PurchaseEnquiry`** | `PurchaseEnquiryScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`TestDrive`** | `TestDriveScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`SellingRequestDetails`**| `SellingRequestDetailsScreen`| Dynamic | `colors.background`| `colors.surface` | `colors.textPrimary` |
| **`Support`** | `SupportScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`SupportCaseDetails`** | `SupportCaseDetailsScreen` | Dynamic | `colors.background`| `colors.surface` | `colors.textPrimary` |
| **`ProfileEditor`** | `ProfileEditorScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Addresses`** | `AddressesScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`CitySelection`** | `CitySelectionScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`MarketingPreferences`**| `MarketingPreferencesScreen`| Dynamic | `colors.background`| `colors.surface` | `colors.textPrimary` |
| **`PrivacySettings`** | `PrivacySettingsScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Wishlist`** | `WishlistScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Auth`** | `AuthScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **`Onboarding`** | `OnboardingScreen` | Dynamic | `colors.background` | `colors.surface` | `colors.textPrimary` |
| **Modal -> `Notifications`**| `NotificationsModal` | Dynamic | `colors.overlay` | `colors.surface` | `colors.textPrimary` |

---

## 3. Navigation Bar & Bottom Tab Styling
- In [`CustomerNavigator.tsx`](file:///apps/customer-mobile/src/navigation/CustomerNavigator.tsx):
  - **Tab Bar Background**: Dynamic `colors.surface` (Light: `#FFFFFF`, Dark: `#0A1C33`).
  - **Tab Bar Border**: Dynamic `colors.border` (Light: `#E2E8F0`, Dark: `#1A3557`).
  - **Active Icon / Text**: `colors.brandAccent` (`#F7B503`).
  - **Inactive Icon / Text**: `colors.textMuted` (Light: `#64748B`, Dark: `#6B7F99`).
- **Stack Headers**:
  - Themed via React Navigation's root `theme` object.
  - Custom in-screen headers use `colors.textPrimary` for ArrowLeft and screen title.
