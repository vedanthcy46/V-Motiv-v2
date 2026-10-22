import type { DecodedIdToken } from 'firebase-admin/auth';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

export type Identity = { uid: string; email: string; name?: string; secondFactor: boolean };
export type VerifyToken = (token: string, checkRevoked: boolean) => Promise<DecodedIdToken>;
export function authentication(verify: VerifyToken): RequestHandler {
  return async (req, res, next) => {
    try {
      const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
      if (!match?.[1]) throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
      const rawToken = match[1];

      let token: DecodedIdToken;
      try { token = await verify(rawToken, true); }
      catch { throw new HttpError(401, 'INVALID_OR_REVOKED_TOKEN'); }
      if (token.firebase.sign_in_provider !== 'google.com' || !token.email_verified || !token.email || !token.uid) {
        throw new HttpError(401, 'VERIFIED_GOOGLE_IDENTITY_REQUIRED');
      }
      res.locals.identity = {
        uid: token.uid, email: token.email,
        name: typeof token.name === 'string' ? token.name.slice(0, 120) : undefined,
        secondFactor: Boolean(token.firebase.sign_in_second_factor),
      } satisfies Identity;
      next();
    } catch (error) { next(error); }
  };
}

/** Verifies a supplied token but deliberately permits requests without one for public resources. */
export function optionalAuthentication(verify: VerifyToken): RequestHandler {
  return async (req, res, next) => {
    if (!req.headers.authorization) return next();
    return authentication(verify)(req, res, next);
  };
}

