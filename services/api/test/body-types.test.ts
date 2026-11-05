import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalogMasterData } from '../src/master-data-seed.js';
import { bodyTypeCatalog, bodyTypeFilterValues, inferBodyType, normalizeBodyType, resolveBodyType } from '../src/body-types.js';

describe('body types', () => {
  it('normalises spellings to the master-data code', () => {
    expect(normalizeBodyType('Hatchback')).toBe('HATCHBACK');
    expect(normalizeBodyType('hatch_back')).toBe('HATCHBACK');
    expect(normalizeBodyType('MPV')).toBe('MUV');
    expect(normalizeBodyType('Compact SUV')).toBe('SUV');
    expect(normalizeBodyType('spaceship')).toBeNull();
    expect(normalizeBodyType(undefined)).toBeNull();
  });

  it('derives the body type from make and model, ignoring case and punctuation', () => {
    expect(inferBodyType('Maruti Suzuki', 'Swift')).toBe('HATCHBACK');
    expect(inferBodyType('hyundai', 'GRAND I10 NIOS')).toBe('HATCHBACK');
    expect(inferBodyType('Hyundai', 'Creta')).toBe('SUV');
    expect(inferBodyType('Honda', 'City')).toBe('SEDAN');
    expect(inferBodyType('Toyota', 'Innova Crysta')).toBe('MUV');
    expect(inferBodyType('Mercedes Benz', 'GLA')).toBe('SUV');
    expect(inferBodyType('Mercedes-Benz', 'C-Class')).toBe('SEDAN');
    expect(inferBodyType('Ford', 'Mustang')).toBe('COUPE');
    expect(inferBodyType('Unknown', 'Thing')).toBeNull();
  });

  it('prefers what staff chose, then the catalogue', () => {
    expect(resolveBodyType({ bodyType: 'Sedan', make: 'Hyundai', model: 'Creta' })).toBe('SEDAN');
    expect(resolveBodyType({ bodyType: '', make: 'Hyundai', model: 'Creta' })).toBe('SUV');
    expect(resolveBodyType({ make: 'Nobody', model: 'Nothing' })).toBeNull();
  });

  it('lets a filter match both the code and the display name', () => {
    expect(bodyTypeFilterValues('hatchback')).toEqual(['HATCHBACK', 'Hatchback']);
    expect(bodyTypeFilterValues('MPV')).toContain('MUV');
    expect(bodyTypeFilterValues('weird')).toEqual(['weird']);
  });

  it('knows the body type of every model in the seeded catalogue', () => {
    const makes = new Map(catalogMasterData.filter(i => i.category === 'MAKE').map(i => [i.code, i.name]));
    const missing = catalogMasterData
      .filter(i => i.category === 'MODEL')
      .filter(i => !inferBodyType(makes.get(i.parentCode ?? '') ?? '', i.name))
      .map(i => `${i.parentCode} ${i.name}`);
    expect(missing).toEqual([]);
  });

  it('back-fills every catalogued model in the migration', () => {
    const sql = readFileSync(new URL('../prisma/migrations/20261105040000_vehicle_body_type_backfill/migration.sql', import.meta.url), 'utf8');
    const missing = bodyTypeCatalog().filter(r => !sql.includes(`('${r.make}', '${r.model.replace(/'/g, "''")}', '${r.bodyType}')`));
    expect(missing).toEqual([]);
  });
});
