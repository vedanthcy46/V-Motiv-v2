import { describe, expect, it } from 'vitest';
import { changedDomains, shouldAnnounce, OWN_WRITE_QUIET_MS } from './autoRefresh';

describe('change announcements', () => {
  it('reports only the domains whose token moved', () => {
    expect(changedDomains({ rentals: 'a', service: 'b' }, { rentals: 'a2', service: 'b' }, ['rentals', 'service'])).toEqual(['rentals']);
    expect(changedDomains({ rentals: 'a' }, { rentals: 'a' }, ['rentals'])).toEqual([]);
  });

  it('treats a domain with no earlier token as a baseline, not a change', () => {
    expect(changedDomains({}, { rentals: 'a' }, ['rentals'])).toEqual([]);
    expect(changedDomains({ rentals: 'a' }, {}, ['rentals'])).toEqual([]);
  });

  it('stays quiet right after the person\'s own save, and speaks up afterwards', () => {
    expect(shouldAnnounce({ now: 10_000, lastOwnWriteAt: 9_000 })).toBe(false);
    expect(shouldAnnounce({ now: 10_000, lastOwnWriteAt: 10_000 - OWN_WRITE_QUIET_MS })).toBe(true);
    expect(shouldAnnounce({ now: 10_000, lastOwnWriteAt: 0 })).toBe(true);
  });
});
