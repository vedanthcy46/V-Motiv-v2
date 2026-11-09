import { describe, expect, it } from 'vitest';
import { addYears, formatDisplay, isAllowed, monthGrid, parseIso, shiftMonth, todayIso, toIso } from './date-field';

describe('date field helpers', () => {
  it('parses only real calendar dates', () => {
    expect(parseIso('1998-05-15')).toEqual({ year: 1998, month: 5, day: 15 });
    expect(parseIso('2028-02-29')).not.toBeNull(); // leap year
    expect(parseIso('2027-02-29')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('15/05/1998')).toBeNull();
    expect(parseIso('')).toBeNull();
    expect(parseIso(undefined)).toBeNull();
  });

  it('formats for display and builds iso text', () => {
    expect(formatDisplay('1998-05-05')).toBe('5 May 1998');
    expect(formatDisplay('nope')).toBe('');
    expect(toIso(2026, 3, 9)).toBe('2026-03-09');
    expect(todayIso(new Date(2026, 10, 7))).toBe('2026-11-07');
  });

  it('lays out a Monday-first month grid', () => {
    const nov2026 = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
    expect(nov2026[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(nov2026.flat().filter(Boolean)).toHaveLength(30);
    expect(nov2026.every(row => row.length === 7)).toBe(true);
    expect(monthGrid(2026, 6)[0]![0]).toBe(1); // 1 Jun 2026 is a Monday
  });

  it('respects earliest and latest allowed dates', () => {
    expect(isAllowed('2026-11-07', '2026-11-08')).toBe(false);
    expect(isAllowed('2026-11-08', '2026-11-08', '2026-11-08')).toBe(true);
    expect(isAllowed('2026-11-09', undefined, '2026-11-08')).toBe(false);
    expect(isAllowed('2026-11-09')).toBe(true);
  });

  it('moves between months and years', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
  });
});
