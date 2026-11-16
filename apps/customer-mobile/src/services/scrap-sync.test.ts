import { describe, expect, it } from 'vitest';
import { DraftSync, type SaveState } from './scrap-sync';
import { applyDraftPatch, draftFromServer, emptyDraft, type DraftPatch, type DraftState } from './scrap-form';

type Any = any;

/** A stand-in server: it holds the draft, applies patches like the real one, and refuses chosen values with the real error shape. */
function fakeServer(options: { refuse?: Record<string, (value: unknown) => string | null> } = {}) {
  const server = { version: 1, draft: emptyDraft() as DraftState, calls: [] as DraftPatch[], failNext: null as null | Error, conflictNext: false, otherDevice: null as null | DraftPatch };
  const api = {
    async saveDraft(_id: string, expectedVersion: number, patch: DraftPatch) {
      server.calls.push(structuredClone(patch));
      if (server.failNext) { const error = server.failNext; server.failNext = null; throw error; }
      if (server.conflictNext || expectedVersion !== server.version) {
        server.conflictNext = false;
        if (server.otherDevice) { server.draft = applyDraftPatch(server.draft, server.otherDevice); server.version += 1; server.otherDevice = null; }
        throw Object.assign(new Error('conflict'), { status: 409, code: 'SCRAP_VERSION_CONFLICT' });
      }
      const fields: Array<{ field: string; message: string }> = [];
      for (const part of ['vehicle', 'answers', 'ownership', 'pickupAddress'] as const) {
        for (const [key, value] of Object.entries((patch[part] ?? {}) as Record<string, unknown>)) {
          const message = value === null ? null : options.refuse?.[`${part}.${key}`]?.(value) ?? null;
          if (message) fields.push({ field: `${part}.${key}`, message });
        }
      }
      if (fields.length) throw Object.assign(new Error('invalid'), { status: 400, code: 'INVALID_INPUT', details: { code: 'INVALID_INPUT', fields } });
      server.draft = applyDraftPatch(server.draft, patch);
      server.version += 1;
      return { version: server.version };
    },
    async loadDraft() { return { version: server.version, draft: draftFromServer(server.draft) }; },
  };
  return { server, api };
}

/** A clock the test controls, so debouncing is tested without waiting. */
function manualClock() {
  const pending: Array<{ id: number; run: () => void }> = [];
  let next = 1;
  return {
    schedule: (run: () => void) => { const id = next++; pending.push({ id, run }); return id; },
    cancel: (handle: unknown) => { const index = pending.findIndex(item => item.id === handle); if (index >= 0) pending.splice(index, 1); },
    get waiting() { return pending.length; },
    tick: () => { const items = pending.splice(0); items.forEach(item => item.run()); },
  };
}

function setup(options: Parameters<typeof fakeServer>[0] = {}) {
  const { server, api } = fakeServer(options);
  const clock = manualClock();
  const states: SaveState[] = [];
  const errors: Array<Record<string, string>> = [];
  const conflicts: DraftState[] = [];
  const sync = new DraftSync({ ...api, schedule: clock.schedule, cancel: clock.cancel }, { state: state => states.push(state), fieldErrors: e => errors.push(e), conflict: d => conflicts.push(d) });
  sync.attach('draft-1', server.version, server.draft);
  const edit = (change: (draft: DraftState) => void) => { const next = structuredClone(sync.draft); change(next); sync.update(next); };
  return { server, sync, clock, states, errors, conflicts, edit };
}

