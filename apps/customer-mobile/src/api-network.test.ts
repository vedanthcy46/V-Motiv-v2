import { describe, expect, it, vi } from 'vitest';
import { resolveApiBaseUrl, withDeadline } from './api-network';

describe('development API connectivity', () => {
  it('replaces a stale private address with the current Wi-Fi Metro address', () => {
    expect(resolveApiBaseUrl({ configured: 'http://192.168.31.223:4100/api/v1', development: true, devServerUrl: 'http://192.168.31.84:8081/index.bundle' }))
      .toBe('http://192.168.31.84:4100/api/v1');
  });
  it('uses USB loopback when Metro is served through adb reverse', () => {
    expect(resolveApiBaseUrl({ configured: 'http://192.168.31.223:4100/api/v1', development: true, devServerUrl: 'http://localhost:8081/index.bundle' }))
      .toBe('http://localhost:4100/api/v1');
  });
  it('allows emulator configuration and preserves explicit public APIs', () => {
    expect(resolveApiBaseUrl({ development: true, devServerUrl: '10.0.2.2:8081' })).toBe('http://10.0.2.2:4100/api/v1');
    expect(resolveApiBaseUrl({ configured: 'https://api.vmotiv.example/api/v1/', development: true, devServerUrl: 'localhost:8081' }))
      .toBe('https://api.vmotiv.example/api/v1');
  });
  it('does not infer a backend from a Metro tunnel or shipped build', () => {
    expect(resolveApiBaseUrl({ configured: 'http://localhost:4100/api/v1', development: true, devServerUrl: 'abc.exp.direct:8081' }))
      .toBe('http://localhost:4100/api/v1');
    expect(() => resolveApiBaseUrl({ development: false, devServerUrl: '192.168.31.84:8081' })).toThrow('API_CONFIGURATION_REQUIRED');
    expect(resolveApiBaseUrl({ configured: 'https://api.vmotiv.example/api/v1', development: false, devServerUrl: 'localhost:8081' }))
      .toBe('https://api.vmotiv.example/api/v1');
  });
  it('releases a hung operation at the deadline and invokes cancellation', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const pending = withDeadline(new Promise<never>(() => undefined), 15_000, 'REQUEST_TIMEOUT', cancel);
      const rejection = expect(pending).rejects.toThrow('REQUEST_TIMEOUT');
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(cancel).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
