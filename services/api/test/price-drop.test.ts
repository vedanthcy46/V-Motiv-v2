import { describe, expect, it } from 'vitest';
import { nextOriginalPrice, priceDrop } from '../src/price-drop.js';

const lakh = (n: number) => BigInt(Math.round(n * 100_000)) * 100n;

describe('price drop', () => {
  it('keeps the original price when the price falls, and shows the percentage', () => {
    const original = nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: lakh(5.5) }, lakh(5.4));
    expect(original).toBe(lakh(5.5));
    expect(priceDrop(lakh(5.4), original)).toMatchObject({ discountPercent: 1, savingsPaise: (lakh(0.1)).toString() });
  });

  it('starts a new original when the price goes up, so a rise then a cut is not shown as a discount', () => {
    const raised = nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: lakh(5.5) }, lakh(6));
    expect(raised).toBe(lakh(6));
    expect(priceDrop(lakh(6), raised)).toBeNull();
  });

  it('shows nothing for unchanged prices, a missing original or a drop under 1%', () => {
    expect(priceDrop(lakh(5), lakh(5))).toBeNull();
    expect(priceDrop(lakh(5), null)).toBeNull();
    expect(priceDrop(lakh(5), lakh(5.04))).toBeNull();
  });

  it('falls back to the current price for listings created before the original was stored', () => {
    expect(nextOriginalPrice({ pricePaise: lakh(5.5), originalPricePaise: null }, lakh(5.2))).toBe(lakh(5.5));
    expect(nextOriginalPrice(null, lakh(5))).toBe(lakh(5));
  });
});
