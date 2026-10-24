import type { User } from 'firebase/auth';
import type { AdminActor, ApprovalPage, AuditPage, Branch, Dashboard, EmployeePage, ManagedBranch, Role, ServiceArea, SupportCasePage, SystemHealth, PolicyVersion } from './types.js';

const base = (import.meta.env.VITE_API_BASE || '/api/v2').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function call<T>(user: User, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await user.getIdToken(!retry);
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (response.status === 401 && retry) {
    await user.getIdToken(true);
    return call(user, path, init, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ code: 'REQUEST_FAILED' })) as { code?: string };
    throw new ApiError(response.status, payload.code || 'REQUEST_FAILED');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  me: (user: User) => call<AdminActor>(user, '/admin/me'),
  dashboard: (user: User) => call<Dashboard>(user, '/admin/dashboard'),
  roles: (user: User) => call<Role[]>(user, '/admin/roles'),
  branches: (user: User) => call<Branch[]>(user, '/admin/branches'),
  managedBranches: (user: User) => call<ManagedBranch[]>(user, '/admin/branches/manage'),
  createBranch: (user: User, input: { code: string; name: string; city: string; address?: string }) => call<ManagedBranch>(user, '/admin/branches', { method: 'POST', body: JSON.stringify(input) }),
  updateBranch: (user: User, id: string, input: { name?: string; city?: string; address?: string | null; active?: boolean }) => call<ManagedBranch>(user, `/admin/branches/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  serviceAreas: (user: User) => call<ServiceArea[]>(user, '/admin/service-areas'),
  createServiceArea: (user: User, name: string) => call<ServiceArea>(user, '/admin/service-areas', { method: 'POST', body: JSON.stringify({ name }) }),
  updateServiceArea: (user: User, id: string, active: boolean) => call<ServiceArea>(user, `/admin/service-areas/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  supportCases: (user: User, page = 1, status?: string) => call<SupportCasePage>(user, `/admin/support/cases?${new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}) })}`),
  updateSupportCase: (user: User, id: string, status: string, note?: string) => call(user, `/admin/support/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status, ...(note ? { note } : {}) }) }),
  replySupportCase: (user: User, id: string, body: string) => call(user, `/admin/support/cases/${id}/replies`, { method: 'POST', body: JSON.stringify({ body }) }),
  systemHealth: (user: User) => call<SystemHealth>(user, '/admin/system-health'),
  policies: (user: User) => call<PolicyVersion[]>(user, '/admin/policies'),
  employees: (user: User, params: URLSearchParams) => call<EmployeePage>(user, `/admin/employees?${params}`),
  invite: (user: User, input: { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number }) => call(user, '/admin/invitations', { method: 'POST', body: JSON.stringify(input) }),
  proposePrivilegedInvitation: (user: User, input: { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number; reason: string }) => call(user, '/admin/approvals/privileged-invitations', { method: 'POST', body: JSON.stringify(input) }),
  approvals: (user: User, page = 1, status?: string) => call<ApprovalPage>(user, `/admin/approvals?${new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}) })}`),
  decideApproval: (user: User, id: string, input: { version: number; decision: 'APPROVE' | 'REJECT'; reason: string }) => call(user, `/admin/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify(input) }),
  status: (user: User, id: string, status: string, reason: string) => call<void>(user, `/admin/employees/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  audit: (user: User, page = 1) => call<AuditPage>(user, `/admin/audit?page=${page}&limit=25`),
  acceptInvitation: (user: User, token: string) => call<AdminActor>(user, '/staff/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
};
