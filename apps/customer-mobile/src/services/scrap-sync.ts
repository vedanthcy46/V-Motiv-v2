// Keeps a scrapping draft on the server in step with what the person has typed. No React, no network, no clock of its own: the screen supplies
// how to save and load, so the same engine runs (and is tested) without a browser or a phone.
//
// What it guarantees:
//  - Only what changed since the last confirmed save is sent, and only one save runs at a time.
//  - A field the server refuses is held back (shown to the person) so it does not stop everything else from being saved, and it is not sent
//    again until its value changes.
//  - If another device changed the draft (a version conflict) the server's draft is adopted, never overwritten.
//  - A failed save leaves everything in place to be retried: nothing the person typed is dropped.

import { applyDraftPatch, diffDraft, draftFromServer, fieldErrorsFrom, fieldsOfPatch, isRetryable, patchWithout, valueAt, type DraftPatch, type DraftState } from './scrap-form';

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface DraftSyncDeps {
  saveDraft(id: string, expectedVersion: number, patch: DraftPatch): Promise<{ version: number }>;
  /** Reads the server's current draft, used after a version conflict. */
  loadDraft(id: string): Promise<{ version: number; draft: DraftState }>;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  debounceMs?: number;
}

export interface DraftSyncEvents {
  state?: (state: SaveState) => void;
  fieldErrors?: (errors: Record<string, string>) => void;
  /** Another device changed the draft. `draft` is the server's version, now the one being edited. */
  conflict?: (draft: DraftState) => void;
}

const MAX_ROUNDS = 6;

const statusOf = (error: unknown) => (error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 0);
const codeOf = (error: unknown) => (error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '');

export class DraftSync {
  private id: string | null = null;
  private version = 0;
  private saved: DraftState = draftFromServer(undefined);
  private current: DraftState = draftFromServer(undefined);
  private refused = new Map<string, string>();
  private errors: Record<string, string> = {};
  private timer: unknown = null;
  private queue: Promise<boolean> = Promise.resolve(true);
  private disposed = false;

  constructor(private readonly deps: DraftSyncDeps, private readonly events: DraftSyncEvents = {}) {}

  /** Starts syncing a draft the server holds. `current` is what the screen shows (it may hold edits the server has not seen). */
  attach(id: string, version: number, saved: DraftState, current: DraftState = saved) {
    this.id = id;
    this.version = version;
    this.saved = draftFromServer(saved);
    this.current = draftFromServer(current);
    this.refused.clear();
    this.setErrors({});
  }

  get attached() { return this.id !== null; }
  get requestId() { return this.id; }
  get draft() { return this.current; }
  get fieldErrors() { return this.errors; }
  get hasUnsavedChanges() { return diffDraft(this.saved, this.current) !== null; }

  /** The screen's draft changed: remember it and save soon. Before the draft exists on the server, only remembers. */
  update(next: DraftState) {
    this.current = next;
    this.schedule();
  }

  private schedule() {
    if (!this.id || this.disposed) return;
    const cancel = this.deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    if (this.timer !== null) cancel(this.timer);
    const schedule = this.deps.schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
    this.timer = schedule(() => { this.timer = null; void this.save(); }, this.deps.debounceMs ?? 800);
  }

  private setErrors(next: Record<string, string>) {
    this.errors = next;
    this.events.fieldErrors?.({ ...next });
  }

  private setState(state: SaveState) {
    if (!this.disposed) this.events.state?.(state);
  }

  /** Saves now. Saves are queued, so a request made while one is running waits for it, then sends whatever is left. */
  save(): Promise<boolean> {
    const next = this.queue.then(() => this.run());
    this.queue = next.catch(() => false);
    return next;
  }

  /** Cancels the wait and saves immediately (before submitting, before leaving). */
  flush(): Promise<boolean> {
    const cancel = this.deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    if (this.timer !== null) { cancel(this.timer); this.timer = null; }
    return this.save();
  }

  dispose() {
    const cancel = this.deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    if (this.timer !== null) { cancel(this.timer); this.timer = null; }
    this.disposed = true;
  }

  /** True when the server holds everything the person has entered, except fields it refused (which are being shown to be fixed). */
  private async run(): Promise<boolean> {
    if (!this.id) return true;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const full = diffDraft(this.saved, this.current);
      if (!full) { this.setState('saved'); return Object.keys(this.errors).length === 0; }

      // Leave out any field whose current value is the one the server already refused.
      const stillRefused = [...this.refused.entries()].filter(([field, value]) => JSON.stringify(valueAt(this.current, field) ?? null) === value).map(([field]) => field);
      const patch = patchWithout(full, stillRefused);
      if (!patch) { this.setState('saved'); return Object.keys(this.errors).length === 0; }

      this.setState('saving');
      try {
        const result = await this.deps.saveDraft(this.id, this.version, patch);
        this.version = result.version;
        this.saved = applyDraftPatch(this.saved, patch);
        const sent = fieldsOfPatch(patch);
        for (const field of sent) this.refused.delete(field);
        this.setErrors(Object.fromEntries(Object.entries(this.errors).filter(([field]) => !sent.includes(field))));
      } catch (error) {
        if (statusOf(error) === 409 && codeOf(error) === 'SCRAP_VERSION_CONFLICT') {
          try {
            const server = await this.deps.loadDraft(this.id);
            this.version = server.version;
            this.saved = draftFromServer(server.draft);
            this.current = draftFromServer(server.draft);
            this.refused.clear();
            this.setErrors({});
            this.events.conflict?.(this.current);
            this.setState('saved');
          } catch (loadError) {
            this.setState(isRetryable(loadError) ? 'offline' : 'error');
          }
          return false;
        }
        const fields = fieldErrorsFrom(error);
        if (statusOf(error) === 400 && Object.keys(fields).length) {
          for (const field of Object.keys(fields)) this.refused.set(field, JSON.stringify(valueAt(this.current, field) ?? null));
          this.setErrors({ ...this.errors, ...fields });
          continue; // save the rest without the refused fields
        }
        this.setState(isRetryable(error) ? 'offline' : 'error');
        return false;
      }
    }
    // Too many rounds without settling: leave what is left for the next change or retry rather than looping.
    this.setState('error');
    return false;
  }
}
