# V MOTIV V2 — Rental Notification Events Matrix

All advance rental domain events are integrated with the central `NotificationService` and dispatched across **In-App Alerts**, **Expo Push Notifications**, and **Resend Transactional Emails**.

| Event Type | Priority | Target Audience | Trigger Scenario | Email / Push Content |
| :--- | :--- | :--- | :--- | :--- |
| `RENTAL_HOLD_CREATED` | HIGH | Customer | Temporary 15-minute checkout hold placed on vehicle | "Your 15-minute hold for {vehicle} is active. Complete checkout to confirm." |
| `RENTAL_PAYMENT_PENDING` | NORMAL | Customer | Checkout initiated, waiting for payment gateway callback | "Order {bookingNumber} created. Awaiting payment authorization." |
| `RENTAL_PAYMENT_VERIFIED` | HIGH | Customer & Finance | Payment gateway signature verified server-side | "Payment of ₹{amount} received for booking {bookingNumber}." |
| `RENTAL_KYC_REQUIRED` | URGENT | Customer | Driver verification pending upload or correction | "Please submit your Driving License details to enable vehicle handover." |
| `RENTAL_BOOKING_CONFIRMED` | URGENT | Customer & Dispatch | Payment verified, reservation confirmed | "Your V MOTIV Self-Drive rental {bookingNumber} is confirmed!" |
| `RENTAL_BOOKING_CANCELLED` | HIGH | Customer & Hub Staff | Booking cancelled by customer or operator | "Booking {bookingNumber} cancelled. Approved refund of ₹{refund} queued." |
| `RENTAL_PICKUP_REMINDER` | NORMAL | Customer | 2 hours before scheduled pickup | "Your car is sanitized and ready at {hubName}. Bring your original DL." |
| `RENTAL_VEHICLE_RELEASED` | HIGH | Customer & Hub Mgr | Pickup handover completed and keys handed over | "Custody of {vehicle} handed over. Starting odometer: {km} km." |
| `RENTAL_TRIP_STARTED` | NORMAL | Customer | Self-drive trip is active | "Have a safe drive! 24/7 Roadside Assistance: 1800-866-848." |
| `RENTAL_EXTENSION_REQUESTED` | HIGH | Operations | Customer requests additional rental hours | "Customer requested {hours} hrs extension for booking {bookingNumber}." |
| `RENTAL_EXTENSION_APPROVED` | HIGH | Customer | Operations confirms trip extension | "Trip extension approved! New return scheduled for {endTime}." |
| `RENTAL_EXTENSION_DENIED` | HIGH | Customer | Subsequent conflict prevents extension | "Extension unavailable due to scheduled reservations. Please return as planned." |
| `RENTAL_RETURN_DUE` | HIGH | Customer | 1 hour before scheduled return | "Rental return due in 1 hour at {hubName}. Remember same-to-same fuel." |
| `RENTAL_RETURN_OVERDUE` | URGENT | Customer & Dispatch | Vehicle not returned within 30 mins grace | "Rental is overdue. Overtime charges apply. Contact hub if delayed." |
| `RENTAL_RETURN_RECEIVED` | HIGH | Customer & Finance | Return custody inspection completed | "Vehicle return inspected. Excess km: {km}. Settlement report generated." |
| `RENTAL_ADDITIONAL_CHARGES_PROPOSED` | HIGH | Customer | Excess km or fuel charges incurred | "Settlement charges of ₹{amount} applied against security deposit." |
| `RENTAL_DEPOSIT_REFUND_PROCESSING` | HIGH | Customer | Refund initiated to bank account | "Deposit refund of ₹{refund} is processing via banking channels." |
| `RENTAL_DEPOSIT_REFUND_VERIFIED` | HIGH | Customer | Finance verifies bank transfer reference | "Deposit refund of ₹{refund} verified (Ref: {bankRef})." |
| `RENTAL_INCIDENT_REPORTED` | URGENT | Operations & Safety | Customer reports breakdown or damage | "Emergency assistance requested for vehicle {registrationNumber}." |
