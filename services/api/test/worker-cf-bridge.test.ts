import { describe, expect, it } from 'vitest';
import express from 'express';
import { fetchToExpress } from '../src/worker-cf.js';

describe('Cloudflare Worker to Express bridge', () => {
  it('preserves a JSON mutation body when Cloudflare omits Content-Length', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (req, res) => res.status(201).json({ body: req.body }));

    const request = new Request('https://api.vmotiv.in/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'ExponentPushToken[device-token]', app: 'CUSTOMER' }),
    });

    expect(request.headers.get('content-length')).toBeNull();

    const response = await fetchToExpress(app, request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      body: { token: 'ExponentPushToken[device-token]', app: 'CUSTOMER' },
    });
  });
});
