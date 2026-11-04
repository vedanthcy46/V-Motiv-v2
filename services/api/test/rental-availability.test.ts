import { describe, expect, it } from 'vitest';
import { bookingBlocksVehicle, computeAvailability, type AvailabilityInput } from '../src/rental-availability.js';

const d = (s: string) => new Date(s);
const base = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  start: d('2026-11-06T09:00:00Z'),
  end: d('2026-11-08T09:00:00Z'),
  now: d('2026-11-04T09:00:00Z'),
  bufferMinutes: 120,
  vehicleStatus: 'AVAILABLE',
  blocks: [],
  holds: [],
  bookings: [],
  ...over,
});

describe('computeAvailability', () => {
  it('is available when nothing overlaps', () => {
    expect(computeAvailability(base())).toMatchObject({ state: 'AVAILABLE', bookable: true });
  });

  it('Person A books Nov 6-9; Person B asking Nov 6-8 sees the car as booked, free after A returns + buffer', () => {
    const r = computeAvailability(
      base({ bookings: [{ startTime: d('2026-11-06T09:00:00Z'), endTime: d('2026-11-09T09:00:00Z'), status: 'CONFIRMED' }] }),
    );
    expect(r.state).toBe('BOOKED');
    expect(r.bookable).toBe(false);
    expect(r.availableFrom?.toISOString()).toBe('2026-11-09T11:00:00.000Z');
  });

  it('treats a booking that only touches the window through the turnaround buffer as a conflict', () => {
    const r = computeAvailability(
      base({ bookings: [{ startTime: d('2026-11-04T09:00:00Z'), endTime: d('2026-11-06T08:00:00Z'), status: 'CONFIRMED' }] }),
    );
    expect(r.state).toBe('BOOKED');
  });

  it('does not conflict once the buffer has passed', () => {
    const r = computeAvailability(
      base({ bookings: [{ startTime: d('2026-11-03T09:00:00Z'), endTime: d('2026-11-06T06:00:00Z'), status: 'CONFIRMED' }] }),
    );
    expect(r.state).toBe('AVAILABLE');
  });

  it('reports IN_TRIP for a collected/active trip, and an overdue trip still occupies the car', () => {
    const active = computeAvailability(
      base({ bookings: [{ startTime: d('2026-11-05T09:00:00Z'), endTime: d('2026-11-07T09:00:00Z'), status: 'TRIP_ACTIVE' }] }),
    );
    expect(active.state).toBe('IN_TRIP');
    const overdue = computeAvailability(
      base({
        now: d('2026-11-06T10:00:00Z'),
        start: d('2026-11-06T12:00:00Z'),
        bookings: [{ startTime: d('2026-11-03T09:00:00Z'), endTime: d('2026-11-05T09:00:00Z'), status: 'TRIP_ACTIVE' }],
      }),
    );
    expect(overdue.state).toBe('IN_TRIP');
  });

  it('an unpaid booking inside its payment window puts the car ON_HOLD; after the window it frees up', () => {
    const pending = { startTime: d('2026-11-06T09:00:00Z'), endTime: d('2026-11-09T09:00:00Z'), status: 'PENDING_PAYMENT' };
    const live = computeAvailability(base({ bookings: [{ ...pending, holdExpiresAt: d('2026-11-04T09:10:00Z') }] }));
    expect(live.state).toBe('ON_HOLD');
    expect(live.holdExpiresAt?.toISOString()).toBe('2026-11-04T09:10:00.000Z');
    const lapsed = computeAvailability(base({ bookings: [{ ...pending, holdExpiresAt: d('2026-11-04T08:50:00Z') }] }));
    expect(lapsed.state).toBe('AVAILABLE');
    expect(bookingBlocksVehicle({ status: 'PENDING_PAYMENT', holdExpiresAt: null }, d('2026-11-04T09:00:00Z'))).toBe(false);
  });

  it('active checkout holds block only while unexpired', () => {
    const hold = { startTime: d('2026-11-07T09:00:00Z'), endTime: d('2026-11-08T21:00:00Z'), status: 'ACTIVE' };
    expect(computeAvailability(base({ holds: [{ ...hold, expiresAt: d('2026-11-04T09:10:00Z') }] })).state).toBe('ON_HOLD');
    expect(computeAvailability(base({ holds: [{ ...hold, expiresAt: d('2026-11-04T08:00:00Z') }] })).state).toBe('AVAILABLE');
  });

  it('ignores cancelled and settled bookings', () => {
    const r = computeAvailability(
      base({
        bookings: [
          { startTime: d('2026-11-06T09:00:00Z'), endTime: d('2026-11-09T09:00:00Z'), status: 'CANCELLED' },
          { startTime: d('2026-11-06T09:00:00Z'), endTime: d('2026-11-09T09:00:00Z'), status: 'SETTLED' },
        ],
      }),
    );
    expect(r.state).toBe('AVAILABLE');
  });

  it('maps maintenance and cleaning blocks, and unknown-length maintenance status', () => {
    const block = (reason: string) => ({ startTime: d('2026-11-07T00:00:00Z'), endTime: d('2026-11-07T12:00:00Z'), reason });
    expect(computeAvailability(base({ blocks: [block('MAINTENANCE')] })).state).toBe('MAINTENANCE');
    expect(computeAvailability(base({ blocks: [block('CLEANING')] })).state).toBe('CLEANING');
    expect(computeAvailability(base({ vehicleStatus: 'MAINTENANCE' })).bookable).toBe(false);
    expect(computeAvailability(base({ vehicleStatus: 'ON_TRIP' })).bookable).toBe(true);
  });
});
