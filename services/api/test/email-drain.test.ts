import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { hasDeliverableEmail, singleFlight } from '../src/email-drain.js';

type Any = any;

describe('checking the outbox before claiming from it', () => {
  it('asks for one due or abandoned email with a single query, and reports whether there is one', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce({ id: 'e1' }).mockResolvedValueOnce(null);
    const db = { emailOutbox: { findFirst } } as Any;
    const now = new Date('2026-11-19T10:00:00Z');
    expect(await hasDeliverableEmail(db, now)).toBe(true);
    expect(await hasDeliverableEmail(db, now)).toBe(false);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst.mock.calls[0]![0]).toEqual({
      where: { OR: [{ state: 'PENDING', availableAt: { lte: now } }, { state: 'PROCESSING', leaseUntil: { lt: now } }] },
      select: { id: true },
    });
  });
});

describe('running the drain one at a time', () => {
  const deferred = () => { let resolve!: (n: number) => void; const promise = new Promise<number>(r => { resolve = r; }); return { promise, resolve }; };

  it('does not start a second copy while one is running, but runs once more afterwards so nothing queued meanwhile is missed', async () => {
    const gates = [deferred(), deferred()];
    let started = 0;
    let active = 0;
    let overlapped = false;
    const run = vi.fn(async () => { active += 1; if (active > 1) overlapped = true; const n = await gates[started++]!.promise; active -= 1; return n; });
    const drain = singleFlight(run);

    const first = drain();
    const second = drain(); // while the first is running
    const third = drain();
    expect(run).toHaveBeenCalledTimes(1);
    gates[0]!.resolve(2);
    expect(await first).toBe(2);
    expect(await second).toBe(2); // they share the running pass
    expect(await third).toBe(2);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)); // the extra pass
    gates[1]!.resolve(1);
    await vi.waitFor(() => expect(active).toBe(0));
    expect(run).toHaveBeenCalledTimes(2); // three calls, two passes
    expect(overlapped).toBe(false);
  });

  it('starts fresh once it is idle, and a failing pass neither throws nor blocks the next', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValueOnce(3);
    const drain = singleFlight(run);
    expect(await drain()).toBe(0);
    expect(await drain()).toBe(3);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('queueing an email no longer makes a person wait for it to be sent', () => {
  function setup(options: { background: boolean }) {
    const gate = deferred();
    const drainEmails = vi.fn(() => gate.promise);
    const verify = vi.fn().mockResolvedValue({ uid: 'u1', email: 'a@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const store = { sync: vi.fn().mockResolvedValue({ id: 'user-1', email: 'a@example.test' }), find: vi.fn(), ready: vi.fn() };
    const app = createApp({ verify: verify as Any, store: store as Any, webOrigin: 'http://localhost:3100', drainEmails, emailDrainInBackground: options.background });
    return { app, gate, drainEmails };
  }
  function deferred() { let resolve!: (n: number) => void; const promise = new Promise<number>(r => { resolve = r; }); return { promise, resolve }; }

  it('in background mode the response arrives while the drain is still running', async () => {
    const { app, gate, drainEmails } = setup({ background: true });
    const res = await request(app).post('/api/v2/auth/sync').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(drainEmails).toHaveBeenCalledTimes(1);
    gate.resolve(0);
  });

  it('a failing background drain is logged, not thrown at the request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, drainEmails } = setup({ background: true });
    drainEmails.mockRejectedValueOnce(new Error('provider down'));
    const res = await request(app).post('/api/v2/auth/sync').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('without background mode (serverless hosts) it still waits, as before', async () => {
    const { app, gate } = setup({ background: false });
    let answered = false;
    const pending = request(app).post('/api/v2/auth/sync').set('Authorization', 'Bearer t').then(res => { answered = true; return res; });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(answered).toBe(false); // held until the drain finishes
    gate.resolve(1);
    expect((await pending).status).toBe(200);
  });
});
