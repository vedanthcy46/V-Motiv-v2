export type Branch = { id: string; code: string; name: string; city: string; address?: string | null; active?: boolean };
export type ManagedBranch = Branch & { active: boolean; createdAt: string; _count: { employees: number; invitations: number } };
export type ServiceArea = { id: string; name: string; active: boolean; createdAt: string };
export type Permission = { key: string; description: string };
export type Role = { id: string; key: string; name: string; description: string; privileged: boolean; permissions: Array<{ permission: Permission }> };
export type AdminActor = {
  userId: string; firebaseUid: string; email: string; displayName: string | null; employeeCode: string | null;
  designation: string | null; status: string; mfaStatus: string; roles: string[]; permissions: string[]; branches: Branch[];
};
export type Dashboard = {
  employees: { active: number; suspended: number; deactivated: number; invited: number };
  pendingAdministrativeTasks: number;
  approvals?: number; supportCases?: number;
  recentOwnActions: Array<{ id: string; action: string; entityType: string; entityId: string; outcome: string; createdAt: string }>;
  generatedAt: string;
};
export type EmployeePage = { page: number; limit: number; total: number; items: AdminActor[] };
export type AuditPage = { page: number; limit: number; total: number; items: Array<{ id: string; actorId: string | null; action: string; entityType: string; entityId: string; outcome: string; details: unknown; createdAt: string }> };
export type Approval = {
  id: string; requestType: string; status: string; version: number; expiresAt: string; createdAt: string; executedAt?: string | null;
  payload: { email?: string; fullName?: string; designation?: string; reason?: string; roleId?: string; branchIds?: string[] };
  requester: { user: { displayName: string | null; email: string } };
  decision?: { decision: string; reason: string; createdAt: string; actor: { user: { displayName: string | null; email: string } } } | null;
};
export type ApprovalPage = { page: number; limit: number; total: number; items: Approval[] };
export type SupportCase = { id: string; referenceCode: string; subject: string; category: string; description: string; status: string; createdAt: string; updatedAt: string; user: { email: string; displayName: string | null; preferredCity: string | null }; replies: Array<{ id: string; authorType: string; body: string; createdAt: string }> };
export type SupportCasePage = { page: number; limit: number; total: number; items: SupportCase[] };
export type SystemHealth = { checkedAt: string; services: Array<{ key: string; status: string; detail: string }>; emailOutbox: Record<string, number> };
export type PolicyVersion = { id: string; key: string; version: number; title: string; status: string; effectiveAt: string | null; createdAt: string; createdBy: { email: string; displayName: string | null } };
