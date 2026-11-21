// HTTP contracts for the employee notification system. Mounted under /api/v2:
//   /employees/me/notifications...        the signed-in employee's own inbox (never an employee id from the client)
//   /admin/notification-routing|queues|health, /admin/activity-monitor   governance, each behind its own permission
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from '../auth.js';
import { HttpError } from '../errors.js';
import * as inbox from './inbox.js';
import * as governance from './governance.js';
import { saveRoutingPolicy } from './policy.js';
import { loadEmployeeFacts } from './routing.js';

const uuid = z.string().uuid();
const boolish = z.enum(['true', 'false']).transform(value => value === 'true');
const date = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).transform(value => new Date(value));

const listQuery = z.object({
  module: z.string().max(20).optional(), severity: z.string().max(20).optional(), unread: boolish.optional(), actionRequired: boolish.optional(),
  branchId: uuid.optional(), from: date.optional(), to: date.optional(), cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

const preferenceBody = z.object({
  pushEnabled: z.boolean().optional(), emailEnabled: z.boolean().optional(), inAppEnabled: z.boolean().optional(), quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional(), quietHoursEnd: z.string().optional(), digestFrequency: z.enum(['OFF', 'DAILY']).optional(), mutedModules: z.array(z.string()).max(10).optional(),
}).strict();

const deviceBody = z.object({ token: z.string().min(10).max(300), app: z.string().min(2).max(40), platform: z.enum(['android', 'ios', 'web']), installationId: z.string().max(120).optional(), projectId: z.string().max(120).optional() }).strict();

const policyBody = z.object({
  enabled: z.boolean().optional(), requiredPermission: z.string().max(100).nullable().optional(),
  recipientStrategy: z.enum(['ASSIGNED_EMPLOYEE', 'ASSIGNED_TEAM', 'BRANCH_QUEUE_OWNER', 'DESIGNATED_APPROVER', 'FINANCE_CASE_OWNER', 'INSPECTOR_ASSIGNEE', 'ADMIN_RESPONDER', 'AUTHORIZED_SUBSCRIBERS']).optional(),
  branchScope: z.enum(['BRANCH', 'GLOBAL', 'ASSIGNED']).optional(), severity: z.enum(['CRITICAL', 'ACTION_REQUIRED', 'INFORMATIONAL']).optional(),
  deliveryChannels: z.array(z.enum(['IN_APP', 'PUSH', 'EMAIL'])).max(3).optional(), requiresAcknowledgement: z.boolean().optional(),
  escalationPolicyKey: z.string().max(60).nullable().optional(), dedupWindowMinutes: z.number().int().min(0).max(10_080).optional(), note: z.string().max(300).optional(),
}).strict();

const queueBody = z.object({ queueKey: z.string().max(40), userId: uuid, branchId: uuid.nullable().optional(), memberRole: z.enum(['OWNER', 'MEMBER']).optional() }).strict();

const activityQuery = z.object({
  from: date.optional(), to: date.optional(), domain: z.string().max(20).optional(), actorId: uuid.optional(), branchId: uuid.optional(),
  outcome: z.string().max(30).optional(), resourceId: z.string().max(80).optional(), page: z.coerce.number().int().min(1).max(10_000).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

export interface EmployeeNotificationRouterDeps { verify: VerifyToken; db: PrismaClient; streamPollMs?: number; streamMaxMs?: number }

export function createEmployeeNotificationRouter(deps: EmployeeNotificationRouterDeps) {
  const router = Router();
  const authenticate = authentication(deps.verify);
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpError(400, 'VALIDATION_FAILED', result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    return result.data;
  };

  /** Firebase sign-in alone is not staff authorisation: the person must be an active employee, checked on every request. */
  const requireEmployee: RequestHandler = async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const user = await deps.db.user.findUnique({ where: { firebaseUid: identity.uid }, select: { id: true } });
      const facts = user ? (await loadEmployeeFacts(deps.db, [user.id])).get(user.id) : undefined;
      if (!user || !facts || !facts.active || !facts.userActive) throw new HttpError(403, 'EMPLOYEE_REQUIRED');
      res.locals.employeeId = user.id;
      res.locals.employeeFacts = facts;
      next();
    } catch (error) { next(error); }
  };
  const requirePermission = (permission: string): RequestHandler => (_req, res, next) => {
    const facts = res.locals.employeeFacts as { permissions: Set<string> };
    if (!facts.permissions.has(permission)) return next(new HttpError(403, 'PERMISSION_DENIED'));
    next();
  };
  const me = (res: { locals: Record<string, unknown> }) => res.locals.employeeId as string;
  const wrap = (handler: (req: any, res: any) => Promise<unknown>): RequestHandler => async (req, res, next) => {
    try { res.json(await handler(req, res)); } catch (error) { next(error); }
  };

  // ---------------------------------------------------------------------------------------------- the employee's own inbox
  const mine = Router();
  mine.use(authenticate, requireEmployee);

  mine.get('/notifications', wrap(async (req, res) => {
    const q = parse(listQuery, req.query);
    return inbox.listInbox(deps.db, me(res), { module: q.module, severity: q.severity, unreadOnly: q.unread, actionRequired: q.actionRequired, branchId: q.branchId, from: q.from, to: q.to, cursor: q.cursor, limit: q.limit });
  }));
  mine.get('/notifications/unread-count', wrap(async (req, res) => inbox.unreadCounts(deps.db, me(res), typeof req.query.module === 'string' ? req.query.module : undefined)));
  mine.post('/notifications/read-all', wrap(async (req, res) => inbox.markAllRead(deps.db, me(res), typeof req.body?.module === 'string' ? req.body.module : undefined)));
  mine.get('/notifications/preferences', wrap(async (_req, res) => inbox.getPreferences(deps.db, me(res))));

  // Live updates by Server-Sent Events. The browser reads it with fetch (so the Authorization header can be sent). If the connection
  // drops, or the host cannot hold one open, the portal falls back to the REST list: the inbox never depends on this stream.
  mine.get('/notifications/stream', async (req, res, next) => {
    try {
      const userId = me(res);
      res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.();
      let cursor = new Date();
      let closed = false;
      const startedAt = Date.now();
      const write = (chunk: string) => { if (!closed) res.write(chunk); };
      write(`event: ready\ndata: ${JSON.stringify({ at: cursor.toISOString() })}\n\n`);
      const tick = setInterval(async () => {
        try {
          // Re-checked on every poll: a person suspended mid-stream stops receiving at once.
          const facts = (await loadEmployeeFacts(deps.db, [userId])).get(userId);
          if (!facts || !facts.active || !facts.userActive) { write('event: end\ndata: {"reason":"NOT_AUTHORISED"}\n\n'); return stop(); }
          const fresh = await deps.db.notification.findMany({ where: { userId, module: { not: null }, dismissedAt: null, createdAt: { gt: cursor } }, orderBy: { createdAt: 'asc' }, take: 50 });
          for (const row of fresh) { cursor = row.createdAt > cursor ? row.createdAt : cursor; write(`event: notification\ndata: ${JSON.stringify(inbox.toItem(row))}\n\n`); }
          if (fresh.length === 0) write(': keep-alive\n\n');
          if (Date.now() - startedAt > (deps.streamMaxMs ?? 5 * 60_000)) { write('event: end\ndata: {"reason":"RECONNECT"}\n\n'); stop(); }
        } catch { stop(); }
      }, deps.streamPollMs ?? 5000);
      const stop = () => { if (closed) return; closed = true; clearInterval(tick); res.end(); };
      req.on('close', stop);
    } catch (error) { next(error); }
  });

  mine.patch('/notifications/preferences', wrap(async (req, res) => inbox.updatePreferences(deps.db, me(res), parse(preferenceBody, req.body))));
  mine.patch('/notifications/:id/read', wrap(async (req, res) => inbox.markRead(deps.db, me(res), parse(uuid, req.params.id))));
  mine.post('/notifications/:id/acknowledge', wrap(async (req, res) => inbox.acknowledge(deps.db, me(res), parse(uuid, req.params.id))));
  mine.get('/notifications/:id/open', wrap(async (req, res) => inbox.authoriseOpen(deps.db, me(res), parse(uuid, req.params.id))));
  mine.get('/notification-preferences', wrap(async (_req, res) => inbox.getPreferences(deps.db, me(res))));
  mine.patch('/notification-preferences', wrap(async (req, res) => inbox.updatePreferences(deps.db, me(res), parse(preferenceBody, req.body))));
  mine.post('/notification-devices', async (req, res, next) => {
    try { res.status(201).json(await inbox.registerDevice(deps.db, me(res), parse(deviceBody, req.body))); } catch (error) { next(error); }
  });
  mine.delete('/notification-devices/:id', wrap(async (req, res) => inbox.removeDevice(deps.db, me(res), parse(uuid, req.params.id))));
  router.use('/employees/me', mine);

  // ---------------------------------------------------------------------------------------------------- administration
  const admin = Router();
  admin.use(authenticate, requireEmployee);
  admin.get('/notification-routing', requirePermission('system.health.read'), wrap(async () => governance.routingOverview(deps.db)));
  admin.put('/notification-routing/:eventType', requirePermission('policy.approve'), wrap(async (req, res) => {
    const saved = await saveRoutingPolicy(deps.db, { eventType: String(req.params.eventType), ...parse(policyBody, req.body) }, me(res));
    await deps.db.auditEvent.create({ data: { actorId: me(res), action: 'NOTIFICATION_ROUTING_POLICY_UPDATED', entityType: 'NotificationRoutingPolicy', entityId: saved.id, details: { eventType: saved.eventType, version: saved.version } } });
    return governance.effectivePolicyFor(deps.db, saved.eventType);
  }));
  admin.get('/notification-queues', requirePermission('system.health.read'), wrap(async req => governance.listQueueMembers(deps.db, typeof req.query.queueKey === 'string' ? req.query.queueKey : undefined)));
  admin.post('/notification-queues', requirePermission('employee.update'), async (req, res, next) => {
    try { res.status(201).json(await governance.addQueueMember(deps.db, parse(queueBody, req.body), me(res))); } catch (error) { next(error); }
  });
  admin.delete('/notification-queues/:id', requirePermission('employee.update'), wrap(async (req, res) => governance.removeQueueMember(deps.db, parse(uuid, req.params.id), me(res))));
  admin.get('/notification-health', requirePermission('system.health.read'), wrap(async () => governance.pipelineHealth(deps.db)));
  admin.get('/activity-monitor', wrap(async (req, res) => governance.activityMonitor(deps.db, me(res), parse(activityQuery, req.query))));
  router.use('/admin', admin);

  return router;
}
