import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import type { AdminActor, AdminStore } from './admin-store.js';
import { HttpError } from './errors.js';

const uuid = z.string().uuid();
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const employeeQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  role: z.enum(['SUPER_ADMIN', 'SECURITY_ADMIN', 'SUPPORT_ADMIN', 'SALES_EXECUTIVE', 'INSPECTOR', 'INSPECTION_REVIEWER', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'LISTING_EXECUTIVE', 'PRICING_APPROVER', 'FINANCE', 'ADMIN', 'AUDIT_VIEWER']).optional(),
  branchId: uuid.optional(),
});
const inviteInput = z.object({
  email: z.email().max(254).transform(value => value.trim().toLowerCase()),
  fullName: z.string().trim().min(2).max(120),
  designation: z.string().trim().min(2).max(120).optional(),
  roleId: uuid,
  branchIds: z.array(uuid).min(1).max(20).transform(values => [...new Set(values)]),
  expiresInHours: z.number().int().min(1).max(168).default(48),
}).strict();
const acceptInput = z.object({ token: z.string().min(40).max(200) }).strict();
const statusInput = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']), reason: z.string().trim().min(8).max(500) }).strict();
const approvalQuery = pagination.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'STALE']).optional() });
const privilegedInvitationProposal = inviteInput.extend({ reason: z.string().trim().min(8).max(500) }).strict();
const approvalDecisionInput = z.object({ version: z.number().int().positive(), decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().min(8).max(500) }).strict();
const branchCreateInput = z.object({
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).optional(),
  supportsService: z.boolean().optional(),
  supportsRentals: z.boolean().optional(),
}).strict();
const branchUpdateInput = z.object({
  name: z.string().trim().min(2).max(120).optional(), city: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(500).nullable().optional(), active: z.boolean().optional(),
  supportsService: z.boolean().optional(),
  supportsRentals: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const serviceAreaCreateInput = z.object({ name: z.string().trim().min(2).max(120) }).strict();
const serviceAreaUpdateInput = z.object({ active: z.boolean() }).strict();
const supportQuery = pagination.extend({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), search: z.string().trim().max(120).optional() });
const supportUpdateInput = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']), note: z.string().trim().min(1).max(2000).optional() }).strict();
const supportReplyInput = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const policyProposalInput = z.object({ key: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/), title: z.string().trim().min(3).max(160), content: z.record(z.string(), z.unknown()), effectiveAt: z.string().datetime().optional(), reason: z.string().trim().min(8).max(500) }).strict();
const policyUpdateInput = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED']).optional(),
  effectiveAt: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
}).strict();

const businessSellingQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().optional(),
});
const businessBuyingQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
});
const businessInventoryQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().optional(),
});

const masterDataQuery = z.object({
  category: z.string().trim().optional(),
});
const masterDataCreateInput = z.object({
  category: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(160),
  parentCode: z.string().trim().max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
const masterDataUpdateInput = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

const commsOutboxQuery = pagination.extend({
  state: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD_LETTER']).optional(),
});

const privacyQuery = pagination.extend({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED']).optional(),
});
const privacyUpdateInput = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  resolution: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'COMPLETED' || value.status === 'REJECTED') && !value.resolution) {
    context.addIssue({ code: 'custom', message: 'A terminal privacy decision requires a resolution note.', path: ['resolution'] });
  }
});

const exportCreateInput = z.object({
  resourceType: z.enum(['INVENTORY', 'AUDIT', 'EMPLOYEES', 'CUSTOMERS']),
  scope: z.string().trim().max(80).optional(),
  sensitive: z.boolean().optional(),
  reason: z.string().trim().min(8).max(500).optional(),
}).strict();

type EmployeePortalOrigins = {
  admin: string;
  sales: string;
  inspectionReview: string;
  operations: string;
  inspector: string;
};

function employeePortalDestination(actor: AdminActor, origins: EmployeePortalOrigins) {
  const role = actor.roles[0] || '';
  const portal = role === 'SALES_EXECUTIVE' ? 'sales'
    : role === 'INSPECTION_REVIEWER' ? 'inspectionReview'
      : role === 'INSPECTOR' ? 'inspector'
        : ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'LISTING_EXECUTIVE', 'PRICING_APPROVER', 'FINANCE'].includes(role) ? 'operations'
          : 'admin';
  const labels: Record<keyof EmployeePortalOrigins, string> = {
    admin: 'Admin Control Centre', sales: 'Sales Workspace', inspectionReview: 'Inspection Review Workspace', operations: 'Operations Workspace', inspector: 'Inspector Workspace',
  };
  return { portalUrl: origins[portal], portalLabel: labels[portal] };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) { if (error instanceof ZodError) throw new HttpError(400, 'INVALID_INPUT'); throw error; }
}

