import { beforeEach, describe, expect, it, vi } from 'vitest';

const android = vi.hoisted(() => ({
  check: vi.fn<() => Promise<boolean>>(),
  request: vi.fn<() => Promise<string>>(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  PermissionsAndroid: {
    PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
    check: android.check,
    request: android.request,
  },
}));

import { ensureMicrophone } from './mic-permission';

describe('microphone permission', () => {
  beforeEach(() => { android.check.mockReset(); android.request.mockReset(); });

  it('does not ask when the microphone is already allowed', async () => {
    android.check.mockResolvedValue(true);
    expect(await ensureMicrophone()).toBe('granted');
    expect(android.request).not.toHaveBeenCalled();
  });

  it('two callers at once share one prompt', async () => {
    android.check.mockResolvedValueOnce(false).mockResolvedValue(true);
    let answer!: (value: string) => void;
    android.request.mockReturnValue(new Promise<string>(resolve => { answer = resolve; }));
    const first = ensureMicrophone();
    const second = ensureMicrophone();
    await Promise.resolve();
    answer('granted');
    expect(await first).toBe('granted');
    expect(await second).toBe('granted');
    expect(android.request).toHaveBeenCalledTimes(1);
  });

  it('reads the real state after a refusal, so a microphone allowed meanwhile counts as allowed', async () => {
    android.check.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    android.request.mockResolvedValue('denied');
    expect(await ensureMicrophone()).toBe('granted');
  });

  it('tells a refusal from a permanent block', async () => {
    android.check.mockResolvedValue(false);
    android.request.mockResolvedValueOnce('denied').mockResolvedValueOnce('never_ask_again');
    expect(await ensureMicrophone()).toBe('denied');
    expect(await ensureMicrophone()).toBe('blocked');
  });
});
