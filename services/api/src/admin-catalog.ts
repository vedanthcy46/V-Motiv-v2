import type { EmployeeRole, Prisma, PrismaClient } from '@prisma/client';
import { catalogMasterData } from './master-data-seed.js';
import { inferBodyType } from './body-types.js';

export const permissionCatalog = {
  'admin.portal.access': 'Enter the Admin Control Centre.',
  'employee.read': 'View employee and invitation records.',
  'employee.invite': 'Invite employees into approved roles and branches.',
  'employee.update': 'Update permitted employee profile fields.',
  'employee.suspend': 'Suspend and reactivate non-privileged employees.',
  'employee.deactivate': 'Permanently deactivate employee access.',
  'role.read': 'View roles, permissions and effective access.',
  'role.assign': 'Assign non-privileged application roles.',
  'role.assign.privileged': 'Propose or assign privileged governance roles.',
  'role.manage': 'Manage role definitions through controlled workflows.',
  'branch.read': 'View branches and employee branch scope.',
  'branch.manage': 'Manage branch and service-area configuration.',
  'approval.read': 'View eligible governance approval requests.',
  'approval.decide': 'Decide eligible governance approvals.',
  'support.read': 'View support cases within assigned scope.',
  'support.assign': 'Assign support case ownership.',
  'support.respond': 'Respond to support cases.',
  'support.escalate': 'Escalate support cases.',
  'audit.read': 'Read authorized immutable audit events.',
  'audit.export': 'Request an authorized audit export.',
  'export.create': 'Create low-risk operational exports.',
  'export.sensitive.approve': 'Independently approve sensitive exports.',
  'email.delivery.read': 'View email delivery and outbox status.',
  'email.template.manage': 'Manage controlled email template versions.',
  'policy.read': 'View business policy versions.',
  'policy.propose': 'Propose a new business policy version.',
  'policy.approve': 'Independently approve business policy changes.',
  'system.health.read': 'View safe system and integration diagnostics.',
  'business.oversight.read': 'View cross-portal selling, buying, inventory, and finance summaries.',
  'masterdata.read': 'View reference vehicle and document master data.',
  'masterdata.manage': 'Manage canonical vehicle and document reference data.',
  'privacy.request.manage': 'Manage customer privacy and account data requests.',
  'inspection.assignment.read_own': 'Read assignments belonging to the current inspector.',
  'inspection.assignment.read_branch': 'Read inspections within an authorized branch.',
  'inspection.assignment.assign': 'Assign and reschedule inspections in an authorized branch.',
  'inspection.start': 'Start an assigned physical inspection.',
  'inspection.answer.write': 'Create and update draft checklist answers.',
  'inspection.defect.write': 'Create and update draft defect records.',
  'inspection.media.capture': 'Capture authorized private inspection evidence.',
  'inspection.media.upload': 'Upload authorized private inspection evidence.',
  'inspection.report.submit': 'Submit an owned inspection report for review.',
  'inspection.report.read_own': 'Read an inspector’s own reports.',
  'inspection.report.revise': 'Revise a report returned for correction.',
  'inspection.review.queue.read': 'Read the independent inspection review queue.',
  'inspection.review.report.read': 'Read inspection evidence as an independent reviewer.',
  'inspection.review.approve': 'Approve an independently authored inspection report.',
  'inspection.review.request_correction': 'Return a report for documented correction.',
  'inspection.review.reject': 'Reject a report with a documented reason.',
  'inspection.template.read': 'Read approved inspection templates.',
  'inspection.template.manage': 'Manage controlled inspection template versions.',
  'finance.portal.access': 'Enter the Finance Control Centre.',
  'finance.settlement.read': 'Read branch-scoped seller settlement cases and masked financial instructions.',
  'finance.settlement.prepare': 'Prepare seller payout instructions from verified acquisition settlements.',
  'finance.payout.approve': 'Independently approve seller payout instructions.',
  'finance.payout.execute': 'Record a controlled manual payout execution reference.',
  'finance.payout.verify': 'Independently record financial evidence and verify a payout.',
  'finance.audit.read': 'Read authorized finance workflow audit events.',
} as const;

