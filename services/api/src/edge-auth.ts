import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { VerifyToken } from './auth.js';

export const GOOGLE_FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

export interface EdgeTokenVerifierOptions {
  projectId: string;
  jwksUrl?: URL;
  fallbackVerifier?: VerifyToken;
}

/**
 * Creates an edge-compatible Firebase ID token verifier using standard WebCrypto APIs (via jose).
 * This operates natively inside Cloudflare Workers, V8 isolates, and browser-like runtimes
 * without requiring Node.js internal HTTP/networking agents.
 */
export function createEdgeTokenVerifier(options: EdgeTokenVerifierOptions): VerifyToken {
  const { projectId, jwksUrl = GOOGLE_FIREBASE_JWKS_URL, fallbackVerifier } = options;
  const jwks = createRemoteJWKSet(jwksUrl, {
    cacheMaxAge: 600_000, // 10 minutes cache
    cooldownDuration: 30_000, // 30 seconds cooldown
    timeoutDuration: 5_000, // 5 seconds timeout
  });

  return async (token: string, revoked = false): Promise<DecodedIdToken> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      });

      const uid = (payload.sub || payload.user_id) as string;
      const firebaseClaims = (payload.firebase || {}) as Record<string, any>;

      let signInProvider = firebaseClaims.sign_in_provider;
      if (!signInProvider && firebaseClaims.identities) {
        if (firebaseClaims.identities['google.com']) {
          signInProvider = 'google.com';
        } else {
          signInProvider = Object.keys(firebaseClaims.identities)[0] || 'google.com';
        }
      }
      if (!signInProvider) {
        signInProvider = 'google.com';
      }

      return {
        ...payload,
        uid,
        sub: uid,
        email: payload.email as string,
        email_verified: Boolean(payload.email_verified),
        name: typeof payload.name === 'string' ? payload.name : undefined,
        picture: typeof payload.picture === 'string' ? payload.picture : undefined,
        iss: payload.iss as string,
        aud: payload.aud as string,
        auth_time: (payload.auth_time || payload.iat || 0) as number,
        iat: (payload.iat || 0) as number,
        exp: (payload.exp || 0) as number,
        firebase: {
          identities: firebaseClaims.identities || {},
          sign_in_provider: signInProvider,
          sign_in_second_factor: firebaseClaims.sign_in_second_factor,
          second_factor_identifier: firebaseClaims.second_factor_identifier,
          tenant: firebaseClaims.tenant,
        },
      } as DecodedIdToken;
    } catch (edgeErr) {
      if (fallbackVerifier) {
        try {
          return await fallbackVerifier(token, revoked);
        } catch {
          // Fallback failed, continue to throw original edge error
        }
      }
      throw edgeErr;
    }
  };
}
