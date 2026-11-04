import { describe, expect, it, vi } from 'vitest';
import { emitRefreshSignal, onRefreshSignal } from './refresh-bus';

describe('refresh bus', () => {
  it('delivers signals to every listener, isolates failures, and unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const off = onRefreshSignal(a);
    onRefreshSignal(() => { throw new Error('boom'); });
    onRefreshSignal(b);
    emitRefreshSignal('push');
    expect(a).toHaveBeenCalledWith('push');
    expect(b).toHaveBeenCalledWith('push');
    off();
    emitRefreshSignal('push');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});
