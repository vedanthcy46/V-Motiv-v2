import { describe, expect, it } from 'vitest';
import { resolveAppLink } from './app-links';

describe('app links', () => {
  it('opens the known destinations', () => {
    expect(resolveAppLink('vmotiv://app/buy')).toEqual({ kind: 'tab', tab: 'Explore' });
    expect(resolveAppLink('vmotiv://app/home')).toEqual({ kind: 'tab', tab: 'Home' });
    expect(resolveAppLink('vmotiv://app/sell')).toEqual({ kind: 'screen', name: 'Sell' });
    expect(resolveAppLink('vmotiv://app/rentals')).toEqual({ kind: 'screen', name: 'RentalHome' });
    expect(resolveAppLink('vmotiv://app/service')).toEqual({ kind: 'screen', name: 'ServiceHome' });
    expect(resolveAppLink('vmotiv://vehicles/6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11')).toEqual({ kind: 'vehicle', listingId: '6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11' });
  });
  it('ignores anything else', () => {
    for (const bad of [null, undefined, '', 'https://evil.example', 'vmotiv://app/admin', 'vmotiv://app/buy/extra', 'vmotiv://vehicles/not-an-id', 'javascript:alert(1)']) expect(resolveAppLink(bad as string)).toBeNull();
  });
});
