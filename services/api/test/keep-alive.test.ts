import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepAliveTarget, pingHealth, startKeepAlive, KEEP_ALIVE_INTERVAL_MS } from '../src/keep-alive.js';

const quiet = { info: vi.fn(), warn: vi.fn() };

describe('keep-alive target', () => {
  it('uses the public address Render provides', () => {
    expect(keepAliveTarget({ RENDER_EXTERNAL_URL: 'https://vmotiv-api.onrender.com/' } as any)).toBe('https://vmotiv-api.onrender.com');
  });
  it('lets KEEP_ALIVE_URL override it, and KEEP_ALIVE=false turn it off', () => {
    expect(keepAliveTarget({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', KEEP_ALIVE_URL: 'https://api.vmotiv.in' } as any)).toBe('https://api.vmotiv.in');
    expect(keepAliveTarget({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', KEEP_ALIVE: 'false' } as any)).toBeNull();
  });
  it('does nothing locally or without a public https address', () => {
    expect(keepAliveTarget({} as any)).toBeNull();
    expect(keepAliveTarget({ KEEP_ALIVE_URL: 'http://localhost:4100' } as any)).toBeNull();
    expect(keepAliveTarget({ KEEP_ALIVE_URL: 'http://example.com' } as any)).toBeNull();
    expect(keepAliveTarget({ KEEP_ALIVE_URL: 'not a url' } as any)).toBeNull();
  });
});

describe('keep-alive pings', () => {
  afterEach(() => vi.useRealTimers());

  it('calls the health route and reports success', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    expect(await pingHealth({ baseUrl: 'https://x.onrender.com', fetchImpl, log: quiet })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.onrender.com/health/live', expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('never throws when the call fails or the service answers an error', async () => {
    expect(await pingHealth({ baseUrl: 'https://x', fetchImpl: async () => { throw new Error('network down'); }, log: quiet })).toBe(false);
    expect(await pingHealth({ baseUrl: 'https://x', fetchImpl: async () => ({ ok: false, status: 503 }), log: quiet })).toBe(false);
  });

  it('pings every 5 minutes until stopped', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const stop = startKeepAlive({ baseUrl: 'https://x.onrender.com', fetchImpl, log: quiet });
    expect(KEEP_ALIVE_INTERVAL_MS).toBe(300_000);
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS - 1);
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS * 2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS * 2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
