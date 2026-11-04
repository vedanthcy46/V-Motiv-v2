import { describe, expect, it } from 'vitest';
import { inspectorIneligibility, type InspectorCandidate } from '../src/inspector-eligibility.js';

const ok: InspectorCandidate = { userStatus: 'ACTIVE', active: true, status: 'ACTIVE', roleKeys: ['EMPLOYEE', 'INSPECTOR'], branchIds: ['b-blr'] };

describe('inspectorIneligibility', () => {
  it('accepts an active inspector in the request branch', () => {
    expect(inspectorIneligibility(ok, 'b-blr')).toBeNull();
    expect(inspectorIneligibility(ok, null)).toBeNull();
  });

  it('names the exact reason instead of a bare "not eligible"', () => {
    expect(inspectorIneligibility(null, 'b-blr')).toBe('INSPECTOR_NOT_FOUND');
    expect(inspectorIneligibility({ ...ok, userStatus: 'SUSPENDED' }, 'b-blr')).toBe('INSPECTOR_ACCOUNT_NOT_ACTIVE');
    expect(inspectorIneligibility({ ...ok, active: false }, 'b-blr')).toBe('INSPECTOR_EMPLOYMENT_NOT_ACTIVE');
    expect(inspectorIneligibility({ ...ok, roleKeys: ['EMPLOYEE'] }, 'b-blr')).toBe('INSPECTOR_ROLE_MISSING');
    expect(inspectorIneligibility(ok, 'b-mum')).toBe('INSPECTOR_NOT_IN_REQUEST_BRANCH');
  });
});
