# V MOTIV V2 — Service Custody & Handover Protocols

## 1. Overview
Vehicle custody transfer is a high-liability touchpoint in automotive operations. To protect both customers and V MOTIV against disputes regarding pre-existing damage, odometer tampering, lost personal items, and fuel discrepancies, a strict digital custody protocol is enforced at both vehicle intake (**Check-In**) and vehicle return (**Check-Out**).

---

## 2. Inward Custody Protocol (Check-In)
Executed when a vehicle enters V MOTIV physical control (at customer doorstep by `PICKUP_DRIVER` or at hub bay by `SERVICE_ADVISOR`).

### Required Data Capture:
1. **Odometer Verification**: Exact integer kilometer reading recorded and automatically updated on the `CustomerVehicle` model.
2. **Fuel / State-of-Charge Level**: Fractional estimate (e.g., `25%`, `50%`, `75%`, `Full`, `Electric: 82% SoC`).
3. **Key Inventory**: Physical keys received (main key, spare key, valet key).
4. **Accessories Checklist**: JSON record verifying toolkit, spare tyre, jack, floor mats, dashcam, perfume, emergency triangle, infotainment SD card.
5. **Pre-Existing Damage Mapping**:
   - Comprehensive perimeter inspection (front bumper, rear bumper, side panels, alloys, windshield).
   - High-resolution photographic evidence uploaded to secure storage (`/api/v2/media/upload`).
   - Detailed textual condition notes.
6. **Handover Personnel & Customer Sign-off**:
   - Staff member ID and name.
   - Handover person (customer or authorized family member).
   - Digital signature or explicit in-app confirmation (`customerAcknowledged: true`).

---

## 3. Outward Custody Protocol (Check-Out)
Executed when the vehicle is returned to the customer post-service.

### Comparison & Verification:
1. **Odometer Comparison**: Verifies that road test distance matches the work order and no unauthorized mileage was accumulated.
2. **Fuel Level Verification**: Ensures vehicle was not returned with depleted fuel/charge.
3. **Damage Comparison**: Confirms that no new dents, scratches, or paint blemishes occurred while under hub custody.
4. **Cleanliness Verification**: Post-wash quality check confirming spotless cabin and exterior.
5. **Customer Acknowledgement**: Customer inspects the car, verifies repairs, and signs digital acceptance.
6. **Milestone Update**: The vehicle's `lastServiceDate` is finalized, and `nextServiceDueKm` is automatically set to `+10,000 km`.
