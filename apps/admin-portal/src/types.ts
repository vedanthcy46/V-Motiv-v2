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

export type BusinessSellingItem = {
  id: string;
  referenceCode: string;
  sellerName: string;
  sellerPhone: string;
  city: string;
  make: string;
  model: string;
  year: number;
  status: string;
  createdAt: string;
  user?: { email: string; displayName: string | null; phone: string | null } | null;
  offers?: Array<{ id: string; offerAmountPaise: string | number; status: string; createdAt: string }>;
};
export type BusinessSellingPage = {
  page: number;
  limit: number;
  total: number;
  counts: Record<string, number>;
  items: BusinessSellingItem[];
};

export type BusinessBuyingPage = {
  testDrives: {
    total: number;
    items: Array<{
      id: string;
      status: string;
      scheduledAt: string;
      slot: string;
      type: string;
      address?: string | null;
      createdAt: string;
      user: { email: string; displayName: string | null };
      listing: { title: string; vehicle: { make: string; model: string; manufacturingYear: number } };
    }>;
  };
  purchaseEnquiries: {
    total: number;
    items: Array<{
      id: string;
      status: string;
      enquiryType: string;
      message?: string | null;
      createdAt: string;
      user: { email: string; displayName: string | null };
      listing: { title: string; vehicle: { make: string; model: string } };
    }>;
  };
};

export type BusinessInventoryItem = {
  id: string;
  title: string;
  pricePaise: string | number;
  status: string;
  publishedAt?: string | null;
  createdAt: string;
  vehicle: {
    make: string;
    model: string;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    mileageKm: number;
    registrationState: string;
  };
  media: Array<{ url: string; displayOrder: number }>;
  _count: { testDriveRequests: number; purchaseEnquiries: number; wishlist: number };
};
export type BusinessInventoryPage = {
  page: number;
  limit: number;
  total: number;
  counts: Record<string, number>;
  items: BusinessInventoryItem[];
};

export type BusinessFinance = {
  activeInventoryCount: number;
  activeInventoryValueRupees: number;
  totalAcquisitionLeads: number;
  totalOffersIssued: number;
  totalOffersValueRupees: number;
  pendingSettlements: number;
  reconciliationStatus: string;
};

export type MasterDataItem = {
  id: string;
  category: string;
  code: string;
  name: string;
  parentCode?: string | null;
  active: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationsOutboxItem = {
  id: string;
  eventKey: string;
  recipient: string;
  subject: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  lastErrorCode?: string | null;
  availableAt: string;
  createdAt: string;
  sentAt?: string | null;
};
export type CommunicationsOutboxPage = {
  page: number;
  limit: number;
  total: number;
  summary: Record<string, number>;
  items: CommunicationsOutboxItem[];
};

export type CommunicationsTemplate = {
  key: string;
  name: string;
  type: string;
  description: string;
};

export type PrivacyRequest = {
  id: string;
  requestType: string;
  status: string;
  details?: string | null;
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  user: { email: string; displayName: string | null; phone?: string | null };
};
export type PrivacyRequestPage = {
  page: number;
  limit: number;
  total: number;
  items: PrivacyRequest[];
};

export type ExportJob = {
  id: string;
  resourceType: string;
  scope: string;
  format: string;
  sensitive: boolean;
  status: string;
  rowCount?: number | null;
  expiresAt?: string | null;
  downloadCount: number;
  createdAt: string;
  requester?: { user: { displayName: string | null; email: string } } | null;
};
export type ExportJobPage = {
  page: number;
  limit: number;
  total: number;
  items: ExportJob[];
};
