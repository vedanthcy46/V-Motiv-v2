import { describe, expect, it } from 'vitest';
import express from 'express';
import { fetchToExpress } from '../src/worker-cf.js';

describe('Cloudflare Worker to Express bridge', () => {
  it.each([undefined, '0'])('preserves a JSON mutation body when Cloudflare sends Content-Length %s', async (contentLength) => {
    const app = express();
    const jsonBodyParser = express.json();
    app.use((req, res, next) => req.body !== undefined ? next() : jsonBodyParser(req, res, next));
    app.post('/echo', (req, res) => res.status(201).json({ body: req.body }));

    const headers = new Headers({ 'content-type': 'application/json' });
    if (contentLength !== undefined) headers.set('content-length', contentLength);

    const request = new Request('https://api.vmotiv.in/echo', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: 'ExponentPushToken[device-token]', app: 'CUSTOMER' }),
    });

    expect(request.headers.get('content-length')).toBe(contentLength ?? null);

    const response = await fetchToExpress(app, request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      body: { token: 'ExponentPushToken[device-token]', app: 'CUSTOMER' },
    });
  });
});
