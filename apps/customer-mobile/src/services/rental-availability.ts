// Customer-facing wording for a vehicle's availability over the dates the customer picked.
// The server (services/api/src/rental-availability.ts) decides the state; this only explains it.

export type RentalAvailabilityState =
  | 'AVAILABLE'
  | 'ON_HOLD'
  | 'BOOKED'
  | 'IN_TRIP'
  | 'MAINTENANCE'
  | 'CLEANING'
  | 'UNAVAILABLE';

export interface RentalAvailability {
  state: RentalAvailabilityState;
  bookable: boolean;
  label: string;
  availableFrom: string | null;
  holdExpiresAt: string | null;
}

export type AvailabilityTone = 'ok' | 'warn' | 'danger' | 'muted';

const SHORT: Record<RentalAvailabilityState, string> = {
  AVAILABLE: 'Available',
  ON_HOLD: 'On hold',
  BOOKED: 'Booked',
  IN_TRIP: 'In trip',
  MAINTENANCE: 'Maintenance',
  CLEANING: 'Cleaning',
  UNAVAILABLE: 'Unavailable',
};

export function availabilityShortLabel(a?: RentalAvailability | null): string {
  return a ? SHORT[a.state] ?? 'Unavailable' : 'Available';
}

export function availabilityTone(a?: RentalAvailability | null): AvailabilityTone {
  if (!a || a.bookable) return 'ok';
  if (a.state === 'ON_HOLD') return 'warn';
  if (a.state === 'BOOKED' || a.state === 'IN_TRIP') return 'danger';
  return 'muted';
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One sentence telling the customer why they cannot book this car now and when to look again. */
export function availabilityDetail(a?: RentalAvailability | null): string {
  if (!a || a.bookable) return '';
  const from = a.availableFrom ? ` Free again from ${formatWhen(a.availableFrom)}.` : '';
  switch (a.state) {
    case 'ON_HOLD':
      return a.holdExpiresAt
        ? `Another customer is completing checkout for these dates. It may free up after ${formatWhen(a.holdExpiresAt)}.`
        : 'Another customer is completing checkout for these dates.';
    case 'BOOKED':
      return `Already booked during your dates.${from}`;
    case 'IN_TRIP':
      return `This car is out on a trip during your dates.${from}`;
    case 'MAINTENANCE':
      return `Under maintenance during your dates.${from}`;
    case 'CLEANING':
      return `Being prepared during your dates.${from}`;
    default:
      return 'Not available for your dates.';
  }
}
