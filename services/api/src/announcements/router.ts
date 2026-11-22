// /staff/announcements: Admin and Operations manage platform announcements. Every route needs an active employee holding
// `announcement.manage`, checked on each request.
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { loadEmployeeFacts } from '../employee-notifications/routing.js';
import { signDirectUpload } from '../cloudinary.js';
import * as announcements from './announcements.js';

const uuid = z.string().uuid();
const body = z.object({
  title: z.string().trim().min(3).max(65),
  body: z.string().trim().min(5).max(178),
  target: z.enum(announcements.ANNOUNCEMENT_TARGETS),
  listingId: z.string().uuid().nullish(),
  imageUrl: z.string().url().max(500).nullish(),
  city: z.string().trim().min(2).max(100).nullish(),
}).strict();
const sendBody = z.object({ expectedRecipients: z.number().int().min(0).max(10_000_000), scheduledFor: z.string().datetime({ offset: true }).nullish() }).strict();
const settingsBody = z.object({ enabled: z.boolean().optional(), maxPerDay: z.number().int().min(1).max(10).optional() }).strict();

export function createAnnouncementRouter(deps: { verify: VerifyToken; db: PrismaClient }) {
  const router = Router();
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpError(400, 'VALIDATION_FAILED', result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    return result.data;
  };
  const gate: RequestHandler = async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const user = await deps.db.user.findUnique({ where: { firebaseUid: identity.uid }, select: { id: true } });
      const facts = user ? (await loadEmployeeFacts(deps.db, [user.id])).get(user.id) : undefined;
      if (!user || !facts || !facts.active || !facts.userActive) throw new HttpError(403, 'EMPLOYEE_REQUIRED');
      if (!facts.permissions.has('announcement.manage')) throw new HttpError(403, 'PERMISSION_DENIED');
      res.locals.actorId = user.id;
      next();
    } catch (error) { next(error); }
  };
  const actor = (res: { locals: Record<string, unknown> }) => res.locals.actorId as string;
  const wrap = (handler: (req: any, res: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res, next) => {
    try { res.status(status).json(await handler(req, res)); } catch (error) { next(error); }
  };

  router.use('/staff/announcements', authentication(deps.verify), gate);
  const at = (path: string) => `/staff/announcements${path}`;
  router.get(at(''), wrap(async () => ({ items: await announcements.listAnnouncements(deps.db), settings: await announcements.getSettings(deps.db), targets: announcements.ANNOUNCEMENT_TARGETS })));
  router.get(at('/settings'), wrap(() => announcements.getSettings(deps.db)));
  router.put(at('/settings'), wrap((req, res) => announcements.updateSettings(deps.db, actor(res), parse(settingsBody, req.body))));
  // A one-time signature so the browser can upload the picture straight to the media account (it never passes through this server).
  router.post(at('/upload-signature'), wrap(async () => { const signed = signDirectUpload('announcements'); if (!signed) throw new HttpError(503, 'UPLOAD_NOT_CONFIGURED', 'Picture upload is not set up on this server.'); return signed; }));
  router.get(at('/audience'), wrap(req => announcements.audienceSize(deps.db, typeof req.query.city === 'string' && req.query.city ? req.query.city : null)));
  router.post(at(''), wrap((req, res) => announcements.createAnnouncement(deps.db, actor(res), parse(body, req.body)), 201));
  router.get(at('/:id'), wrap(req => announcements.getAnnouncement(deps.db, parse(uuid, req.params.id))));
  router.patch(at('/:id'), wrap((req, res) => announcements.updateAnnouncement(deps.db, actor(res), parse(uuid, req.params.id), parse(body, req.body))));
  router.post(at('/:id/test'), wrap((req, res) => announcements.sendTest(deps.db, actor(res), parse(uuid, req.params.id))));
  router.post(at('/:id/send'), wrap((req, res) => {
    const input = parse(sendBody, req.body);
    return announcements.sendAnnouncement(deps.db, actor(res), parse(uuid, req.params.id), { expectedRecipients: input.expectedRecipients, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null });
  }));
  router.post(at('/:id/cancel'), wrap((req, res) => announcements.cancelAnnouncement(deps.db, actor(res), parse(uuid, req.params.id))));
  return router;
}
