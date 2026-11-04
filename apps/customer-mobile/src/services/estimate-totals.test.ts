import { describe, expect, it } from 'vitest';
import { previewApprovedTotals } from './estimate-totals';

const items = [
  { id: 'req', quantity: 1, unitPricePaise: '400000', isMandatory: true },
  { id: 'opt1', quantity: 2, unitPricePaise: '50000', isMandatory: false },
  { id: 'opt2', quantity: 1, unitPricePaise: 100000, isMandatory: false },
];

describe('previewApprovedTotals', () => {
  it('matches the server when nothing is deferred', () => {
    expect(previewApprovedTotals(items, new Set()).totalPaise).toBe(708000n);
  });
  it('drops deferred optional items and recomputes GST', () => {
    const p = previewApprovedTotals(items, new Set(['opt1']));
    expect(p.subtotalPaise).toBe(500000n);
    expect(p.totalPaise).toBe(590000n);
  });
  it('can never defer a required item', () => {
    expect(previewApprovedTotals(items, new Set(['req'])).subtotalPaise).toBe(600000n);
  });
});
