import type { User } from 'firebase/auth';
import type {
  AdminActor,
  ApprovalPage,
  AuditPage,
  Branch,
  BusinessBuyingPage,
  BusinessFinance,
  BusinessInventoryPage,
  BusinessSellingPage,
  CommunicationsOutboxPage,
  CommunicationsTemplate,
  Dashboard,
  EmployeePage,
  ExportJob,
  ExportJobPage,
  ManagedBranch,
  MasterDataItem,
  PolicyVersion,
  PrivacyRequest,
  PrivacyRequestPage,
  Role,
  ServiceArea,
  SupportCasePage,
  SystemHealth,
} from './types.js';

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE || '').trim();
  const raw = (env || 'http://localhost:4100/api/v2')
    .replace('https://vmotiv.in', 'https://api.vmotiv.in')
    .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
    .replace(/\/$/, '');
  if (raw.endsWith('/api/v2') || raw.endsWith('/api/v1')) {
    return raw;
  }
  return `${raw}/api/v2`;
}
const base = resolveApiBase();
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
  deleteServiceArea: (user: User, id: string) => call<{ success: boolean }>(user, `/admin/service-areas/${id}`, { method: 'DELETE' }),
  supportCases: (user: User, page = 1, status?: string, search?: string) => call<SupportCasePage>(user, `/admin/support/cases?${new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}), ...(search ? { search } : {}) })}`),
  updateSupportCase: (user: User, id: string, status: string, note?: string) => call(user, `/admin/support/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status, ...(note ? { note } : {}) }) }),
  replySupportCase: (user: User, id: string, body: string) => call(user, `/admin/support/cases/${id}/replies`, { method: 'POST', body: JSON.stringify({ body }) }),
  systemHealth: (user: User) => call<SystemHealth>(user, '/admin/system-health'),
  policies: (user: User) => call<PolicyVersion[]>(user, '/admin/policies'),
  proposePolicy: (user: User, input: { key: string; title: string; content: Record<string, unknown>; effectiveAt?: string; reason: string }) => call<{ id: string; status: string }>(user, '/admin/policies/proposals', { method: 'POST', body: JSON.stringify(input) }),
  employees: (user: User, params: URLSearchParams) => call<EmployeePage>(user, `/admin/employees?${params}`),
  invite: (user: User, input: { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number }) => call(user, '/admin/invitations', { method: 'POST', body: JSON.stringify(input) }),
  proposePrivilegedInvitation: (user: User, input: { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number; reason: string }) => call(user, '/admin/approvals/privileged-invitations', { method: 'POST', body: JSON.stringify(input) }),
  approvals: (user: User, page = 1, status?: string) => call<ApprovalPage>(user, `/admin/approvals?${new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}) })}`),
  decideApproval: (user: User, id: string, input: { version: number; decision: 'APPROVE' | 'REJECT'; reason: string }) => call(user, `/admin/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify(input) }),
  status: (user: User, id: string, status: string, reason: string) => call<void>(user, `/admin/employees/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  audit: (user: User, page = 1) => call<AuditPage>(user, `/admin/audit?page=${page}&limit=25`),
  acceptInvitation: (user: User, token: string) => call<AdminActor>(user, '/staff/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),

  // Business oversight
  businessSelling: (user: User, page = 1, search?: string, status?: string) =>
    call<BusinessSellingPage>(user, `/admin/business/selling?${new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}), ...(status ? { status } : {}) })}`),
  businessBuying: (user: User, page = 1, search?: string) =>
    call<BusinessBuyingPage>(user, `/admin/business/buying?${new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}) })}`),
  businessInventory: (user: User, page = 1, search?: string, status?: string) =>
    call<BusinessInventoryPage>(user, `/admin/business/inventory?${new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}), ...(status ? { status } : {}) })}`),
  businessFinance: (user: User) => call<BusinessFinance>(user, '/admin/business/finance'),

  // Master data
  masterData: (user: User, category?: string) =>
    call<MasterDataItem[]>(user, `/admin/master-data${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  createMasterDataItem: (user: User, input: { category: string; code: string; name: string; parentCode?: string; metadata?: Record<string, unknown> }) =>
    call<MasterDataItem>(user, '/admin/master-data', { method: 'POST', body: JSON.stringify(input) }),
  updateMasterDataItem: (user: User, id: string, input: { name?: string; active?: boolean; metadata?: Record<string, unknown> }) =>
    call<MasterDataItem>(user, `/admin/master-data/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  // Communications & Email Delivery
  communicationsOutbox: (user: User, page = 1, state?: string) =>
    call<CommunicationsOutboxPage>(user, `/admin/communications/outbox?${new URLSearchParams({ page: String(page), limit: '25', ...(state ? { state } : {}) })}`),
  communicationsTemplates: (user: User) =>
    call<CommunicationsTemplate[]>(user, '/admin/communications/templates'),
  retryEmailOutbox: (user: User, id: string) =>
    call<{ id: string; state: string }>(user, `/admin/communications/outbox/${id}/retry`, { method: 'POST' }),

  // Notifications
  notifications: (user: User, page = 1) =>
    call<{ items: any[]; total: number; unreadCount: number }>(user, `/notifications?page=${page}&limit=20`),
  unreadNotificationsCount: (user: User) =>
    call<{ count: number }>(user, '/notifications/unread-count'),
  markNotificationRead: (user: User, id: string) =>
    call<{ success: boolean }>(user, `/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: (user: User) =>
    call<{ success: boolean }>(user, '/notifications/read-all', { method: 'POST' }),

  // Privacy Requests
  privacyRequests: (user: User, page = 1, status?: string) =>
    call<PrivacyRequestPage>(user, `/admin/support/privacy-requests?${new URLSearchParams({ page: String(page), limit: '25', ...(status ? { status } : {}) })}`),
  updatePrivacyRequest: (user: User, id: string, status: string, resolution?: string) =>
    call<PrivacyRequest>(user, `/admin/support/privacy-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status, ...(resolution ? { resolution } : {}) }) }),

  // Reports & Exports
  exportJobs: (user: User, page = 1) =>
    call<ExportJobPage>(user, `/admin/exports?page=${page}&limit=25`),
  createExportJob: (user: User, input: { resourceType: string; scope?: string; sensitive?: boolean; reason?: string }) =>
    call<ExportJob>(user, '/admin/exports', { method: 'POST', body: JSON.stringify(input) }),
  downloadExport: (user: User, id: string) =>
    call<{ fileContent: string; resourceType: string; format: string }>(user, `/admin/exports/${id}/download`),
};
