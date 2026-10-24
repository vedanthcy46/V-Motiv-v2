import type { EmployeeRole, Prisma, PrismaClient } from '@prisma/client';

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
    permissions: ['admin.portal.access', 'employee.read', 'employee.invite', 'employee.update', 'employee.suspend', 'role.read', 'role.assign', 'branch.read', 'branch.manage', 'approval.read', 'support.read', 'support.assign', 'support.respond', 'support.escalate', 'audit.read', 'export.create', 'email.delivery.read', 'policy.read', 'policy.propose', 'system.health.read'],
  },
  SECURITY_ADMIN: {
    name: 'Security Administrator', description: 'Identity security, access review and security incident oversight.', privileged: true,
    permissions: ['admin.portal.access', 'employee.read', 'employee.suspend', 'role.read', 'role.assign.privileged', 'approval.read', 'approval.decide', 'audit.read', 'audit.export', 'system.health.read'],
  },
  SUPPORT_ADMIN: {
    name: 'Support Administrator', description: 'Customer support governance and escalations.', privileged: false,
    permissions: ['admin.portal.access', 'employee.read', 'branch.read', 'support.read', 'support.assign', 'support.respond', 'support.escalate', 'audit.read'],
  },
  AUDIT_VIEWER: {
    name: 'Audit Viewer', description: 'Read-only compliance and audit access.', privileged: true,
    permissions: ['admin.portal.access', 'employee.read', 'role.read', 'branch.read', 'approval.read', 'audit.read', 'system.health.read'],
  },
  SALES_EXECUTIVE: { name: 'Sales Executive', description: 'Customer sales and acquisition workflows.', privileged: false, permissions: [] },
  INSPECTOR: { name: 'Inspector', description: 'Assigned vehicle inspection execution.', privileged: false, permissions: [] },
  INSPECTION_REVIEWER: { name: 'Inspection Reviewer', description: 'Independent inspection review.', privileged: false, permissions: [] },
  OPERATIONS_MANAGER: { name: 'Operations Manager', description: 'Vehicle operations and assignments.', privileged: false, permissions: [] },
  INVENTORY_MANAGER: { name: 'Inventory Manager', description: 'Vehicle custody and inventory workflow.', privileged: false, permissions: [] },
  LISTING_EXECUTIVE: { name: 'Listing Executive', description: 'Listing preparation and publication workflow.', privileged: false, permissions: [] },
  PRICING_APPROVER: { name: 'Pricing Approver', description: 'Independent acquisition and retail pricing authority.', privileged: true, permissions: [] },
  FINANCE: { name: 'Finance', description: 'Payment verification and reconciliation authority.', privileged: true, permissions: [] },
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
