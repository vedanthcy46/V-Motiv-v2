import { describe, expect, it, vi } from 'vitest';
import { inspectorMfaGuard, isInspectorMfaEnforced } from '../src/inspector-mfa.js';

type Any = any;
const run = (env: Record<string, string>, path: string, secondFactor: boolean) => {
  const next = vi.fn();
  inspectorMfaGuard(env as NodeJS.ProcessEnv)({ path } as Any, { locals: { identity: { uid: 'u', email: 'e', secondFactor } } } as Any, next);
  return next.mock.calls[0]?.[0] as { status?: number; code?: string } | undefined;
};

describe('inspector MFA guard', () => {
  it('is opt-in via ENFORCE_INSPECTOR_MFA=true', () => {
    expect(isInspectorMfaEnforced({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isInspectorMfaEnforced({ ENFORCE_INSPECTOR_MFA: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('lets everything through when not enforced', () => {
    expect(run({}, '/assignments', false)).toBeUndefined();
  });

  it('blocks inspector endpoints without a second-factor session, but keeps /me open for enrolment', () => {
    const env = { ENFORCE_INSPECTOR_MFA: 'true' };
    expect(run(env, '/assignments', false)).toMatchObject({ status: 403, code: 'INSPECTOR_MFA_REQUIRED' });
    expect(run(env, '/me', false)).toBeUndefined();
    expect(run(env, '/assignments', true)).toBeUndefined();
  });
});
