import { describe, expect, it } from 'vitest';
import { buildCatalog, canonicalMakeName, modelsForMake, type CatalogFallback, type MasterItem } from './master-data-model';

const fallback: CatalogFallback = {
  makes: [{ name: 'Fallback Make' }],
  modelsByMake: { 'Fallback Make': ['Fallback Model'] },
  fuelTypes: [{ value: 'PETROL', label: 'Petrol' }],
  transmissions: [{ value: 'MANUAL', label: 'Manual' }],
  ownershipTypes: [{ value: 'OWNER', label: 'Primary Owner' }],
  colours: [{ name: 'White', hex: '#FFFFFF', borderOnly: true }],
};
const item = (category: string, code: string, name: string, parentCode: string | null = null, metadata: Record<string, unknown> = {}): MasterItem => ({ category, code, name, parentCode, metadata });

describe('buildCatalog', () => {
  it('uses the bundled fallback when the server has nothing yet (first run / offline)', () => {
    const c = buildCatalog([], fallback);
    expect(c.fromServer).toBe(false);
    expect(c.makes).toEqual(fallback.makes);
    expect(c.fuelTypes).toEqual(fallback.fuelTypes);
  });

  it('server data replaces the fallback entirely, so admin changes are authoritative', () => {
    const c = buildCatalog(
      [
        item('MAKE', 'HYUNDAI', 'Hyundai', null, { segment: 'high_volume' }),
        item('MODEL', 'HYUNDAI__CRETA', 'Creta', 'HYUNDAI'),
        item('MODEL', 'ORPHAN__X', 'Orphan', 'GONE'),
        item('FUEL_TYPE', 'EV', 'Electric'),
        item('COLOR', 'RED', 'Red', null, { hex: '#CC2200' }),
      ],
      fallback,
    );
    expect(c.fromServer).toBe(true);
    expect(c.makes).toEqual([{ name: 'Hyundai', category: 'high_volume' }]);
    expect(c.modelsByMake).toEqual({ Hyundai: ['Creta'] });
    expect(c.fuelTypes).toEqual([{ value: 'EV', label: 'Electric' }]);
    expect(c.colours[0]).toMatchObject({ name: 'Red', hex: '#CC2200' });
    // a category the server has no rows for still falls back
    expect(c.transmissions).toEqual(fallback.transmissions);
  });
});

describe('make aliases', () => {
  const makes = ['Maruti Suzuki', 'Mercedes-Benz', 'Hyundai'];
  it('maps inventory spellings onto the managed make names', () => {
    expect(canonicalMakeName('maruti', makes)).toBe('Maruti Suzuki');
    expect(canonicalMakeName('HYUNDAI', makes)).toBe('Hyundai');
    expect(canonicalMakeName('Unknown', makes)).toBe('Unknown');
    expect(modelsForMake({ 'Maruti Suzuki': ['Swift'] }, 'Maruti')).toEqual(['Swift']);
    expect(modelsForMake({}, '')).toEqual([]);
  });
});
