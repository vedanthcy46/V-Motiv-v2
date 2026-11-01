# V MOTIV V2 — Mobile Regression Test Suite
## End-to-End Workflow & Integration Assurance

### Test Suite Execution Summary

All primary customer modules have been validated against real backend routes and local mobile runtime builds.

| Workflow | Test Scenarios | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| **Authentication** | Google Sign-In, token persistence, guest connect mode, sign out | Firebase Auth Provider | Verified |
| **Buy / Inventory** | Catalog search, Spinny multi-make filter, price bounds, wishlist toggle | `customer.inventory()`, `addWishlist()` | Verified |
| **Vehicle Detail** | 16:9 photo gallery, 200-pt QC viewer, test-drive request, purchase enquiry | `customer.vehicle()`, `testDrives()` | Verified |
| **Sell / Valuation** | 7-step wizard, instant indicative valuation, doorstep inspection slotting, draft save/resume | `customer.sell()`, `readSellDraft()` | Verified |
| **Activity Tracking** | Real-time status for selling leads, test drives, purchase enquiries, service requests | `customer.activity()`, `fetchConnectAlerts()` | Verified |
| **My Garage** | Digital ownership binder, V MOTIV Connect QR generation, private telephony | `customer.garage()`, `connect-api` | Verified |
| **Service & Rental** | Doorstep maintenance booking, self-drive fleet search, hub pickup selection | `service-api`, `rental-api` | Verified |
| **Appearance** | System / Light / Dark mode switching, persistent AsyncStorage storage | `ThemeProvider`, `AsyncStorage` | Verified |
| **Accessibility** | Reduce transparency solid fallback, 44pt touch targets, TalkBack/VoiceOver labels | `AccessibilityInfo`, TalkBack check | Verified |
| **Keyboard Avoidance**| Forms never occluded by virtual keyboard, scroll restoration on blur | `KeyboardAwareFormScreen` | Verified |
