import { describe, expect, it } from 'vitest';
import { availabilityDetail, availabilityShortLabel, availabilityTone, type RentalAvailability } from './rental-availability';

const make = (over: Partial<RentalAvailability>): RentalAvailability => ({
  state: 'BOOKED',
  bookable: false,
  label: 'Booked for your dates',
  availableFrom: '2026-11-09T11:00:00.000Z',
  holdExpiresAt: null,
  ...over,
});

describe('rental availability wording', () => {
  it('treats missing availability (older API) as available', () => {
    expect(availabilityShortLabel(undefined)).toBe('Available');
    expect(availabilityTone(undefined)).toBe('ok');
    expect(availabilityDetail(undefined)).toBe('');
  });

  it('maps each blocking state to a short label, tone and explanation', () => {
    expect(availabilityShortLabel(make({ state: 'ON_HOLD' }))).toBe('On hold');
    expect(availabilityTone(make({ state: 'ON_HOLD' }))).toBe('warn');
    expect(availabilityShortLabel(make({ state: 'IN_TRIP' }))).toBe('In trip');
    expect(availabilityTone(make({ state: 'BOOKED' }))).toBe('danger');
    expect(availabilityTone(make({ state: 'MAINTENANCE' }))).toBe('muted');
    expect(availabilityDetail(make({}))).toMatch(/Already booked during your dates\. Free again from 9 Nov/);
    expect(availabilityDetail(make({ state: 'ON_HOLD', holdExpiresAt: '2026-11-04T09:10:00.000Z' }))).toMatch(/completing checkout/);
  });
});