export type PermissionKey = keyof typeof permissionCatalog;

type RoleDefinition = {
  name: string;
  description: string;
  privileged: boolean;
  permissions: PermissionKey[];
};

const allGovernancePermissions = Object.keys(permissionCatalog) as PermissionKey[];

export const roleCatalog: Record<EmployeeRole, RoleDefinition> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Platform governance and privileged access oversight. This role does not grant finance, pricing, inspection, or inventory transaction authority.',
    privileged: true,
    permissions: allGovernancePermissions,
  },
  ADMIN: {
    name: 'Administrator', description: 'Routine employee onboarding, configuration, support and business oversight.', privileged: true,
    permissions: ['admin.portal.access', 'employee.read', 'employee.invite', 'employee.update', 'employee.suspend', 'role.read', 'role.assign', 'branch.read', 'branch.manage', 'approval.read', 'support.read', 'support.assign', 'support.respond', 'support.escalate', 'audit.read', 'export.create', 'email.delivery.read', 'policy.read', 'policy.propose', 'system.health.read', 'business.oversight.read', 'masterdata.read', 'masterdata.manage', 'privacy.request.manage'],
  },
  SECURITY_ADMIN: {
    name: 'Security Administrator', description: 'Identity security, access review and security incident oversight.', privileged: true,
    permissions: ['admin.portal.access', 'employee.read', 'employee.suspend', 'role.read', 'role.assign.privileged', 'approval.read', 'approval.decide', 'audit.read', 'audit.export', 'system.health.read'],
  },
  SUPPORT_ADMIN: {
    name: 'Support Administrator', description: 'Customer support governance and escalations.', privileged: false,
    permissions: ['admin.portal.access', 'employee.read', 'branch.read', 'support.read', 'support.assign', 'support.respond', 'support.escalate', 'privacy.request.manage', 'audit.read'],
  },
  AUDIT_VIEWER: {
    name: 'Audit Viewer', description: 'Read-only compliance and audit access.', privileged: true,
    permissions: ['admin.portal.access', 'employee.read', 'role.read', 'branch.read', 'approval.read', 'audit.read', 'system.health.read', 'business.oversight.read'],
  },
  SALES_EXECUTIVE: { name: 'Sales Executive', description: 'Customer sales and acquisition workflows.', privileged: false, permissions: [] },
  INSPECTOR: { name: 'Inspector', description: 'Assigned vehicle inspection execution.', privileged: false, permissions: ['inspection.assignment.read_own', 'inspection.start', 'inspection.answer.write', 'inspection.defect.write', 'inspection.media.capture', 'inspection.media.upload', 'inspection.report.submit', 'inspection.report.read_own', 'inspection.report.revise', 'inspection.template.read'] },
  INSPECTION_REVIEWER: { name: 'Inspection Reviewer', description: 'Independent inspection review.', privileged: false, permissions: ['inspection.assignment.read_branch', 'inspection.review.queue.read', 'inspection.review.report.read', 'inspection.review.approve', 'inspection.review.request_correction', 'inspection.review.reject', 'inspection.template.read'] },
  OPERATIONS_MANAGER: { name: 'Operations Manager', description: 'Vehicle operations and assignments.', privileged: false, permissions: ['inspection.assignment.read_branch', 'inspection.assignment.assign', 'inspection.template.read'] },
  INVENTORY_MANAGER: { name: 'Inventory Manager', description: 'Vehicle custody and inventory workflow.', privileged: false, permissions: [] },
  LISTING_EXECUTIVE: { name: 'Listing Executive', description: 'Listing preparation and publication workflow.', privileged: false, permissions: [] },
  PRICING_APPROVER: { name: 'Pricing Approver', description: 'Independent acquisition and retail pricing authority.', privileged: true, permissions: [] },
  FINANCE: { name: 'Finance Executive', description: 'Prepares and reads branch-scoped financial settlement work. Approval, execution, and verification are separately granted permissions.', privileged: true, permissions: ['finance.portal.access', 'finance.settlement.read', 'finance.settlement.prepare', 'finance.audit.read'] },
  SERVICE_ADVISOR: { name: 'Service Advisor', description: 'Customer consultation, service intake, estimate generation and delivery coordination.', privileged: false, permissions: [] },
  SERVICE_DISPATCH: { name: 'Service Dispatch', description: 'Logistics coordination and pickup/return driver dispatch.', privileged: false, permissions: [] },
  PICKUP_DRIVER: { name: 'Pickup & Return Driver', description: 'Vehicle pickup, transit custody and customer return delivery.', privileged: false, permissions: [] },
  HUB_MANAGER: { name: 'Service Hub Manager', description: 'Service hub operations, capacity and multi-bay workflow management.', privileged: true, permissions: [] },
  TECHNICIAN: { name: 'Service Technician', description: 'Vehicle diagnosis, mechanical/electrical repairs and work order execution.', privileged: false, permissions: [] },
  SERVICE_QC: { name: 'Service Quality Control Inspector', description: 'Independent post-service road testing, safety verification and sign-off.', privileged: true, permissions: [] },
  SERVICE_MANAGER: { name: 'Service Operations Manager', description: 'Overall automotive service operations and workflow governance.', privileged: true, permissions: [] },
  RENTAL_MANAGER: { name: 'Rental Operations Manager', description: 'Advance car rental fleet, reservations, pricing and operations oversight.', privileged: true, permissions: [] },
  RENTAL_DISPATCH: { name: 'Rental Dispatch Officer', description: 'Pickup handover custody, driver license verification, and return inspection.', privileged: false, permissions: [] },
  RENTAL_FLEET_OFFICER: { name: 'Rental Fleet Officer', description: 'Fleet maintenance scheduling, turnaround buffers, and vehicle compliance management.', privileged: false, permissions: [] },
};

