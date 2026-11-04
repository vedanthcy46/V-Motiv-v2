// Why an employee can or cannot be assigned an inspection. Used by the assign endpoint (to say
// exactly what is wrong) so the error is actionable instead of a bare "not eligible".

export interface InspectorCandidate {
  userStatus: string;
  active: boolean;
  status: string;
  roleKeys: string[];
  branchIds: string[];
}

export type InspectorIneligibility =
  | 'INSPECTOR_NOT_FOUND'
  | 'INSPECTOR_ACCOUNT_NOT_ACTIVE'
  | 'INSPECTOR_EMPLOYMENT_NOT_ACTIVE'
  | 'INSPECTOR_ROLE_MISSING'
  | 'INSPECTOR_NOT_IN_REQUEST_BRANCH';

export const INSPECTOR_INELIGIBILITY_MESSAGES: Record<InspectorIneligibility, string> = {
  INSPECTOR_NOT_FOUND: 'The selected person is not an employee.',
  INSPECTOR_ACCOUNT_NOT_ACTIVE: 'The inspector\'s account is not active.',
  INSPECTOR_EMPLOYMENT_NOT_ACTIVE: 'The inspector\'s employee record is not active.',
  INSPECTOR_ROLE_MISSING: 'The selected employee does not have the Inspector role.',
  INSPECTOR_NOT_IN_REQUEST_BRANCH: 'The inspector is not assigned to the branch of this inspection request. Assign them to that branch in the Admin portal, or pick an inspector from that branch.',
};

export function inspectorIneligibility(
  candidate: InspectorCandidate | null | undefined,
  requestBranchId: string | null | undefined,
): InspectorIneligibility | null {
  if (!candidate) return 'INSPECTOR_NOT_FOUND';
  if (candidate.userStatus !== 'ACTIVE') return 'INSPECTOR_ACCOUNT_NOT_ACTIVE';
  if (!candidate.active || candidate.status !== 'ACTIVE') return 'INSPECTOR_EMPLOYMENT_NOT_ACTIVE';
  if (!candidate.roleKeys.includes('INSPECTOR')) return 'INSPECTOR_ROLE_MISSING';
  if (requestBranchId && !candidate.branchIds.includes(requestBranchId)) return 'INSPECTOR_NOT_IN_REQUEST_BRANCH';
  return null;
}
