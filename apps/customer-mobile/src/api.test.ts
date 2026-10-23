import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  NativeModules: { SourceCode: { scriptURL: 'http://localhost:8081/index.bundle' } },
  TurboModuleRegistry: { get: () => null },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: 'localhost:8081' } } }));

import { api } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mobile API request completion', () => {
  it('accepts a successful no-content delete without trying to parse JSON', async () => {
    vi.stubGlobal('__DEV__', true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api<void>('/me/wishlist/listing-id', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not send a request whose caller already cancelled it', async () => {
    vi.stubGlobal('__DEV__', true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(api('/auth/sync', { method: 'POST', signal: cancellation.signal })).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops waiting and aborts a hung fetch at the request deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('__DEV__', true);
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      requestSignal = init.signal;
      return new Promise<Response>(() => undefined);
    }));
    const pending = api('/auth/sync', { method: 'POST' });
    const rejected = expect(pending).rejects.toThrow('REQUEST_TIMEOUT');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
  });
});
