import { describe, expect, it } from 'vitest';
import { nextOriginalPrice, priceDrop } from '../src/price-drop.js';

const lakh = (n: number) => BigInt(Math.round(n * 100_000)) * 100n;

describe('price drop', () => {
  it('keeps the original price when the price falls, and shows the percentage', () => {
    const original = nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: lakh(5.5) }, lakh(5.4));
    expect(original).toBe(lakh(5.5));
    expect(priceDrop(lakh(5.4), original)).toMatchObject({ discountPercent: 1.8, savingsPaise: (lakh(0.1)).toString() });
  });

  it('starts a new original when the price goes up, so a rise then a cut is not shown as a discount', () => {
    const raised = nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: lakh(5.5) }, lakh(6));
    expect(raised).toBe(lakh(6));
    expect(priceDrop(lakh(6), raised)).toBeNull();
  });

  it('shows nothing for unchanged prices, a missing original or a drop under 0.1%', () => {
    expect(priceDrop(lakh(5), lakh(5))).toBeNull();
    expect(priceDrop(lakh(5), null)).toBeNull();
    expect(priceDrop(lakh(5), lakh(5.0004))).toBeNull(); // under 0.1%
    expect(priceDrop(55_500_000n, 56_000_000n)).toMatchObject({ discountPercent: 0.8 }); // a small cut still shows, with a decimal
  });

  it('falls back to the current price for listings created before the original was stored', () => {
    expect(nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: null }, lakh(5.2))).toBe(lakh(5.5));
    expect(nextOriginalPrice(null, lakh(5))).toBe(lakh(5));
  });
});

import { originalPriceAfterChange } from '../src/price-drop.js';
describe('original price follows the listing lifecycle', () => {
  it('a draft or a first publish just starts at the price set - edits before going live are not drops', () => {
    expect(originalPriceAfterChange({ status: 'DRAFT', pricePaise: 55_000_000n, originalPricePaise: 55_000_000n }, 54_000_000n)).toBe(54_000_000n);
    expect(originalPriceAfterChange(null, 54_000_000n)).toBe(54_000_000n);
  });
  it('a live listing keeps its original when the price is cut, including when it is re-published', () => {
    const live = { status: 'PUBLISHED', pricePaise: 55_000_000n, originalPricePaise: 55_000_000n };
    expect(originalPriceAfterChange(live, 54_000_000n)).toBe(55_000_000n);
    expect(originalPriceAfterChange({ ...live, pricePaise: 54_000_000n }, 54_000_000n)).toBe(55_000_000n);
    expect(originalPriceAfterChange({ ...live, status: 'RESERVED' }, 53_000_000n)).toBe(55_000_000n);
  });
  it('a live price rise starts a new original', () => {
    expect(originalPriceAfterChange({ status: 'PUBLISHED', pricePaise: 55_000_000n, originalPricePaise: 55_000_000n }, 56_000_000n)).toBe(56_000_000n);
  });
});
