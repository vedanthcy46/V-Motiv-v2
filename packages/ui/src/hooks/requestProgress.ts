import { useSyncExternalStore } from 'react';

// Counts requests that are in flight so the whole app can show one "working" bar until the server answers.
let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Wrap any promise (usually a fetch) so the global progress bar reflects it. Returns the same promise. */
export function trackRequest<T>(promise: Promise<T>): Promise<T> {
  pending += 1;
  emit();
  const done = () => { pending = Math.max(0, pending - 1); emit(); };
  promise.then(done, done);
  return promise;
}

export function usePendingRequests(): number {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => pending,
    () => 0,
  );
}
