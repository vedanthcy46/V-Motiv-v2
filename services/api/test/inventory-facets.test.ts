import { describe, expect, it } from 'vitest';
import { computeInventoryFacets, makeMatchSet, type FacetRow } from '../src/inventory-facets.js';

const row = (over: Partial<FacetRow>): FacetRow => ({
  title: '2021 Car', pricePaise: 50_000_000, make: 'Hyundai', model: 'Creta', fuelType: 'Petrol', transmission: 'Manual',
  bodyType: 'SUV', color: 'White', city: 'Bengaluru', year: 2021, odometerKm: 30_000, features: ['Sunroof'], ...over,
});
const stock: FacetRow[] = [
  row({}),
  row({ model: 'Venue', pricePaise: 80_000_000, year: 2022, odometerKm: 12_000, features: ['Sunroof', 'Cruise Control'] }),
  row({ make: 'Maruti Suzuki', model: 'Swift', fuelType: 'Petrol', bodyType: 'Hatchback', pricePaise: 45_000_000, year: 2019, odometerKm: 60_000, color: 'Red', features: [] }),
  row({ make: 'Maruti', model: 'Baleno', fuelType: 'Diesel', bodyType: 'Hatchback', pricePaise: 55_000_000, year: 2020, odometerKm: 40_000, city: 'Mysuru', features: ['Sunroof'] }),
  row({ make: 'Suzuki', model: 'Ertiga', fuelType: 'CNG', bodyType: 'MUV', pricePaise: 90_000_000, year: 2018, odometerKm: 90_000, features: ['Cruise Control'] }),
];

describe('computeInventoryFacets', () => {
  it('counts every make over the whole stock and folds alias spellings into one make', () => {
    const f = computeInventoryFacets(stock, {});
    expect(f.total).toBe(5);
    expect(f.makes).toEqual([{ value: 'Maruti Suzuki', count: 3 }, { value: 'Hyundai', count: 2 }]);
  });

  it('a make filter matches its aliases', () => {
    expect(makeMatchSet(['Maruti Suzuki'])).toEqual(new Set(['maruti suzuki', 'maruti', 'suzuki']));
    expect(computeInventoryFacets(stock, { makes: ['Maruti Suzuki'] }).total).toBe(3);
  });

  it('picking a brand keeps the other brands in the brand list (counts exclude the filter\'s own dimension)', () => {
    const f = computeInventoryFacets(stock, { makes: ['Hyundai'] });
    expect(f.total).toBe(2);
    expect(f.makes.map(m => m.value).sort()).toEqual(['Hyundai', 'Maruti Suzuki']);
    // but other dimensions respect the brand
    expect(f.fuelTypes).toEqual([{ value: 'Petrol', count: 2 }]);
    expect(f.models.map(m => m.value).sort()).toEqual(['Creta', 'Venue']);
  });

  it('returns real ranges for price, year and odometer, and narrows them with other filters', () => {
    const all = computeInventoryFacets(stock, {});
    expect(all.ranges.price).toEqual({ min: 45_000_000, max: 90_000_000 });
    expect(all.ranges.year).toEqual({ min: 2018, max: 2022 });
    expect(all.ranges.odometerKm).toEqual({ min: 12_000, max: 90_000 });
    const hatch = computeInventoryFacets(stock, { bodyType: 'Hatchback' });
    expect(hatch.ranges.price).toEqual({ min: 45_000_000, max: 55_000_000 });
    // the price range ignores the price filter itself, so the slider keeps its full extent
    expect(computeInventoryFacets(stock, { maxPricePaise: 50_000_000 }).ranges.price).toEqual({ min: 45_000_000, max: 90_000_000 });
  });

  it('feature options come from real stock and filtering needs every selected feature', () => {
    const f = computeInventoryFacets(stock, {});
    expect(f.features).toEqual([{ value: 'Sunroof', count: 3 }, { value: 'Cruise Control', count: 2 }]);
    expect(computeInventoryFacets(stock, { features: ['Sunroof', 'Cruise Control'] }).total).toBe(1);
  });

  it('the matching count equals what the search would return (price, year, km, city)', () => {
    const f = computeInventoryFacets(stock, { city: 'Bengaluru', minYear: 2020, maxOdometerKm: 35_000, maxPricePaise: 60_000_000 });
    expect(f.total).toBe(1);
  });

  it('is empty-safe', () => {
    const f = computeInventoryFacets([], {});
    expect(f.total).toBe(0);
    expect(f.ranges.price).toBeNull();
  });
});