describe('autosave', () => {
  it('waits for typing to pause, then sends only what changed', async () => {
    const { sync, clock, server, edit } = setup();
    edit(draft => { draft.vehicle.make = 'H'; });
    edit(draft => { draft.vehicle.make = 'Hy'; });
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    expect(clock.waiting).toBe(1); // three keystrokes, one pending save
    expect(server.calls).toHaveLength(0);
    clock.tick();
    await sync.save();
    expect(server.calls).toEqual([{ vehicle: { make: 'Hyundai' } }]);
    expect(server.draft.vehicle.make).toBe('Hyundai');
    expect(sync.hasUnsavedChanges).toBe(false);
  });

  it('sends nothing when nothing changed, and reports saved', async () => {
    const { sync, server, states } = setup();
    expect(await sync.save()).toBe(true);
    expect(server.calls).toHaveLength(0);
    expect(states.at(-1)).toBe('saved');
  });

  it('does not save before the draft exists on the server, but remembers what was typed', async () => {
    const { server, api } = fakeServer();
    const clock = manualClock();
    const sync = new DraftSync({ ...api, schedule: clock.schedule, cancel: clock.cancel });
    const typed = emptyDraft();
    typed.vehicle.make = 'Hyundai';
    sync.update(typed);
    expect(clock.waiting).toBe(0);
    expect(await sync.save()).toBe(true);
    expect(server.calls).toHaveLength(0);
    sync.attach('draft-1', 1, emptyDraft(), typed);
    expect(sync.hasUnsavedChanges).toBe(true);
    await sync.flush();
    expect(server.draft.vehicle.make).toBe('Hyundai');
  });

  it('keeps one save running at a time: edits made during a save wait for it and then go out', async () => {
    const { sync, server, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    const first = sync.save();
    edit(draft => { draft.vehicle.model = 'i10'; });
    const second = sync.save();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(server.draft.vehicle).toEqual({ make: 'Hyundai', model: 'i10' });
    expect(sync.hasUnsavedChanges).toBe(false);
    // versions were never reused by two saves at once: each save used the previous one's result
    expect(server.version).toBe(1 + server.calls.length);
  });

  it('flush saves right away without waiting for the pause', async () => {
    const { sync, clock, server, edit } = setup();
    edit(draft => { draft.ownership.hasLoan = true; });
    expect(clock.waiting).toBe(1);
    expect(await sync.flush()).toBe(true);
    expect(clock.waiting).toBe(0);
    expect(server.draft.ownership.hasLoan).toBe(true);
  });

  it('sends a cleared field as a removal', async () => {
    const { sync, server, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; draft.vehicle.model = 'i10'; });
    await sync.flush();
    edit(draft => { draft.vehicle.model = ''; });
    await sync.flush();
    expect(server.calls.at(-1)).toEqual({ vehicle: { model: null } });
    expect(server.draft.vehicle).toEqual({ make: 'Hyundai' });
  });
});

describe('a field the server refuses', () => {
  const refuse = { 'vehicle.odometerKm': (value: unknown) => (typeof value === 'number' && value < 0 ? 'Enter the odometer reading in km.' : null) };

  it('is shown, the rest of the edit is still saved, and the draft is not blocked', async () => {
    const { sync, server, errors, edit } = setup({ refuse });
    edit(draft => { draft.vehicle.make = 'Hyundai'; draft.vehicle.odometerKm = -5; });
    expect(await sync.flush()).toBe(false); // not everything is saved: one field needs fixing
    expect(server.draft.vehicle).toEqual({ make: 'Hyundai' }); // but the good one is
    expect(errors.at(-1)).toEqual({ 'vehicle.odometerKm': 'Enter the odometer reading in km.' });
    expect(sync.fieldErrors).toEqual({ 'vehicle.odometerKm': 'Enter the odometer reading in km.' });
  });

  it('is not sent again by later edits to other fields, so a bad value cannot cause a request on every keystroke', async () => {
    const { sync, server, edit } = setup({ refuse });
    edit(draft => { draft.vehicle.odometerKm = -5; });
    await sync.flush();
    const callsAfterFirst = server.calls.length;
    for (const letter of ['H', 'Hy', 'Hyu']) { edit(draft => { draft.vehicle.make = letter; }); await sync.flush(); }
    const later = server.calls.slice(callsAfterFirst);
    expect(later).toHaveLength(3);
    expect(later.every(patch => !patch.vehicle || !('odometerKm' in patch.vehicle))).toBe(true);
  });

  it('is sent again once its value changes, and the error clears when the server accepts it', async () => {
    const { sync, server, errors, edit } = setup({ refuse });
    edit(draft => { draft.vehicle.odometerKm = -5; });
    await sync.flush();
    edit(draft => { draft.vehicle.odometerKm = 52000; });
    expect(await sync.flush()).toBe(true);
    expect(server.draft.vehicle.odometerKm).toBe(52000);
    expect(errors.at(-1)).toEqual({});
    expect(sync.fieldErrors).toEqual({});
  });

  it('when every field in an edit is refused, nothing is saved but nothing loops', async () => {
    const { sync, server, edit } = setup({ refuse });
    edit(draft => { draft.vehicle.odometerKm = -1; });
    const before = server.calls.length;
    expect(await sync.flush()).toBe(false);
    expect(server.calls.length - before).toBeLessThanOrEqual(2);
    expect(server.draft.vehicle).toEqual({});
  });
});