export function createAdminRouter(deps: {
  verify: VerifyToken;
  store: AdminStore;
  adminWebOrigin: string;
  employeePortalOrigins: EmployeePortalOrigins;
  revokeTokens: (firebaseUid: string) => Promise<void>;
  drainEmails?: () => Promise<number>;
}) {
  const router = Router();
  router.use(['/admin', '/staff'], authentication(deps.verify));

  router.post('/staff/invitations/accept', async (req, res) => {
    const body = parse(acceptInput, req.body);
    const actor = await deps.store.acceptInvitation(res.locals.identity as Identity, body.token);
    res.status(201).json({ ...actor, ...employeePortalDestination(actor, deps.employeePortalOrigins) });
  });

  const requireAdmin: RequestHandler = async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const actor = await deps.store.actor(identity.uid);
      const mfaRequired = process.env.ENFORCE_ADMIN_MFA !== 'false' && (process.env.ENFORCE_ADMIN_MFA === 'true' || process.env.NODE_ENV === 'test');
      if (mfaRequired && !identity.secondFactor) throw new HttpError(403, 'ADMIN_MFA_REQUIRED');
      res.locals.adminActor = actor;
      next();
    } catch (error) { next(error); }
  };
  router.use('/admin', requireAdmin);

  router.get('/admin/me', async (_req, res) => {
    const actor = res.locals.adminActor as AdminActor;
    await deps.store.touchAccess(actor.userId, true);
    res.json(actor);
  });
  router.get('/admin/dashboard', async (_req, res) => res.json(await deps.store.dashboard(res.locals.adminActor as AdminActor)));
  router.get('/admin/roles', async (_req, res) => res.json(await deps.store.roles(res.locals.adminActor as AdminActor)));
  router.get('/admin/branches', async (_req, res) => res.json(await deps.store.branches(res.locals.adminActor as AdminActor)));
  router.get('/admin/branches/manage', async (_req, res) => res.json(await deps.store.manageBranches(res.locals.adminActor as AdminActor)));
  router.post('/admin/branches', async (req, res) => res.status(201).json(await deps.store.createBranch(res.locals.adminActor as AdminActor, parse(branchCreateInput, req.body))));
  router.patch('/admin/branches/:id', async (req, res) => res.json(await deps.store.updateBranch(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), parse(branchUpdateInput, req.body))));
  router.get('/admin/service-areas', async (_req, res) => res.json(await deps.store.serviceAreas(res.locals.adminActor as AdminActor)));
  router.post('/admin/service-areas', async (req, res) => res.status(201).json(await deps.store.createServiceArea(res.locals.adminActor as AdminActor, parse(serviceAreaCreateInput, req.body).name)));
  router.patch('/admin/service-areas/:id', async (req, res) => res.json(await deps.store.updateServiceArea(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), parse(serviceAreaUpdateInput, req.body).active)));
  router.delete('/admin/service-areas/:id', async (req, res) => res.json(await deps.store.deleteServiceArea(res.locals.adminActor as AdminActor, parse(uuid, req.params.id))));
  router.get('/admin/support/cases', async (req, res) => res.json(await deps.store.supportCases(res.locals.adminActor as AdminActor, parse(supportQuery, req.query))));
  router.patch('/admin/support/cases/:id', async (req, res) => res.json(await deps.store.updateSupportCase(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), parse(supportUpdateInput, req.body))));
  router.post('/admin/support/cases/:id/replies', async (req, res) => {
    const reply = await deps.store.replySupportCase(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), parse(supportReplyInput, req.body).body);
    if (deps.drainEmails) void deps.drainEmails().catch(() => undefined);
    res.status(201).json(reply);
  });
  router.get('/admin/system-health', async (_req, res) => res.json(await deps.store.systemHealth(res.locals.adminActor as AdminActor)));
  router.get('/admin/policies', async (_req, res) => res.json(await deps.store.policies(res.locals.adminActor as AdminActor)));
  router.get('/admin/policies/:id', async (req, res) => res.json(await deps.store.getPolicy(res.locals.adminActor as AdminActor, parse(uuid, req.params.id))));
  router.patch('/admin/policies/:id', async (req, res) => res.json(await deps.store.updatePolicy(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), parse(policyUpdateInput, req.body))));
  router.delete('/admin/policies/:id', async (req, res) => res.json(await deps.store.deletePolicy(res.locals.adminActor as AdminActor, parse(uuid, req.params.id))));
  router.post('/admin/policies/proposals', async (req, res) => res.status(202).json(await deps.store.proposePolicy(res.locals.adminActor as AdminActor, parse(policyProposalInput, req.body))));
  router.get('/admin/employees', async (req, res) => res.json(await deps.store.employees(res.locals.adminActor as AdminActor, parse(employeeQuery, req.query))));
  router.post('/admin/invitations', async (req, res) => {
    const invitation = await deps.store.invite(res.locals.adminActor as AdminActor, { ...parse(inviteInput, req.body) as { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number }, adminOrigin: deps.adminWebOrigin });
    if (deps.drainEmails) void deps.drainEmails().catch(() => undefined);
    res.status(201).json(invitation);
  });
  router.post('/admin/approvals/privileged-invitations', async (req, res) => {
    const body = parse(privilegedInvitationProposal, req.body);
    const { reason, ...invitation } = body;
    const proposal = await deps.store.proposePrivilegedInvitation(res.locals.adminActor as AdminActor, { ...invitation as { email: string; fullName: string; designation?: string; roleId: string; branchIds: string[]; expiresInHours: number }, adminOrigin: deps.adminWebOrigin }, reason);
    res.status(202).json(proposal);
  });
  router.get('/admin/approvals', async (req, res) => res.json(await deps.store.approvals(res.locals.adminActor as AdminActor, parse(approvalQuery, req.query))));
  router.post('/admin/approvals/:id/decision', async (req, res) => {
    const result = await deps.store.decideApproval(res.locals.adminActor as AdminActor, parse(uuid, req.params.id), { ...parse(approvalDecisionInput, req.body), adminOrigin: deps.adminWebOrigin });
    if (deps.drainEmails) void deps.drainEmails().catch(() => undefined);
    res.json(result);
  });
  router.patch('/admin/employees/:id/status', async (req, res) => {
    const employeeId = parse(uuid, req.params.id);
    const body = parse(statusInput, req.body);
    const result = await deps.store.setEmployeeStatus(res.locals.adminActor as AdminActor, employeeId, body.status, body.reason);
    if (body.status !== 'ACTIVE') await deps.revokeTokens(result.firebaseUid);
    res.status(204).end();
  });
  router.get('/admin/audit', async (req, res) => {
    const query = parse(pagination, req.query);
    res.json(await deps.store.audit(res.locals.adminActor as AdminActor, query.page, query.limit));
  });

  // Business oversight
  router.get('/admin/business/selling', async (req, res) => {
    res.json(await deps.store.businessSelling(res.locals.adminActor as AdminActor, parse(businessSellingQuery, req.query)));
  });
  router.get('/admin/business/buying', async (req, res) => {
    res.json(await deps.store.businessBuying(res.locals.adminActor as AdminActor, parse(businessBuyingQuery, req.query)));
  });
  router.get('/admin/business/inventory', async (req, res) => {
    res.json(await deps.store.businessInventory(res.locals.adminActor as AdminActor, parse(businessInventoryQuery, req.query)));
  });
  router.get('/admin/business/finance', async (_req, res) => {
    res.json(await deps.store.businessFinance(res.locals.adminActor as AdminActor));
  });

  // Master data
  router.get('/admin/master-data', async (req, res) => {
    const query = parse(masterDataQuery, req.query);
    res.json(await deps.store.masterData(res.locals.adminActor as AdminActor, query.category));
  });
  router.post('/admin/master-data', async (req, res) => {
    const body = parse(masterDataCreateInput, req.body);
    res.status(201).json(await deps.store.createMasterDataItem(res.locals.adminActor as AdminActor, body));
  });
  router.patch('/admin/master-data/:id', async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(masterDataUpdateInput, req.body);
    res.json(await deps.store.updateMasterDataItem(res.locals.adminActor as AdminActor, id, body));
  });

  // Communications & Email Delivery
  router.get('/admin/communications/outbox', async (req, res) => {
    res.json(await deps.store.communicationsOutbox(res.locals.adminActor as AdminActor, parse(commsOutboxQuery, req.query)));
  });
  router.get('/admin/communications/templates', async (_req, res) => {
    res.json(await deps.store.communicationsTemplates(res.locals.adminActor as AdminActor));
  });
  router.post('/admin/communications/outbox/:id/retry', async (req, res) => {
    const id = parse(uuid, req.params.id);
    const result = await deps.store.retryEmailOutbox(res.locals.adminActor as AdminActor, id);
    if (deps.drainEmails) void deps.drainEmails().catch(() => undefined);
    res.json(result);
  });

  // Privacy Requests
  router.get('/admin/support/privacy-requests', async (req, res) => {
    res.json(await deps.store.privacyRequests(res.locals.adminActor as AdminActor, parse(privacyQuery, req.query)));
  });
  router.patch('/admin/support/privacy-requests/:id', async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(privacyUpdateInput, req.body);
    res.json(await deps.store.updatePrivacyRequest(res.locals.adminActor as AdminActor, id, body.status, body.resolution));
  });

  // Reports & Exports
  router.get('/admin/exports', async (req, res) => {
    const query = parse(pagination, req.query);
    res.json(await deps.store.exportJobs(res.locals.adminActor as AdminActor, query.page, query.limit));
  });
  router.post('/admin/exports', async (req, res) => {
    const body = parse(exportCreateInput, req.body);
    const job = await deps.store.createExportJob(res.locals.adminActor as AdminActor, body);
    res.status(job.status === 'APPROVAL_PENDING' ? 202 : 201).json(job);
  });
  router.get('/admin/exports/:id/download', async (req, res) => {
    const id = parse(uuid, req.params.id);
    const result = await deps.store.downloadExport(res.locals.adminActor as AdminActor, id);
    res.json(result);
  });

  return router;
}
