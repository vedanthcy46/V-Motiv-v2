import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createEdgeTokenVerifier } from '../src/edge-auth.js';

describe('createEdgeTokenVerifier', () => {
  it('successfully verifies a valid Firebase RS256 token and extracts identity claims', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'test-key-id-1';
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const jwksUrl = new URL(`http://127.0.0.1:${port}/jwks.json`);

    try {
      const verifier = createEdgeTokenVerifier({
        projectId: 'vmotiv-test',
        jwksUrl,
      });

      const token = await new SignJWT({
        sub: 'super-admin-uid-123',
        email: 'admin@vmotiv.in',
        email_verified: true,
        name: 'Super Admin',
        picture: 'https://example.com/avatar.png',
        firebase: {
          sign_in_provider: 'google.com',
          sign_in_second_factor: 'phone',
          identities: {
            'google.com': ['google-sub-id'],
            email: ['admin@vmotiv.in'],
          },
        },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id-1' })
        .setIssuer('https://securetoken.google.com/vmotiv-test')
        .setAudience('vmotiv-test')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      const decoded = await verifier(token, false);

      expect(decoded.uid).toBe('super-admin-uid-123');
      expect(decoded.sub).toBe('super-admin-uid-123');
      expect(decoded.email).toBe('admin@vmotiv.in');
      expect(decoded.email_verified).toBe(true);
      expect(decoded.name).toBe('Super Admin');
      expect(decoded.picture).toBe('https://example.com/avatar.png');
      expect(decoded.firebase.sign_in_provider).toBe('google.com');
      expect(decoded.firebase.sign_in_second_factor).toBe('phone');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('rejects tokens with mismatched audience or issuer', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'test-key-id-2';
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const jwksUrl = new URL(`http://127.0.0.1:${port}/jwks.json`);

    try {
      const verifier = createEdgeTokenVerifier({
        projectId: 'vmotiv-expected',
        jwksUrl,
      });

      const badAudienceToken = await new SignJWT({
        sub: 'user-456',
        email: 'user@vmotiv.in',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id-2' })
        .setIssuer('https://securetoken.google.com/vmotiv-expected')
        .setAudience('wrong-audience')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(verifier(badAudienceToken, false)).rejects.toThrow();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('falls back to fallbackVerifier when edge verification fails', async () => {
    const fallbackVerifier = vi.fn().mockResolvedValue({
      uid: 'fallback-uid',
      email: 'fallback@vmotiv.in',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    } as any);

    const verifier = createEdgeTokenVerifier({
      projectId: 'vmotiv-test',
      fallbackVerifier,
    });

    const result = await verifier('invalid-token', true);
    expect(fallbackVerifier).toHaveBeenCalledWith('invalid-token', true);
    expect(result.uid).toBe('fallback-uid');
  });
});
