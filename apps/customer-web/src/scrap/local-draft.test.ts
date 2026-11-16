import { describe, expect, it } from 'vitest';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from './local-draft';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); }, clear: () => map.clear(), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
}
const brokenStorage = (): Storage => ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); }, clear() {}, key: () => null, length: 0 });

const draft = { vehicle: { make: 'Hyundai' }, answers: { overall_condition: 'FAIR' }, ownership: {}, pickupAddress: {} };

describe('local draft copy', () => {
  it('keeps a draft per person and per request', () => {
    const storage = memoryStorage();
    writeLocalDraft('u1', null, draft, storage);
    writeLocalDraft('u1', 'r1', { ...draft, vehicle: { make: 'Tata' } }, storage);
    expect(readLocalDraft('u1', null, storage)?.vehicle.make).toBe('Hyundai');
    expect(readLocalDraft('u1', 'r1', storage)?.vehicle.make).toBe('Tata');
    expect(readLocalDraft('u2', null, storage)).toBeNull(); // another person on the same browser sees nothing
  });

  it('clears one draft without touching others', () => {
    const storage = memoryStorage();
    writeLocalDraft('u1', null, draft, storage);
    writeLocalDraft('u1', 'r1', draft, storage);
    clearLocalDraft('u1', null, storage);
    expect(readLocalDraft('u1', null, storage)).toBeNull();
    expect(readLocalDraft('u1', 'r1', storage)).not.toBeNull();
  });

  it('ignores damaged entries and keeps only the four known parts', () => {
    const storage = memoryStorage();
    storage.setItem('vmotiv.scrap-draft.v1.u1.new', '{not json');
    expect(readLocalDraft('u1', null, storage)).toBeNull();
    storage.setItem('vmotiv.scrap-draft.v1.u1.new', JSON.stringify({ vehicle: 'oops', answers: [1], extra: { admin: true } }));
    expect(readLocalDraft('u1', null, storage)).toEqual({ vehicle: {}, answers: {}, ownership: {}, pickupAddress: {} });
  });

  it('never throws when storage is blocked or missing', () => {
    expect(() => writeLocalDraft('u1', null, draft, brokenStorage())).not.toThrow();
    expect(readLocalDraft('u1', null, brokenStorage())).toBeNull();
    expect(() => clearLocalDraft('u1', null, brokenStorage())).not.toThrow();
    expect(readLocalDraft('u1', null, null)).toBeNull();
  });
});
