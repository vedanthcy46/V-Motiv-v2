import { trackRequest } from '../hooks/requestProgress';

/** Resolve the API base URL the same way in every portal. */
export function resolveApiBase(env: string | undefined, fallback = 'http://localhost:4100/api/v2'): string {
  const raw = ((env || '').trim() || fallback)
    .replace('https://vmotiv.in', 'https://api.vmotiv.in')
    .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
    .replace(/\/$/, '');
  return raw.endsWith('/api/v2') || raw.endsWith('/api/v1') ? raw : `${raw}/api/v2`;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  base: string;
  /** Returns a Firebase ID token. `forceRefresh` is only true after the server rejected the previous token. */
  getToken: (forceRefresh: boolean) => Promise<string>;
  /** Added in front of every path (e.g. "/sales"). */
  prefix?: string;
  timeoutMs?: number;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Do not show the global progress bar for this request (background polling). */
  quiet?: boolean;
}

const RETRYABLE = new Set([502, 503, 504]);
/** Background polling endpoints never drive the progress bar. */
const BACKGROUND_PATH = /^\/(pulse|notifications\/unread)/;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One fetch wrapper for all portals:
 *  - identical GET requests that are already in flight share one network call (no duplicate list loads),
 *  - a failed token triggers exactly one refresh-and-retry,
 *  - idempotent GETs are retried once on gateway errors / dropped connections,
 *  - every request drives the global progress bar so users see that something is happening.
 */
export function createApiClient(options: ApiClientOptions) {
  const { base, getToken, prefix = '', timeoutMs = 20_000 } = options;
  const inflight = new Map<string, Promise<unknown>>();

  async function send<T>(path: string, init: RequestOptions, refreshed: boolean, attempt: number): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const token = await getToken(refreshed);
    const { body, quiet: _quiet, headers, ...rest } = init;
    let response: Response;
    try {
      response = await fetch(`${base}${prefix}${path}`, {
        ...rest,
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (method === 'GET' && attempt === 0 && !(error instanceof DOMException && error.name === 'AbortError' && init.signal?.aborted)) {
        await wait(400);
        return send<T>(path, init, refreshed, 1);
      }
      throw new ApiError(0, error instanceof DOMException && error.name === 'TimeoutError' ? 'REQUEST_TIMED_OUT' : 'NETWORK_UNAVAILABLE');
    }
    if (response.status === 401 && !refreshed) return send<T>(path, init, true, attempt);
    if (method === 'GET' && attempt === 0 && RETRYABLE.has(response.status)) {
      await wait(400);
      return send<T>(path, init, refreshed, 1);
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      throw new ApiError(response.status, payload.code || payload.message || 'REQUEST_FAILED');
    }
    if (response.status === 204) return undefined as T;
    const type = response.headers.get('content-type');
    if (type && !type.includes('application/json')) throw new ApiError(response.status, 'INVALID_SERVER_RESPONSE');
    return (await response.json()) as T;
  }

  function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const run = () => {
      const promise = send<T>(path, init, false, 0);
      return init.quiet || BACKGROUND_PATH.test(path) ? promise : trackRequest(promise);
    };
    if (method !== 'GET' || init.signal) return run();
    const key = path;
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  return {
    request,
    get: <T>(path: string, init: RequestOptions = {}) => request<T>(path, { ...init, method: 'GET' }),
    post: <T>(path: string, body?: unknown, init: RequestOptions = {}) => request<T>(path, { ...init, method: 'POST', body }),
    patch: <T>(path: string, body?: unknown, init: RequestOptions = {}) => request<T>(path, { ...init, method: 'PATCH', body }),
    put: <T>(path: string, body?: unknown, init: RequestOptions = {}) => request<T>(path, { ...init, method: 'PUT', body }),
    delete: <T>(path: string, init: RequestOptions = {}) => request<T>(path, { ...init, method: 'DELETE' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Human wording for an error code; unknown codes are title-cased. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.code === 'REQUEST_TIMED_OUT' ? 'The server took too long to respond. Please try again.' : 'Cannot reach the server. Check your connection and try again.';
    if (error.status === 403) return 'You do not have permission to do this.';
    if (error.status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (error.status >= 500) return 'The server had a problem. Please try again in a moment.';
    const text = error.code.replace(/_/g, ' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
