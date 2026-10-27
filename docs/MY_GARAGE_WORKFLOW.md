# V MOTIV V2 — My Garage Workflow & Specifications

## 1. Overview
**My Garage** is the centralized automotive asset repository for V MOTIV customers. It manages personal and commercial vehicles owned or authorized by the customer, serving as the foundational launchpad for:
1. Periodic maintenance bookings.
2. Unscheduled repairs and diagnostics.
3. Service history and invoice record preservation.
4. Maintenance intervals and reminder tracking.
5. V MOTIV Connect™ hardware integration (reserved for Part 3).

---

## 2. Vehicle Entity Attributes

| Attribute | Type | Description | Customer Editable |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Unique identifier | No |
| `make` | String | Vehicle manufacturer (e.g., Hyundai, Tata, BYD) | On Creation |
| `model` | String | Model family (e.g., Creta, Nexon, Atto 3) | On Creation |
| `year` | Int | Manufacturing year (1980 - present+1) | On Creation |
| `variant` | String? | Trim level (e.g., SX (O), Fearless+) | Yes |
| `fuelType` | String | PETROL, DIESEL, ELECTRIC, HYBRID, CNG | On Creation |
| `transmission` | String | MANUAL, AUTOMATIC | On Creation |
| `color` | String? | Declared paint finish (e.g., Polar White) | Yes |
| `registrationNumber` | String? | State plate number (e.g., TN09BK1234) | Yes |
| `odometerKm` | Int? | Last recorded odometer reading | Yes / Auto-updated on custody |
| `vin` | String? | 17-digit Chassis Number | Yes |
| `declaredOwnership` | Enum | OWNER, FAMILY, LEASED, AUTHORIZED_USER | Yes |
| `isPreferred` | Boolean | Customer default vehicle flag | Yes |
| `isArchived` | Boolean | Soft-archive flag (preserves historical data) | Yes (via Archive API) |
| `lastServiceDate` | DateTime? | Date of most recent service completion | Auto-updated on completion |
| `nextServiceDueKm` | Int? | Recommended next service odometer reading | Auto-calculated (+10,000 km) |
| `nextServiceDueDate` | DateTime? | Recommended next service calendar date | Auto-calculated (+180 days) |
| `connectDeviceId` | String? | Reserved for Part 3 OBD-II telematics | Reserved |
| `connectStatus` | String | NOT_CONNECTED, PENDING, ACTIVE (Part 3) | Reserved |

---

## 3. Business Logic & Constraints

### 3.1 Multiple Vehicles
A customer can register an arbitrary number of vehicles in their garage. Adding a vehicle does not verify ownership automatically; the declared ownership relationship is preserved as declared by the customer.

### 3.2 Default Vehicle Selection
- If a customer adds their first vehicle, it is automatically marked `isPreferred = true`.
- When a user explicitly marks a vehicle as preferred, all other vehicles for that customer account are atomically set to `isPreferred = false` within a database transaction.

### 3.3 Soft Archiving (No History Loss)
- Vehicles are never hard-deleted from PostgreSQL. When a customer removes a car, `isArchived = true` and `archivedAt = now()` are recorded.
- Historical invoices, past service requests, custody reports, and work orders retain foreign key integrity to the vehicle.
- If an active service request exists (status not in `COMPLETED` or `CANCELLED`), archiving is rejected with `409 CANNOT_ARCHIVE_VEHICLE_WITH_ACTIVE_SERVICE`.
- If an archived car was the preferred default, another active car is promoted to preferred automatically.

---

## 4. V MOTIV Connect™ Reservation (Part 3 Boundary)
In `MyGarageScreen.tsx`:
- A dedicated card displays **V MOTIV Connect™** with a `COMING IN PART 3` badge.
- Outlines future OBD-II live telematics: instant battery voltage, live trouble codes (DTCs), odometer tracking, and automated service booking.
- The button is safely rendered in a disabled/informational state without executing network calls or mock device setups.
