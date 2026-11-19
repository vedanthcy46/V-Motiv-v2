import compression from 'compression';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { tuneDatabaseUrl } from '../src/config.js';
import { milliseconds, requestTiming, routeLabel, slowQueryLine } from '../src/request-timing.js';

describe('slow request logging', () => {
  function build(clock: () => number, log: (line: string) => void, slowMs = 500) {
    const app = express();
    app.use(requestTiming({ slowMs, log, now: clock }));
    const router = express.Router();
    router.get('/items/:id', (_req, res) => { res.json({ ok: true }); });
    app.use('/api/v2', router);
    app.get('/nothing-here-handler', (_req, res) => { res.status(204).end(); });
    return app;
  }
  const ticking = (...steps: number[]) => { let t = 0; const queue = [...steps]; return () => { t += queue.shift() ?? 0; return t; }; };

  it('logs a request that takes too long, by route pattern and never by the real path', async () => {
    const lines: string[] = [];
    const app = build(ticking(0, 750), line => lines.push(line)); // started at 0, finished at 750
    await request(app).get('/api/v2/items/secret-token-123');
    expect(lines).toEqual(['[SLOW_REQUEST] GET /api/v2/items/:id 200 750ms']);
    expect(lines.join()).not.toContain('secret-token-123');
  });

  it('stays quiet for a fast request', async () => {
    const lines: string[] = [];
    await request(build(ticking(0, 40), line => lines.push(line))).get('/api/v2/items/abc');
    expect(lines).toEqual([]);
  });

  it('logs requests that matched no route with a generic label (so probing URLs are not written to the log)', async () => {
    const lines: string[] = [];
    await request(build(ticking(0, 900), line => lines.push(line))).get('/wp-admin/setup.php?token=abc');
    expect(lines).toEqual(['[SLOW_REQUEST] GET (no route) 404 900ms']);
  });

  it('is off when the threshold is 0, and never changes the response', async () => {
    const lines: string[] = [];
    const app = build(ticking(0, 9999), line => lines.push(line), 0);
    const res = await request(app).get('/api/v2/items/abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(lines).toEqual([]);
  });

  it('labels a route from its method, mount point and pattern', () => {
    expect(routeLabel({ method: 'POST', baseUrl: '/api/v2', route: { path: '/customer/scrap/requests' } } as never)).toBe('POST /api/v2/customer/scrap/requests');
    expect(routeLabel({ method: 'GET', baseUrl: '', route: undefined } as never)).toBe('GET (no route)');
  });
});

describe('thresholds and query lines', () => {
  it('reads whole-number settings and falls back on anything else', () => {
    expect(milliseconds(undefined, 1500)).toBe(1500);
    expect(milliseconds('', 1500)).toBe(1500);
    expect(milliseconds('250', 1500)).toBe(250);
    expect(milliseconds('0', 1500)).toBe(0);
    for (const bad of ['-5', '1.5', 'abc', 'Infinity']) expect(milliseconds(bad, 1500)).toBe(1500);
  });

  it('logs only slow queries, without parameter values, and trims very long statements', () => {
    expect(slowQueryLine({ duration: 120, query: 'SELECT 1' }, 1000)).toBeNull();
    expect(slowQueryLine({ duration: 5000, query: 'SELECT 1' }, 0)).toBeNull();
    expect(slowQueryLine({ duration: 1400, query: 'SELECT  *\n  FROM "User"\nWHERE "email" = $1' }, 1000)).toBe('[SLOW_QUERY] 1400ms SELECT * FROM "User" WHERE "email" = $1');
    const long = slowQueryLine({ duration: 2000, query: `SELECT ${'x, '.repeat(400)}1` }, 1000)!;
    expect(long.length).toBeLessThan(340);
    expect(long.endsWith('…')).toBe(true);
    // The event also carries a params field in Prisma; the line is built only from duration and query text.
    expect(slowQueryLine({ duration: 2000, query: 'SELECT $1', params: '["asha@example.test"]' } as never, 1000)).not.toContain('asha');
  });
});

describe('database connection settings', () => {
  const tuned = (url: string, env: NodeJS.ProcessEnv = {}) => tuneDatabaseUrl(new URL(url), env).searchParams;

  it('gives a pooled Neon address pgbouncer mode, a connection limit and timeouts', () => {
    const params = tuned('postgresql://u:p@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require');
    expect(params.get('pgbouncer')).toBe('true');
    expect(params.get('connection_limit')).toBe('10');
    expect(params.get('connect_timeout')).toBe('30');
    expect(params.get('pool_timeout')).toBe('30');
    expect(params.get('sslmode')).toBe('require');
  });

  it('takes the limit from DB_CONNECTION_LIMIT when it is sensible, and ignores nonsense', () => {
    const url = 'postgresql://u:p@ep-x-pooler.aws.neon.tech/db';
    expect(tuned(url, { DB_CONNECTION_LIMIT: '25' }).get('connection_limit')).toBe('25');
    for (const bad of ['0', '500', 'abc', '2.5']) expect(tuned(url, { DB_CONNECTION_LIMIT: bad }).get('connection_limit')).toBe('10');
  });

  it('never overrides what the address already says', () => {
    const params = tuned('postgresql://u:p@ep-x-pooler.aws.neon.tech/db?connection_limit=3&pgbouncer=false&connect_timeout=5');
    expect(params.get('connection_limit')).toBe('3');
    expect(params.get('pgbouncer')).toBe('false');
    expect(params.get('connect_timeout')).toBe('5');
  });

  it('a direct (not pooled) Neon address only gets timeouts: no pgbouncer mode, no limit', () => {
    const params = tuned('postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db');
    expect(params.has('pgbouncer')).toBe(false);
    expect(params.has('connection_limit')).toBe(false);
    expect(params.get('connect_timeout')).toBe('30');
  });

  it('leaves any other database address alone', () => {
    expect(tuneDatabaseUrl(new URL('postgresql://u:p@localhost:5432/vmotiv_v2_dev')).search).toBe('');
  });
});

describe('response compression', () => {
  const big = { items: Array.from({ length: 200 }, (_, i) => ({ id: i, title: `A fairly long repeated title for row ${i}`, status: 'CONFIRMED' })) };

  it('compresses a large JSON response when the client accepts gzip, and not a tiny one', async () => {
    const app = express();
    app.use(compression({ threshold: 1024 }));
    app.get('/big', (_req, res) => { res.json(big); });
    app.get('/small', (_req, res) => { res.json({ ok: true }); });
    const large = await request(app).get('/big').set('Accept-Encoding', 'gzip');
    expect(large.headers['content-encoding']).toBe('gzip');
    expect(large.body.items).toHaveLength(200); // and the client still reads the same data
    expect((await request(app).get('/small').set('Accept-Encoding', 'gzip')).headers['content-encoding']).toBeUndefined();
    expect((await request(app).get('/big').set('Accept-Encoding', 'identity')).headers['content-encoding']).toBeUndefined();
  });

  it('createApp puts the supplied compression in front of every route, and works without it', async () => {
    const seen = vi.fn();
    const spy = ((_req: unknown, _res: unknown, next: () => void) => { seen(); next(); }) as never;
    const deps = { verify: vi.fn() as never, store: { sync: vi.fn(), find: vi.fn(), ready: vi.fn() } as never, webOrigin: 'http://localhost:3100' };
    await request(createApp({ ...deps, compression: spy })).get('/health/live');
    expect(seen).toHaveBeenCalledTimes(1);
    expect((await request(createApp(deps)).get('/health/live')).status).toBe(200);
  });
});
