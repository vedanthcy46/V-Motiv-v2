import { describe, expect, it } from 'vitest';
import { dropOrphanedChildren, normalizeMasterDataCategory, validateMasterDataShape } from '../src/master-data-rules.js';
import { canonicalMasterData } from '../src/admin-catalog.js';

describe('master data categories', () => {
  it('maps the names an older Admin portal wrote onto the categories the apps read', () => {
    expect(normalizeMasterDataCategory('CAR_MAKE')).toBe('MAKE');
    expect(normalizeMasterDataCategory('car-body-type')).toBe('BODY_TYPE');
    expect(normalizeMasterDataCategory('TRANSMISSION_TYPE')).toBe('TRANSMISSION');
    expect(normalizeMasterDataCategory('FUEL_TYPE')).toBe('FUEL_TYPE');
    expect(normalizeMasterDataCategory('SOMETHING_ELSE')).toBeNull();
  });

  it('requires a parent for models and variants, and forbids one elsewhere', () => {
    expect(validateMasterDataShape({ category: 'MODEL', code: 'CRETA' })).toEqual({ ok: false, error: 'PARENT_REQUIRED' });
    expect(validateMasterDataShape({ category: 'MAKE', code: 'KIA', parentCode: 'X' })).toEqual({ ok: false, error: 'PARENT_NOT_ALLOWED' });
    expect(validateMasterDataShape({ category: 'MODEL', code: 'creta', parentCode: 'HYUNDAI' })).toMatchObject({ ok: true, category: 'MODEL', code: 'CRETA', parentCategory: 'MAKE' });
    expect(validateMasterDataShape({ category: 'nope', code: 'ABC' })).toEqual({ ok: false, error: 'UNKNOWN_MASTER_DATA_CATEGORY' });
    expect(validateMasterDataShape({ category: 'MAKE', code: ' ' })).toEqual({ ok: false, error: 'INVALID_MASTER_DATA_CODE' });
  });
});

describe('deactivating a parent hides its children', () => {
  const rows = [
    { category: 'MAKE', code: 'HYUNDAI', parentCode: null, active: true },
    { category: 'MAKE', code: 'FORD', parentCode: null, active: false },
    { category: 'MODEL', code: 'HYUNDAI__CRETA', parentCode: 'HYUNDAI', active: true },
    { category: 'MODEL', code: 'FORD__FIGO', parentCode: 'FORD', active: true },
    { category: 'MODEL', code: 'HYUNDAI__I10', parentCode: 'HYUNDAI', active: false },
    { category: 'VARIANT', code: 'FIGO_TITANIUM', parentCode: 'FORD__FIGO', active: true },
    { category: 'FUEL_TYPE', code: 'PETROL', parentCode: null, active: true },
  ];
  it('keeps only active items whose whole parent chain is active', () => {
    expect(dropOrphanedChildren(rows).map(r => r.code)).toEqual(['HYUNDAI', 'HYUNDAI__CRETA', 'PETROL']);
  });
});

describe('standard catalogue seed', () => {
  it('has unique (category, code) keys and every model points at a seeded make', () => {
    const keys = canonicalMasterData.map(i => `${i.category}:${i.code}`);
    expect(new Set(keys).size).toBe(keys.length);
    const makes = new Set(canonicalMasterData.filter(i => i.category === 'MAKE').map(i => i.code));
    const models = canonicalMasterData.filter(i => i.category === 'MODEL');
    expect(models.length).toBeGreaterThan(100);
    expect(models.every(m => m.parentCode && makes.has(m.parentCode))).toBe(true);
    expect(makes.has('MARUTI_SUZUKI')).toBe(true);
  });
});