describe('when another device changed the draft', () => {
  it('adopts the server\'s draft instead of overwriting it, and says so', async () => {
    const { sync, server, conflicts, edit } = setup();
    server.otherDevice = { vehicle: { make: 'Tata' }, answers: { overall_condition: 'FAIR' } };
    server.conflictNext = true;
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    expect(await sync.flush()).toBe(false);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.vehicle.make).toBe('Tata'); // the other device's value won
    expect(sync.draft.vehicle.make).toBe('Tata');
    expect(server.draft.vehicle.make).toBe('Tata');
    expect(sync.hasUnsavedChanges).toBe(false);
    // and saving carries on normally from the new version
    edit(draft => { draft.vehicle.model = 'i10'; });
    expect(await sync.flush()).toBe(true);
    expect(server.draft.vehicle).toEqual({ make: 'Tata', model: 'i10' });
  });
});

describe('when the connection fails', () => {
  it('keeps everything to retry, says it is kept offline, and saves on retry without losing or repeating anything', async () => {
    const { sync, server, states, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; draft.answers.overall_condition = 'POOR'; });
    server.failNext = Object.assign(new Error('offline'), { status: 0, code: 'NETWORK_UNREACHABLE' });
    expect(await sync.flush()).toBe(false);
    expect(states.at(-1)).toBe('offline');
    expect(sync.hasUnsavedChanges).toBe(true);
    edit(draft => { draft.vehicle.model = 'i10'; }); // typing continues while offline
    expect(await sync.flush()).toBe(true);
    expect(server.draft.vehicle).toEqual({ make: 'Hyundai', model: 'i10' });
    expect(server.draft.answers).toEqual({ overall_condition: 'POOR' });
    expect(states.at(-1)).toBe('saved');
  });

  it('tells a server refusal that will not fix itself from a connection problem', async () => {
    const { sync, server, states, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    server.failNext = Object.assign(new Error('nope'), { status: 403, code: 'FORBIDDEN' });
    expect(await sync.flush()).toBe(false);
    expect(states.at(-1)).toBe('error');
    expect(sync.hasUnsavedChanges).toBe(true);
  });

  it('treats a server outage as retryable', async () => {
    const { sync, server, states, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    server.failNext = Object.assign(new Error('down'), { status: 503, code: 'SERVICE_UNAVAILABLE' });
    await sync.flush();
    expect(states.at(-1)).toBe('offline');
  });
});

describe('leaving the screen', () => {
  it('a disposed engine stops scheduling saves, but a flush before leaving still sends what is pending', async () => {
    const { sync, clock, server, edit } = setup();
    edit(draft => { draft.vehicle.make = 'Hyundai'; });
    expect(await sync.flush()).toBe(true);
    edit(draft => { draft.vehicle.model = 'i10'; });
    sync.dispose();
    expect(clock.waiting).toBe(0);
    edit(draft => { draft.vehicle.variant = 'Magna'; });
    expect(clock.waiting).toBe(0); // nothing is scheduled after dispose
    expect(server.draft.vehicle).toEqual({ make: 'Hyundai' });
  });
});
