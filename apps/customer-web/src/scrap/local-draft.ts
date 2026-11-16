import type { DraftState } from '../../../customer-mobile/src/services/scrap-form';

// A copy of the answers in this browser, so closing the tab, losing the connection or a failed save never loses what was typed. The server's
// draft is the real one (it follows the person to another device); this is only what has not reached it yet. Storage can be unavailable
// (private windows, blocked site data), so every call is guarded and never blocks anyone.

const key = (userId: string | undefined, requestId: string | null) => `vmotiv.scrap-draft.v1.${userId || 'guest'}.${requestId ?? 'new'}`;

const defaultStorage = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

export function readLocalDraft(userId: string | undefined, requestId: string | null, storage: Storage | null = defaultStorage()): DraftState | null {
  try {
    const raw = storage?.getItem(key(userId, requestId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DraftState> | null;
    if (!value || typeof value !== 'object') return null;
    // Only the four known parts, each an object, so a damaged or hand-edited entry cannot put anything else into the form.
    const part = (input: unknown) => (input && typeof input === 'object' && !Array.isArray(input) ? { ...(input as object) } : {});
    return { vehicle: part(value.vehicle), answers: part(value.answers), ownership: part(value.ownership), pickupAddress: part(value.pickupAddress) } as DraftState;
  } catch {
    return null;
  }
}

export function writeLocalDraft(userId: string | undefined, requestId: string | null, draft: DraftState, storage: Storage | null = defaultStorage()): void {
  try { storage?.setItem(key(userId, requestId), JSON.stringify(draft)); } catch { /* not kept in the browser; the server copy still works */ }
}

export function clearLocalDraft(userId: string | undefined, requestId: string | null, storage: Storage | null = defaultStorage()): void {
  try { storage?.removeItem(key(userId, requestId)); } catch { /* nothing to clean up */ }
}
