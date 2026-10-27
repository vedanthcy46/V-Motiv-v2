# V MOTIV V2 — Rental Custody Handover & Return Protocol

## 1. Pickup Custody Verification Protocol

Physical vehicle handover occurs at the designated V MOTIV hub. The process establishes the baseline physical and mechanical state of the vehicle before the customer assumes custody.

### Handover Checklist:
1. **Physical Driver ID Check**: Staff compares the physical Driving License with the pre-approved KYC record.
2. **Vehicle Identity**: Physical registration plate and VIN match the booking asset (`RentalFleetVehicle`).
3. **Odometer Recording**: Authoritative starting odometer reading entered by staff.
4. **Fuel State**: Visual verification of fuel tank gauge percentage.
5. **360-Degree Photos**: Staff captures front, rear, both sides, and interior cabin photos.
6. **Existing Scratches / Dents**: Noted on the initial handover sheet so the customer is not held responsible for pre-existing wear.
7. **Customer & Staff Signature**: Both parties sign the digital custody log.

---

## 2. Return Custody Inspection Protocol

Upon vehicle return to the hub, staff completes the return custody inspection:

```
[RETURN INSPECTION CHECKLIST]
[x] Actual return timestamp recorded
[x] Return odometer reading entered (must be >= pickup odometer)
[x] Return fuel tank percentage recorded
[x] 360-degree exterior & interior return photos captured
[x] Keys & vehicle accessories (Fastag, spare wheel, tool kit) verified
[x] Customer signature on return inspection report
```

### Automated Return Calculations:
- **Distance Driven**: $\text{returnOdometer} - \text{pickupOdometer}$
- **Excess Kilometer Fee**:
  $$\text{excessKm} = \max(0, \text{distanceDriven} - \text{includedKm})$$
  $$\text{excessFee} = \text{excessKm} \times \text{extraKmRate}$$
- **Fuel Deficit Charge**: If $\text{returnFuel} < \text{pickupFuel}$, billed at standard rate (~₹65 per 1% fuel capacity).
- **Overtime Fee**: If return exceeds scheduled return time by more than a 30-minute grace period, overtime hours are charged at **1.5x standard hourly rate**.

---

## 3. Post-Trip Turnaround Buffer

Upon return sign-off, the vehicle automatically transitions to `CLEANING` status, and an automated **120-minute turnaround block** (`RentalVehicleBlock`) is created. This ensures the car is washed, vacuumed, mechanically inspected, and refueled before being assigned to the next customer.
