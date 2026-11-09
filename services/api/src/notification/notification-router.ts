import { Router, json, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { VerifyToken, Identity } from '../auth.js';
import { authentication } from '../auth.js';
import { HttpError } from '../errors.js';
import type { NotificationService } from './notification-service.js';

const registerPushInput = z.object({
  token: z.string().min(5),
  app: z.enum(['CUSTOMER', 'INSPECTOR', 'ADMIN', 'SALES', 'OPS', 'REVIEW']),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  installationId: z.string().optional(),
  projectId: z.string().optional(),
  environment: z.string().optional(),
});

const unregisterPushInput = z.object({
  token: z.string().min(5),
});

const preferencesInput = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  inspectionAlerts: z.boolean().optional(),
  offerAlerts: z.boolean().optional(),
  orderAlerts: z.boolean().optional(),
  operationalEscalations: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  quietHoursEnd: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
});

export function createNotificationRouter(deps: {
  verify: VerifyToken;
  db: PrismaClient;
  service: NotificationService;
}): Router {
  const router = Router();
  const auth = authentication(deps.verify);

  // Helper middleware to resolve User from authenticated Identity
  const resolveUser: RequestHandler = async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity | undefined;
      if (!identity?.uid) throw new HttpError(401, 'AUTHENTICATION_REQUIRED');

      const user = await deps.db.user.findFirst({
        where: {
          OR: [
            { firebaseUid: identity.uid },
            { email: identity.email },
          ],
        },
        select: { id: true, email: true, status: true },
      });

      if (!user) throw new HttpError(404, 'USER_RECORD_NOT_FOUND');
      if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');

      res.locals.userId = user.id;
      next();
    } catch (err) {
      next(err);
    }
  };

  // --- In-App Notifications ---

  router.get('/notifications', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      const category = req.query.category ? String(req.query.category) : undefined;

      const result = await deps.service.getNotifications(userId, {
        page,
        limit,
        unreadOnly,
        category,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications/unread-count', auth, resolveUser, async (_req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const count = await deps.service.getUnreadCount(userId);
      res.json({ count });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notifications/:id/read', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      await deps.service.markAsRead(userId, String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Clear from the list (hidden, not deleted). Registered before the :id route so "clear-all" is never read as an id.
  router.post('/notifications/clear-all', auth, resolveUser, async (_req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const result = await deps.service.dismissAllNotifications(userId);
      res.json({ success: true, cleared: result.count });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/notifications/:id', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const result = await deps.service.dismissNotification(userId, String(req.params.id));
      res.json({ success: true, cleared: result.count });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/read-all', auth, resolveUser, async (_req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      await deps.service.markAllAsRead(userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Push Device Registration ---

  router.post('/push-devices', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const parsed = registerPushInput.parse(req.body);

      const device = await deps.service.registerPushDevice(userId, parsed);
      res.status(201).json({
        success: true,
        deviceId: device.id,
        app: device.app,
        platform: device.platform,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/push-devices', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const parsed = unregisterPushInput.parse(req.body);

      await deps.service.unregisterPushDevice(userId, parsed.token);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications/devices', auth, resolveUser, async (_req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const devices = await deps.db.pushDevice.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({
        devices: devices.map(d => ({
          id: d.id,
          app: d.app,
          platform: d.platform,
          active: d.active,
          environment: d.environment,
          lastSeenAt: d.lastSeenAt,
          tokenPreview: d.token.length > 20 ? `${d.token.slice(0, 15)}...${d.token.slice(-5)}` : d.token,
          createdAt: d.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/test-push', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const title = typeof req.body?.title === 'string' ? req.body.title : 'V MOTIV Test Notification';
      const body = typeof req.body?.body === 'string' ? req.body.body : 'Your push notifications are configured and working properly!';

      const result = await deps.service.dispatchDomainEvent({
        type: 'SYSTEM_NOTIFICATION',
        recipientUserIds: [userId],
        title,
        body,
        priority: 'HIGH',
        category: 'GENERAL',
      });

      const drained = await deps.service.drainPushTickets(10);

      res.json({
        success: true,
        notificationsCreated: result.notificationsCount,
        pushTicketsQueued: result.pushTicketsCount,
        pushTicketsDispatched: drained,
      });
    } catch (err) {
      next(err);
    }
  });

  // --- User Preferences ---

  router.get('/notification-preferences', auth, resolveUser, async (_req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const preferences = await deps.service.getPreferences(userId);
      res.json(preferences);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notification-preferences', auth, resolveUser, async (req, res, next) => {
    try {
      const userId = res.locals.userId as string;
      const parsed = preferencesInput.parse(req.body);

      const updated = await deps.service.updatePreferences(userId, parsed);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // --- Resend Webhook ---

  router.post('/webhooks/resend', json(), async (req, res, next) => {
    try {
      // Signature verification could be enabled with svix if RESEND_WEBHOOK_SECRET is set
      const event = req.body;
      if (!event || !event.type) {
        return res.status(400).json({ error: 'INVALID_WEBHOOK_PAYLOAD' });
      }

      const eventId = String(event.id || `${event.type}-${Date.now()}-${Math.random()}`);
      const eventType = String(event.type);
      const emailId = event.data?.email_id || event.data?.id || null;
      const recipient = event.data?.to?.[0] || null;

      // Idempotent insertion
      const existing = await deps.db.resendWebhookEvent.findUnique({
        where: { eventId },
      });

      if (!existing) {
        await deps.db.resendWebhookEvent.create({
          data: {
            eventId,
            eventType,
            emailId: emailId ? String(emailId) : null,
            recipient: recipient ? String(recipient) : null,
            payload: event,
          },
        });

        // Update EmailOutbox if emailId matches providerMessageId
        if (emailId) {
          let targetState: 'ACCEPTED' | 'FAILED' | null = null;
          let errorCode: string | null = null;
          if (eventType === 'email.delivered') {
            targetState = 'ACCEPTED';
          } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
            targetState = 'FAILED';
            errorCode = `RESEND_${eventType.replace('email.', '').toUpperCase()}`;
          }

          if (targetState) {
            await deps.db.emailOutbox.updateMany({
              where: { providerMessageId: String(emailId) },
              data: {
                state: targetState,
                lastErrorCode: errorCode,
              },
            });
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
