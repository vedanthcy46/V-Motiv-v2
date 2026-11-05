import { describe, expect, it } from 'vitest';
import { buildMakeModelCatalog, isManualEntry, matchName, type MasterItem } from './vehicleCatalog';

const items: MasterItem[] = [
  { category: 'MAKE', code: 'HYUNDAI', name: 'Hyundai', parentCode: null },
  { category: 'MAKE', code: 'AUDI', name: 'Audi', parentCode: null },
  { category: 'MODEL', code: 'CRETA', name: 'Creta', parentCode: 'HYUNDAI' },
  { category: 'MODEL', code: 'AURA', name: 'Aura', parentCode: 'HYUNDAI' },
  { category: 'MODEL', code: 'ORPHAN', name: 'Orphan', parentCode: 'GONE' },
  { category: 'FUEL_TYPE', code: 'PETROL', name: 'Petrol', parentCode: null },
];

describe('vehicle catalogue for forms', () => {
  it('lists makes and their models alphabetically and ignores other categories and orphan models', () => {
    expect(buildMakeModelCatalog(items)).toEqual({ makes: ['Audi', 'Hyundai'], modelsByMake: { Hyundai: ['Aura', 'Creta'] } });
  });
  it('matches names ignoring case and spacing and returns the catalogue spelling', () => {
    expect(matchName(['Hyundai'], '  hyundai ')).toBe('Hyundai');
    expect(matchName(['Hyundai'], 'Honda')).toBeUndefined();
    expect(matchName(['Hyundai'], '')).toBeUndefined();
  });
  it('flags only filled-in names that are not in the list as manual entries', () => {
    expect(isManualEntry(['Hyundai'], 'Force Motors')).toBe(true);
    expect(isManualEntry(['Hyundai'], 'hyundai')).toBe(false);
    expect(isManualEntry(['Hyundai'], '')).toBe(false);
  });
});
