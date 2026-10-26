import { afterEach, describe, expect, it, vi } from 'vitest';
import { friendlyError, syncProfile } from './account-api.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('account connection', () => {
  it('refreshes an expired Google token once and returns the backend profile', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'INVALID_OR_REVOKED_TOKEN' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'customer-1' }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const getIdToken = vi.fn().mockResolvedValue('verified-token');
    expect(await syncProfile({ getIdToken }, new AbortController().signal)).toEqual({ id: 'customer-1' });
    expect(getIdToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('stops loading if Google token restoration never resolves', async () => {
    vi.useFakeTimers();
    const result = syncProfile({ getIdToken: () => new Promise(() => undefined) }, new AbortController().signal, 100);
    const assertion = expect(result).rejects.toMatchObject({ code: 'API_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it('distinguishes a broken API proxy from a Google login failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>not the API</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(syncProfile({ getIdToken: async () => 'token' }, new AbortController().signal)).rejects.toMatchObject({ code: 'API_PROXY_UNAVAILABLE' });
    expect(friendlyError({ code: 'auth/argument-error' })).toContain('initialize');
    expect(friendlyError({ code: 'auth/unauthorized-domain' })).toContain('localhost:3100');
  });
  it('does not retry requests cancelled by a page or account change', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const controller = new AbortController(); controller.abort();
    await expect(syncProfile({ getIdToken: async () => 'token' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
