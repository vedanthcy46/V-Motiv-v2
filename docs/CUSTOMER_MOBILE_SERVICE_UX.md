# V MOTIV V2 — Customer Mobile Service & Garage UX Guide

## 1. Design Principles for Novice Car Owners
Many car owners find automotive repairs intimidating and jargon-heavy. The V MOTIV Service & Garage UI adheres to four core UX guidelines:
1. **Plain Language over Jargon**:
   - Instead of "HVAC Refrigerant Leak Detected", use "AC Service & Cooling Issue".
   - Instead of "Suspension Control Arm Bushing Failure", use "Noise, Rattle & Vibration".
2. **One-Question-at-a-Time Wizard**:
   - The booking flow is segmented into 6 logical steps (Vehicle -> Issue -> Details -> Fulfillment -> Schedule -> Review).
   - Easy "Back" navigation at all times without losing entered inputs.
3. **Transparent Sizing & Touch Targets**:
   - Large interactive cards (`minimum 48dp` touch targets).
   - Highly legible typography (16–20pt headers, 13–15pt body).
   - Distinct brand badges using authentic logos via `CarBrandLogo`.
4. **Resumable & Non-Destructive**:
   - Adding a car or checking prices is friction-free.
   - Archiving a vehicle preserves all historical maintenance logs and invoices.

---

## 2. Light & Dark Theme Adaptation
Every screen strictly implements V MOTIV's official theme palette:
- **Brand Navy**: `#061A38` (Deep authority navy)
- **Brand Accent**: `#F7B503` (Warm signature yellow)
- **Dark Mode**:
  - Background: `#061A38` / `#0A1628`
  - Cards & Surfaces: `#112744` / `#162C4E`
  - Borders: `#233857` / `#29405F`
  - Text: `#FFFFFF` (Primary), `#94A3B8` (Secondary)
- **Light Mode**:
  - Background: `#F8FAFC`
  - Cards & Surfaces: `#FFFFFF`
  - Borders: `#E2E8F0`
  - Text: `#061A38` (Primary), `#64748B` (Secondary)
- **No White Modals in Dark Mode**: Modals render `#112744` backgrounds in dark mode with dark semi-transparent overlays (`rgba(0,0,0,0.6)`).
- **Monochrome Dark Logo Auto-Inversion**: Dark brand marks (Audi, Citroen, Nissan, Kia, Volvo, Jaguar, Jeep) invert to crisp white when rendered in dark mode.

---

## 3. Screen Inventory

| Screen | Route Name | Key Features |
| :--- | :--- | :--- |
| **My Garage** | `MyGarage` | Saved vehicles list, "+ Add Car" modal, preferred default toggle, odometer & next service due dates, active service tracking banner, V MOTIV Connect reservation card. |
| **Service Booking** | `ServiceHome` | 6-step wizard: Car selection, 10 animated issue category cards, dynamic question engine, fulfillment selector (Doorstep vs Hub), slot calendar, summary breakdown. |
| **Service Tracking** | `ServiceRequestDetails` | Real-time status badge, car & hub info, live vertical timeline, itemized estimate approval modal, vehicle custody report, technician diagnosis findings, cancel action. |
| **Activity Center** | `RequestsScreen` (Activity tab) | Includes dedicated `Car Service` tab displaying active service requests alongside Selling and Test Drive requests. |
| **Customer Home** | `HomeScreen` | Prominent `Car Service` tile with `BOOK NOW` badge directly launching the service wizard. |
| **Account Menu** | `AccountScreen` | Added `My Garage` menu item with Car icon leading directly to garage management. |
