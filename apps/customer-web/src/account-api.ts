/// <reference types="vite/client" />
import type { User } from 'firebase/auth';

export type Profile = { id: string; displayName: string | null; email: string; marketingConsent: boolean; createdAt: string };
export class AccountError extends Error {
  constructor(readonly code: string, readonly status?: number) { super(code); }
}

const configuredApiBase = (((import.meta as any).env?.VITE_API_BASE as string | undefined) || '/api/v1')
  .replace('https://vmotiv.in', 'https://api.vmotiv.in')
  .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
  .replace(/\/$/, '');
const API_BASE = configuredApiBase.endsWith('/api/v1') || configuredApiBase.endsWith('/api/v2')
  ? configuredApiBase
  : `${configuredApiBase}/api/v2`;

export async function syncProfile(user: Pick<User, 'getIdToken'>, signal: AbortSignal, timeoutMs = 15_000): Promise<Profile> {
  // Cover token restoration, the API request, and response parsing with one deadline.
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const cancelled = new Promise<never>((_, reject) => {
    const rejectAbort = () => reject(signal.aborted ? new DOMException('Cancelled', 'AbortError') : new AccountError('API_TIMEOUT'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
    timer = setTimeout(() => controller.abort(), timeoutMs);
  });
  try {
    return await Promise.race([cancelled, (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await user.getIdToken(attempt > 0);
        if (controller.signal.aborted) throw new AccountError('API_TIMEOUT');
        let response: Response;
        try {
          response = await fetch(`${API_BASE}/auth/sync`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw new AccountError('API_UNREACHABLE');
        }
        if (response.status === 401 && attempt === 0) continue;
        if (!response.headers.get('content-type')?.includes('application/json')) throw new AccountError('API_PROXY_UNAVAILABLE', response.status);
        const body = await response.json();
        if (!response.ok) throw new AccountError(body.code || (response.status === 429 ? 'RATE_LIMITED' : 'API_UNAVAILABLE'), response.status);
        return body as Profile;
      }
      throw new AccountError('INVALID_OR_REVOKED_TOKEN');
    })()]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', cancel);
  }
}

export function friendlyError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Sign-in was closed. Select Continue with Google to try again.',
    'auth/cancelled-popup-request': 'A sign-in window is already open. Complete it or try again.',
    'auth/popup-blocked': 'Allow the Google sign-in pop-up for this site and try again.',
    'auth/unauthorized-domain': 'This website address is not enabled for Google sign-in. Open localhost:3100 or ask V MOTIV to authorize this domain.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project.',
    'auth/argument-error': 'Google sign-in could not initialize. Reload this page to load the latest sign-in configuration.',
    'auth/network-request-failed': 'Google could not be reached. Check your internet connection and try again.',
    GOOGLE_SIGN_IN_TIMEOUT: 'Google sign-in timed out. Close any old sign-in window and try again.',
    ACCOUNT_INACTIVE: 'Your account is currently unavailable. Contact V MOTIV support.',
    INVALID_OR_REVOKED_TOKEN: 'Your session has expired. Sign out and sign in again.',
    VERIFIED_GOOGLE_IDENTITY_REQUIRED: 'V MOTIV requires a verified Google email address. Choose a verified Google account.',
    AUTHENTICATION_REQUIRED: 'Your Google session was not received. Try signing in again.',
    API_TIMEOUT: 'Connecting took too long. Try again; your Google account remains signed in.',
    API_UNREACHABLE: 'The V MOTIV server could not be reached. Check your connection and try again.',
    API_PROXY_UNAVAILABLE: 'The website could not reach the V MOTIV API. Restart the website and API development servers.',
    API_UNAVAILABLE: 'The V MOTIV account service is temporarily unavailable. Try again shortly.',
    INTERNAL_ERROR: 'The V MOTIV account service encountered an error. Try again shortly.',
    RATE_LIMITED: 'Too many requests. Wait a minute before trying again.',
  };
  return messages[code] || 'Google sign-in could not finish. Try again or choose another Google account.';
}
