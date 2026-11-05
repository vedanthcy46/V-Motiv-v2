import { useCallback, useRef, useState } from 'react';
import { toast } from './toastStore';
import { trackRequest } from './requestProgress';
import { describeApiError } from '../api/client';

export interface ActionOptions<A extends unknown[], R> {
  /** Toast shown when the action succeeds. A function receives the result. */
  success?: string | ((result: R) => string);
  /** Prefix for the failure toast; the error's own message is the description. */
  errorTitle?: string;
  /** Maps a thrown error to readable text. */
  describeError?: (error: unknown) => string;
  onSuccess?: (result: R, ...args: A) => void;
  onError?: (error: unknown, ...args: A) => void;
}

/** Plain-language text for an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && !(error instanceof Error)) {
    const e = error as { code?: unknown };
    if (typeof e.code === 'string' && e.code) return e.code.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  }
  return describeApiError(error);
}

/**
 * Runs a server action with an immediate busy state (buttons show a spinner the instant they are pressed),
 * ignores double clicks while it runs, drives the global progress bar and reports the outcome with a toast.
 */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>, options: ActionOptions<A, R> = {}) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const latest = useRef({ action, options });
  latest.current = { action, options };

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    const { action: fn, options: opts } = latest.current;
    try {
      const result = await trackRequest(fn(...args));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result, ...args);
      return result;
    } catch (error) {
      toast.error(opts.errorTitle ?? 'Action failed', { description: (opts.describeError ?? errorMessage)(error) });
      opts.onError?.(error, ...args);
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
