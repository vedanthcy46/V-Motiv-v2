// Single source of truth for "can this rental vehicle be booked for these dates, and if not, why".
// Used by customer search, vehicle details, hold creation and the operations fleet view so the
// mobile app, website and Operations portal can never disagree about availability.

export type RentalAvailabilityState =
  | 'AVAILABLE'
  | 'ON_HOLD' // another customer is checking out / has an unpaid booking inside its payment window
  | 'BOOKED' // a confirmed future booking overlaps the requested dates
  | 'IN_TRIP' // the car is out with a customer during the requested dates
  | 'MAINTENANCE'
  | 'CLEANING'
  | 'UNAVAILABLE';

export interface RentalAvailability {
  state: RentalAvailabilityState;
  bookable: boolean;
  label: string;
  /** Earliest time the car is free again (conflict end + turnaround buffer), when known. */
  availableFrom: Date | null;
  /** When a temporary hold lapses and the car may free up sooner. */
  holdExpiresAt: Date | null;
}

export interface AvailabilityInput {
  start: Date;
  end: Date;
  now: Date;
  bufferMinutes: number;
  /** Dispatch status of the vehicle record (AVAILABLE, ON_TRIP, MAINTENANCE, ...). */
  vehicleStatus: string;
  blocks: Array<{ startTime: Date; endTime: Date; reason: string }>;
  holds: Array<{ startTime: Date; endTime: Date; expiresAt: Date; status: string }>;
  bookings: Array<{
    startTime: Date;
    endTime: Date;
    status: string;
    /** Expiry of the checkout hold that reserved this booking (used for PENDING_PAYMENT). */
    holdExpiresAt?: Date | null;
  }>;
}

const ACTIVE_BOOKING = ['CONFIRMED', 'VEHICLE_COLLECTED', 'TRIP_ACTIVE'];
const OUT_ON_TRIP = ['VEHICLE_COLLECTED', 'TRIP_ACTIVE'];

const AVAILABLE_RESULT: RentalAvailability = {
  state: 'AVAILABLE',
  bookable: true,
  label: 'Available for your dates',
  availableFrom: null,
  holdExpiresAt: null,
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/**
 * A booking that still reserves the car: confirmed/active trips, or an unpaid checkout whose
 * payment window (the original hold) has not lapsed yet.
 */
export function bookingBlocksVehicle(
  booking: { status: string; holdExpiresAt?: Date | null },
  now: Date,
): boolean {
  if (ACTIVE_BOOKING.includes(booking.status)) return true;
  if (booking.status === 'PENDING_PAYMENT') {
    return Boolean(booking.holdExpiresAt && booking.holdExpiresAt.getTime() > now.getTime());
  }
  return false;
}

/** An overdue trip has not come back yet: assume it returns no earlier than now plus a turnaround. */
function effectiveTripEnd(endTime: Date, now: Date, bufferMs: number): Date {
  return endTime.getTime() < now.getTime() ? new Date(now.getTime() + bufferMs) : endTime;
}

export function computeAvailability(input: AvailabilityInput): RentalAvailability {
  const { start, end, now } = input;
  const bufferMs = Math.max(0, input.bufferMinutes) * 60 * 1000;
  const windowStart = new Date(start.getTime() - bufferMs);
  const windowEnd = new Date(end.getTime() + bufferMs);

  // 1. Out on a trip during the requested dates (an overdue trip occupies the car until it returns).
  const tripConflicts = input.bookings.filter((b) => {
    if (!OUT_ON_TRIP.includes(b.status)) return false;
    return overlaps(windowStart, windowEnd, b.startTime, effectiveTripEnd(b.endTime, now, bufferMs));
  });
  if (tripConflicts.length > 0) {
    const freeAt = Math.max(...tripConflicts.map((b) => effectiveTripEnd(b.endTime, now, bufferMs).getTime())) + bufferMs;
    return { state: 'IN_TRIP', bookable: false, label: 'In trip during your dates', availableFrom: new Date(freeAt), holdExpiresAt: null };
  }

  // 2. Confirmed future booking.
  const booked = input.bookings.filter(
    (b) => b.status === 'CONFIRMED' && overlaps(windowStart, windowEnd, b.startTime, b.endTime),
  );
  if (booked.length > 0) {
    const freeAt = Math.max(...booked.map((b) => b.endTime.getTime())) + bufferMs;
    return { state: 'BOOKED', bookable: false, label: 'Booked for your dates', availableFrom: new Date(freeAt), holdExpiresAt: null };
  }

  // 3. Temporary holds: an active checkout hold, or an unpaid booking still inside its payment window.
  const holdWindows: Array<{ end: Date; expiresAt: Date }> = [];
  for (const h of input.holds) {
    if (h.status === 'ACTIVE' && h.expiresAt.getTime() > now.getTime() && overlaps(windowStart, windowEnd, h.startTime, h.endTime)) {
      holdWindows.push({ end: h.endTime, expiresAt: h.expiresAt });
    }
  }
  for (const b of input.bookings) {
    if (b.status === 'PENDING_PAYMENT' && bookingBlocksVehicle(b, now) && overlaps(windowStart, windowEnd, b.startTime, b.endTime)) {
      holdWindows.push({ end: b.endTime, expiresAt: b.holdExpiresAt as Date });
    }
  }
  if (holdWindows.length > 0) {
    const holdExpiresAt = new Date(Math.max(...holdWindows.map((h) => h.expiresAt.getTime())));
    const freeAt = Math.max(...holdWindows.map((h) => h.end.getTime())) + bufferMs;
    return { state: 'ON_HOLD', bookable: false, label: 'On hold for your dates', availableFrom: new Date(freeAt), holdExpiresAt };
  }

  // 4. Maintenance / cleaning blocks overlapping the window.
  const block = input.blocks.find((b) => overlaps(windowStart, windowEnd, b.startTime, b.endTime));
  if (block) {
    const freeAt = Math.max(...input.blocks.filter((b) => overlaps(windowStart, windowEnd, b.startTime, b.endTime)).map((b) => b.endTime.getTime()));
    const cleaning = block.reason === 'CLEANING';
    return {
      state: cleaning ? 'CLEANING' : 'MAINTENANCE',
      bookable: false,
      label: cleaning ? 'Being cleaned during your dates' : 'In maintenance during your dates',
      availableFrom: new Date(freeAt),
      holdExpiresAt: null,
    };
  }

  // 5. Dispatch status with no end date we can reason about.
  if (input.vehicleStatus === 'MAINTENANCE' || input.vehicleStatus === 'CLEANING' || input.vehicleStatus === 'RETIRED') {
    return {
      state: input.vehicleStatus === 'CLEANING' ? 'CLEANING' : input.vehicleStatus === 'RETIRED' ? 'UNAVAILABLE' : 'MAINTENANCE',
      bookable: false,
      label: input.vehicleStatus === 'RETIRED' ? 'Not available' : 'Temporarily unavailable',
      availableFrom: null,
      holdExpiresAt: null,
    };
  }

  return AVAILABLE_RESULT;
}