type CatalogClient = Pick<PrismaClient, 'permission' | 'role' | 'rolePermission'> | Prisma.TransactionClient;

export async function ensureAdminCatalog(db: CatalogClient) {
  const permissions = new Map<PermissionKey, string>();
  for (const [key, description] of Object.entries(permissionCatalog) as [PermissionKey, string][]) {
    const permission = await db.permission.upsert({
      where: { key }, update: { description }, create: { key, description }, select: { id: true },
    });
    permissions.set(key, permission.id);
  }

  for (const [key, definition] of Object.entries(roleCatalog) as [EmployeeRole, RoleDefinition][]) {
    const role = await db.role.upsert({
      where: { key },
      update: { name: definition.name, description: definition.description, privileged: definition.privileged },
      create: { key, name: definition.name, description: definition.description, privileged: definition.privileged },
      select: { id: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (definition.permissions.length) {
      await db.rolePermission.createMany({
        data: definition.permissions.map(permission => ({ roleId: role.id, permissionId: permissions.get(permission)! })),
        skipDuplicates: true,
      });
    }
  }
}

const baseMasterData = [
  // Vehicle Makes
  { category: 'MAKE', code: 'MARUTI_SUZUKI', name: 'Maruti Suzuki', parentCode: null },
  { category: 'MAKE', code: 'HYUNDAI', name: 'Hyundai', parentCode: null },
  { category: 'MAKE', code: 'TATA', name: 'Tata', parentCode: null },
  { category: 'MAKE', code: 'MAHINDRA', name: 'Mahindra', parentCode: null },
  { category: 'MAKE', code: 'HONDA', name: 'Honda', parentCode: null },
  { category: 'MAKE', code: 'TOYOTA', name: 'Toyota', parentCode: null },
  { category: 'MAKE', code: 'KIA', name: 'Kia', parentCode: null },
  { category: 'MAKE', code: 'VOLKSWAGEN', name: 'Volkswagen', parentCode: null },
  { category: 'MAKE', code: 'SKODA', name: 'Skoda', parentCode: null },
  // Body Types
  { category: 'BODY_TYPE', code: 'HATCHBACK', name: 'Hatchback', parentCode: null },
  { category: 'BODY_TYPE', code: 'SEDAN', name: 'Sedan', parentCode: null },
  { category: 'BODY_TYPE', code: 'SUV', name: 'SUV', parentCode: null },
  { category: 'BODY_TYPE', code: 'MUV', name: 'MUV', parentCode: null },
  { category: 'BODY_TYPE', code: 'COUPE', name: 'Coupe', parentCode: null },
  { category: 'BODY_TYPE', code: 'CONVERTIBLE', name: 'Convertible', parentCode: null },
  // Fuel Types
  { category: 'FUEL_TYPE', code: 'PETROL', name: 'Petrol', parentCode: null },
  { category: 'FUEL_TYPE', code: 'DIESEL', name: 'Diesel', parentCode: null },
  { category: 'FUEL_TYPE', code: 'CNG', name: 'CNG', parentCode: null },
  { category: 'FUEL_TYPE', code: 'ELECTRIC', name: 'Electric', parentCode: null },
  { category: 'FUEL_TYPE', code: 'HYBRID', name: 'Hybrid', parentCode: null },
  // Transmission Types
  { category: 'TRANSMISSION', code: 'MANUAL', name: 'Manual', parentCode: null },
  { category: 'TRANSMISSION', code: 'AUTOMATIC', name: 'Automatic', parentCode: null },
  { category: 'TRANSMISSION', code: 'AMT', name: 'AMT', parentCode: null },
  { category: 'TRANSMISSION', code: 'CVT', name: 'CVT', parentCode: null },
  { category: 'TRANSMISSION', code: 'DCT', name: 'DCT', parentCode: null },
  // Document Categories
  { category: 'DOCUMENT_TYPE', code: 'RC_COPY', name: 'Registration Certificate (RC)', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'INSURANCE_POLICY', name: 'Insurance Policy', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'POLLUTION_CERTIFICATE', name: 'Pollution Under Control (PUC)', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'INVOICE', name: 'Original Purchase Invoice', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'SERVICE_BOOK', name: 'Service Record Book', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'FORM_29_30', name: 'RTO Transfer Forms (29 & 30)', parentCode: null },
  { category: 'DOCUMENT_TYPE', code: 'ID_PROOF', name: 'Government ID Proof', parentCode: null },
];

/** Everything the platform starts with: the app's former built-in catalogue plus body types, extra transmissions and document types. */
export const canonicalMasterData: Array<{ category: string; code: string; name: string; parentCode: string | null; metadata?: Record<string, unknown> }> = (() => {
  const seen = new Set<string>();
  const makeNames = new Map(catalogMasterData.filter(item => item.category === 'MAKE').map(item => [item.code, item.name]));
  // Every car model starts with its body type, so Admin shows it and administrators can change it.
  const withBodyType = (item: (typeof catalogMasterData)[number]) => {
    if (item.category !== 'MODEL') return item;
    const bodyType = inferBodyType(makeNames.get(item.parentCode ?? ''), item.name);
    return bodyType ? { ...item, metadata: { ...(item.metadata ?? {}), bodyType } } : item;
  };
  return [...catalogMasterData.map(withBodyType), ...baseMasterData].filter(item => {
    const key = `${item.category}:${item.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})();

/**
 * Creates any missing standard items. Existing rows are never touched, so renames, deactivations and
 * metadata an administrator has set are preserved when the seed is re-run.
 */
export async function ensureMasterDataCatalog(db: PrismaClient | Prisma.TransactionClient) {
  for (const item of canonicalMasterData) {
    await (db as any).masterDataItem.upsert({
      where: { category_code: { category: item.category, code: item.code } },
      update: {},
      create: { category: item.category, code: item.code, name: item.name, parentCode: item.parentCode, metadata: item.metadata ?? {} },
    });
  }
}
