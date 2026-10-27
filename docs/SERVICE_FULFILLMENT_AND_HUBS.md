# V MOTIV V2 — Service Fulfillment & Hub Network

## 1. Fulfillment Modes

Customers can choose between two distinct vehicle handover workflows:

### A. PICKUP_AND_RETURN (Doorstep Logistics)
- **Customer Experience**: A certified V MOTIV pickup driver visits the customer's specified home or office address during the confirmed time window.
- **Logistics Fee**: Standard fixed fee of ₹499 (49,900 paise), itemized clearly on the booking summary and final invoice.
- **Coverage**: Available within a configured radius (default 25–35 km) from the assigned city hub.
- **Return Handover**: Upon completion and payment verification, the return driver delivers the vehicle back to the declared return address.

### B. SELF_DROP_AT_HUB (Customer Drive-In)
- **Customer Experience**: The customer brings their car directly to the chosen authorized V MOTIV service center.
- **Logistics Fee**: Free (₹0).
- **Amenities**: Dedicated advisor reception bay, customer lounge, and direct mechanical consultation.
- **Collection**: Customer collects the vehicle from the hub bay upon completion.

---

## 2. Authorized Service Hub Network

| Hub Code | Name | City | Capacity / Slot | Pickup Radius | Operating Hours |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HUB-CHN-01` | V MOTIV Central Service Hub | Chennai | 6 Bays | 30 km | 08:00 - 19:30 Mon-Sat |
| `HUB-BLR-01` | V MOTIV Tech Service Hub | Bangalore | 6 Bays | 35 km | 08:00 - 20:00 Mon-Sat |
| `HUB-HYD-01` | V MOTIV Premium Hub | Hyderabad | 5 Bays | 30 km | 08:30 - 19:30 Mon-Sat |
| `HUB-COI-01` | V MOTIV City Hub | Coimbatore | 4 Bays | 25 km | 08:30 - 19:00 Mon-Sat |

---

## 3. Slot Capacity & Atomic Booking Management
To prevent bay overcrowding and unrealistic scheduling promises:
1. Four standard daily operational windows are allocated:
   - `09:00 - 11:00` (Morning Intake 1)
   - `11:00 - 13:00` (Morning Intake 2)
   - `14:00 - 16:00` (Afternoon Intake 1)
   - `16:00 - 18:00` (Afternoon Intake 2)
2. `ServiceSlotCapacity` records track `maxCapacity` versus `bookedCount` for each `[hubId, slotDate, slotTime]`.
3. When a booking is submitted, the transaction atomically checks `bookedCount < maxCapacity` and increments the count.
4. If capacity is exhausted, the slot displays "Full" and the API rejects overbooking attempts with `409 SLOT_FULL`.
5. Pre-dispatch cancellations atomically decrement the slot booked count to immediately release availability to other customers.
