# V MOTIV V2 — Cross-Domain Integration: Car Service, Rental Fleet & Connect

## 1. Cross-Domain Architectural Contract
V MOTIV V2 unifies three high-value operational pillars:
1. **Part 1: Car Service & Maintenance Network** (`services/api/src/service-store.ts`)
2. **Part 2: Rental Fleet & Hourly Bookings** (`services/api/src/rental-store.ts`)
3. **Part 3: V MOTIV Connect™ Zero-Knowledge QR Protection** (`services/api/src/connect-store.ts`)

---

## 2. Service-to-Connect Interaction Rules
When a customer books car service for their vehicle in My Garage:

1. **Custody & Work Order Traceability**:
   - The `CustomerVehicle` record may have a linked `connectDeviceId` / `qrTokenHash`.
   - The service work order snapshot includes this reference for vehicle identification on the service hub floor.
2. **Zero Technician Takeover Privilege**:
   - Service technicians, bay managers, and service advisors **HAVE ZERO WRITE PERMISSION** over QR sticker ownership.
   - Technicians cannot unlink, re-assign, revoke, or toggle the customer's QR sticker.
   - The customer retains sovereign cryptographic control over their vehicle's Connect configuration at all times.
3. **Courtesy DND Mode (Optional Service State)**:
   - When a car is in active overhaul/paint booth, the customer or automated system can pause passerby alerts so workshop movement does not generate unnecessary alarms.

---

## 3. Rental-to-Connect Interaction Rules
When a customer rents a car from the V MOTIV Rental Fleet:

1. **Fleet Stickers Route to Central Support**:
   - Rental fleet vehicles carry physical V MOTIV Connect™ QR stickers.
   - **Crucial Rule**: The QR sticker on a fleet vehicle **NEVER** routes to the previous renter or an individual customer.
   - All passerby scans, messages, and calls route directly to **V MOTIV Central Fleet Operations & Roadside Assistance (24/7)**.
2. **Privacy Between Successive Renters**:
   - Renters have zero access to the sticker configuration, past alerts, or telematics of the rental car.
   - If an incident occurs during a rental (e.g. car parked incorrectly in a public lot), V MOTIV Fleet Operations receives the alert and coordinates directly with the active renter via their rental booking record.
3. **Vehicle Return & Handover**:
   - Handover and return inspection checklists (`RentalHandoverAndReturn`) verify the physical condition and presence of the V MOTIV Connect QR sticker on windshield.

---

## 4. Single Unified Customer Experience
In the V MOTIV Customer Mobile App (`apps/customer-mobile`):
- **My Garage**: Customer views all owned vehicles, maintenance schedules, active service requests, and manages their V MOTIV Connect QR stickers.
- **Rentals Tab**: Customer browses fleet inventory, books cars, manages security deposits, and completes digital rental handovers.
- **Activity & Requests Tab**: Unifies all service appointments, vehicle selling offers, test drives, support tickets, and real-time Connect passerby alerts into one consolidated timeline.
