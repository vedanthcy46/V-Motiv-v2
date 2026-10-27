# V MOTIV V2 — Rental Availability Engine & Concurrency Locking

## 1. Concurrency Problem Statement

In an online advance self-drive platform, multiple customers frequently browse and attempt to reserve the same vehicle during peak travel windows (weekends, holidays). If availability checks are executed without concurrency controls:
1. Two customers can proceed to the payment gateway simultaneously.
2. Both payments succeed, but only one vehicle exists.
3. The platform is forced into embarrassing customer rejections, emergency cancellations, or regulatory complaints.

---

## 2. Interval Model & Buffer Architecture

All reservation intervals are treated as **half-open temporal intervals**: `[startTime, endTime)`.

### Operational Turnaround Buffer:
Vehicles cannot be handed over to a new customer immediately upon return. Every vehicle model defines `cleaningBufferMinutes` (default: **120 minutes**).

When checking availability for interval `[reqStart, reqEnd)`, the effective operational reservation window is:
$$\text{Window} = [\text{reqStart} - \text{buffer}, \text{reqEnd} + \text{buffer})$$

```
Existing Trip:     [---------- TRIP A ----------] + [ BUFFER (2 hrs) ]
New Request:                                        [---------- TRIP B ----------]
Availability:      CONFLICT (overlaps turnaround buffer)
```

---

## 3. Atomic Database Transactions & Hold Creation

To guarantee that only one customer can hold a vehicle, `createHold` runs inside an atomic PostgreSQL transaction (`db.$transaction`):

```ts
return await this.db.$transaction(async tx => {
  // 1. Re-validate vehicle status and statutory eligibility
  const vehicle = await tx.rentalFleetVehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle.isEligibleForRental || vehicle.status === 'RETIRED') {
    throw new HttpError(400, 'VEHICLE_NOT_ELIGIBLE_FOR_RENTAL');
  }

  // 2. Query conflicting confirmed bookings in window
  const conflictingBooking = await tx.rentalBooking.findFirst({
    where: {
      vehicleId,
      status: { in: ['CONFIRMED', 'VEHICLE_COLLECTED', 'TRIP_ACTIVE'] },
      startTime: { lt: windowEndWithBuffer },
      endTime: { gt: windowStartWithBuffer },
    },
  });
  if (conflictingBooking) {
    throw new HttpError(409, 'VEHICLE_UNAVAILABLE_OVERLAPPING_BOOKING');
  }

  // 3. Query active unexpired holds in window
  const conflictingHold = await tx.rentalBookingHold.findFirst({
    where: {
      vehicleId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      startTime: { lt: windowEndWithBuffer },
      endTime: { gt: windowStartWithBuffer },
    },
  });
  if (conflictingHold) {
    throw new HttpError(409, 'VEHICLE_UNAVAILABLE_ACTIVE_CHECKOUT_HOLD');
  }

  // 4. Query maintenance / cleaning blocks in window
  const conflictingBlock = await tx.rentalVehicleBlock.findFirst({
    where: {
      vehicleId,
      startTime: { lt: windowEndWithBuffer },
      endTime: { gt: windowStartWithBuffer },
    },
  });
  if (conflictingBlock) {
    throw new HttpError(409, 'VEHICLE_UNAVAILABLE_MAINTENANCE_BLOCK');
  }

  // 5. Insert exclusive 15-minute hold
  return await tx.rentalBookingHold.create({ ... });
});
```

If two concurrent requests target the same vehicle, the second transaction is immediately blocked and returned a clean HTTP `409 Conflict`.

---

## 4. 15-Minute TTL Expiration Lifecycle

1. **Active**: The customer has 15 minutes to review terms, submit driver details, and authorize payment through Razorpay.
2. **Converted**: When payment succeeds and booking is created, hold transitions to `CONVERTED`.
3. **Expired**: If the 15-minute TTL lapses without checkout, status becomes `EXPIRED`. Availability is instantly freed for subsequent searches.
4. **Late Payment Handling**: If a webhook arrives after hold expiration:
   - The engine checks if the vehicle is still free. If free, booking confirms normally.
   - If a competing customer has reserved the vehicle, the late payment is recorded as `VERIFIED` and flagged for an **immediate automated Finance refund exception** (`PAYMENT_RECEIVED_AFTER_HOLD_EXPIRY_REFUND_INITIATED`), preventing double-booking.
