import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors.js';
import type { Identity } from './auth.js';

/**
 * Inspectors sign in on a phone and handle sensitive customer data and vehicle documents, so (like the
 * other portals) their session must carry a second factor. Enabled with ENFORCE_INSPECTOR_MFA=true once
 * the inspector app release that enrols a phone factor on first login is in use.
 */
export function isInspectorMfaEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENFORCE_INSPECTOR_MFA === 'true';
}

/** Express guard: requires a second-factor session for every inspector endpoint except /me (so the app can detect the role and start enrolment). */
export function inspectorMfaGuard(env: NodeJS.ProcessEnv = process.env) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isInspectorMfaEnforced(env) || req.path === '/me') return next();
    const identity = res.locals.identity as Identity | undefined;
    if (!identity?.secondFactor) return next(new HttpError(403, 'INSPECTOR_MFA_REQUIRED'));
    return next();
  };
}
