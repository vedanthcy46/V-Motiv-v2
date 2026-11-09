import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaConnectStore, verifyConnectSignature } from './connect-store.js';
import { HttpError } from './errors.js';
import { assertWebhookSignature } from './payment-signature.js';

const uuid = z.string().uuid();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('CONNECT_ROUTER_INVALID_INPUT', JSON.stringify(error.issues));
      throw new HttpError(400, 'INVALID_INPUT');
    }
    throw error;
  }
}

const linkSchema = z.object({
  token: z.string().trim().max(128).optional(),
  qrUrl: z.string().trim().max(300).optional(),
  claimCode: z.string().trim().max(64).optional(),
}).strict().refine((data) => data.token || data.qrUrl || data.claimCode, {
  message: 'Either token, qrUrl, or claimCode must be provided',
});

const toggleSchema = z.object({
  enabled: z.boolean(),
}).strict();

const contactPreferencesSchema = z.object({
  callingEnabled: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
}).strict().refine(value => value.callingEnabled !== undefined || value.messagingEnabled !== undefined, {
  message: 'Provide callingEnabled and/or messagingEnabled',
});

const revokeSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict();

const requestStickerSchema = z.object({
  deliveryAddress: z.string().trim().min(5).max(300).optional(),
  city: z.string().trim().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  instructions: z.string().trim().max(500).optional(),
}).strict();

const publicAlertSchema = z.object({
  reason: z.enum(['BLOCKING_ACCESS', 'LIGHTS_ON', 'DAMAGE_OR_ACCIDENT', 'SAFETY_CONCERN', 'OTHER']),
  message: z.string().trim().min(1).max(300).optional(),
  photoUrls: z.array(z.string().min(5)).max(5).optional(),
  photos: z.array(z.string().min(5)).max(5).optional(),
}).strict();

const publicPhotoUploadSchema = z.object({
  base64Data: z.string().min(10),
  mimeType: z.string().max(100).optional(),
}).strict();

const callRequestSchema = z.object({
  consentGiven: z.literal(true),
  mode: z.enum(['VOICE', 'CHAT']).optional().default('VOICE'),
  initialMessage: z.string().trim().max(500).optional(),
}).strict();

const callDecisionSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']) }).strict();
const callSignalSchema = z.object({ kind: z.enum(['OFFER', 'ANSWER', 'ICE', 'HANGUP', 'CHAT', 'CLOSE']), payload: z.record(z.string(), z.unknown()) }).strict();
const signalCursorSchema = z.object({ after: z.string().datetime().optional() });

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createConnectCustomerRouter(deps: {
  verify: VerifyToken;
  store: PrismaConnectStore;
}) {
  const router = Router();
  const auth = authentication(deps.verify);

  // Status & Link Info
  router.get('/garage/:id/connect', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const result = await deps.store.getConnectStatus(identity.uid, vehicleId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Deliberately retire arbitrary-token linking. V2 stickers are issued only
  // by this API so a pasted prototype token can never become a valid V2 QR.
  router.post('/garage/:id/connect/link', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      uuid.parse(req.params.id);
      throw new HttpError(410, 'CONNECT_LEGACY_LINKING_RETIRED');
    } catch (e) {
      next(e);
    }
  });

  // Issue a first-party V2 sticker. Its unguessable URL is returned once only.
  router.post('/garage/:id/connect/issue', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      res.status(201).json(await deps.store.issueSticker(identity.uid, vehicleId));
    } catch (e) {
      next(e);
    }
  });

  // Toggle Active / Disabled State
  router.post('/garage/:id/connect/toggle', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const input = parse(toggleSchema, req.body);
      const result = await deps.store.toggleConnectStatus(identity.uid, vehicleId, input.enabled);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Allow or stop calls and chat from passers-by for this vehicle's sticker.
  router.post('/garage/:id/connect/contact-preferences', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const input = parse(contactPreferencesSchema, req.body);
      res.json(await deps.store.updateContactPreferences(identity.uid, vehicleId, input));
    } catch (e) {
      next(e);
    }
  });

  // Revoke QR
  router.post('/garage/:id/connect/revoke', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const input = parse(revokeSchema, req.body);
      const result = await deps.store.revokeConnectLink(identity.uid, vehicleId, input.reason);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Request Physical Sticker
  router.post('/garage/:id/connect/request-sticker', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const input = parse(requestStickerSchema, req.body);
      const result = await deps.store.requestPhysicalSticker(identity.uid, vehicleId, input);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  // Get Alerts for a Specific Vehicle
  router.get('/garage/:id/connect/alerts', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const vehicleId = uuid.parse(req.params.id);
      const { page, limit } = parse(paginationSchema, req.query);
      const result = await deps.store.listAlerts(identity.uid, vehicleId, page, limit);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Get All Connect Alerts for User
  router.get('/connect/alerts', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const { page, limit } = parse(paginationSchema, req.query);
      const result = await deps.store.listAlerts(identity.uid, undefined, page, limit);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Mark Alert as Read
  router.patch('/connect/alerts/:alertId/read', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const alertId = uuid.parse(req.params.alertId);
      const result = await deps.store.markAlertRead(identity.uid, alertId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get('/connect/calls/incoming', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json({ items: await deps.store.listIncomingCalls(identity.uid) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/connect/calls/:callSessionId/respond', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const callSessionId = uuid.parse(req.params.callSessionId);
      const input = parse(callDecisionSchema, req.body);
      res.json(await deps.store.respondToIncomingCall(identity.uid, callSessionId, input.decision));
    } catch (e) {
      next(e);
    }
  });

  router.post('/connect/calls/:callSessionId/close', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as Identity;
      const callSessionId = uuid.parse(req.params.callSessionId);
      res.json(await deps.store.closeCallSession(identity.uid, callSessionId));
    } catch (e) {
      next(e);
    }
  });

  router.get('/connect/calls/:callSessionId/signals', auth, async (req, res, next) => {
    try { const identity = res.locals.identity as Identity; const { after } = parse(signalCursorSchema, req.query); res.json(await deps.store.listOwnerCallSignals(identity.uid, uuid.parse(req.params.callSessionId), after ? new Date(after) : undefined)); } catch (e) { next(e); }
  });
  router.post('/connect/calls/:callSessionId/signals', auth, async (req, res, next) => {
    try { const identity = res.locals.identity as Identity; const input = parse(callSignalSchema, req.body); res.status(201).json(await deps.store.addOwnerCallSignal(identity.uid, uuid.parse(req.params.callSessionId), input.kind, input.payload)); } catch (e) { next(e); }
  });
  router.post('/connect/calls/:callSessionId/realtime-ticket', auth, async (req, res, next) => {
    try { const identity = res.locals.identity as Identity; res.json(await deps.store.issueOwnerRealtimeTicket(identity.uid, uuid.parse(req.params.callSessionId))); } catch (e) { next(e); }
  });

  return router;
}

/** Public, privacy-preserving sticker scan routes. No Firebase session required. */
export function createConnectPublicRouter(deps: { store: PrismaConnectStore; verify?: VerifyToken }) {
  /**
   * Who is scanning, when they are signed in to the app. Public scans stay anonymous: a missing, expired or invalid sign-in simply
   * means "anonymous" and never fails the request. It is only used to stop owners calling or messaging their own vehicle.
   */
  async function viewerUid(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    if (!deps.verify || !header?.startsWith('Bearer ')) return undefined;
    try {
      return (await deps.verify(header.slice(7), false)).uid;
    } catch {
      return undefined;
    }
  }

  const router = Router();
  const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

  router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await deps.store.lookupPublicSticker(token.parse(req.params.token), await viewerUid(req)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/:token/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(publicAlertSchema, req.body);
      res.status(201).json(await deps.store.createPublicAlert(token.parse(req.params.token), { ...input, visitorIp: req.ip }));
    } catch (e) {
      next(e);
    }
  });

  router.post('/:token/photos', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(publicPhotoUploadSchema, req.body);
      res.status(201).json(await deps.store.uploadPublicAlertPhoto(token.parse(req.params.token), input.base64Data, input.mimeType));
    } catch (e) {
      next(e);
    }
  });

  router.post('/:token/call-requests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(callRequestSchema, req.body);
      res.status(201).json(await deps.store.requestPublicCall(token.parse(req.params.token), req.ip, input, await viewerUid(req)));
    } catch (e) {
      next(e);
    }
  });
  router.get('/:token/calls/:callSessionId/signals', async (req, res, next) => {
    try { const { after } = parse(signalCursorSchema, req.query); res.json(await deps.store.listPublicCallSignals(token.parse(req.params.token), uuid.parse(req.params.callSessionId), after ? new Date(after) : undefined)); } catch (e) { next(e); }
  });
  router.post('/:token/calls/:callSessionId/signals', async (req, res, next) => {
    try { const input = parse(callSignalSchema, req.body); res.status(201).json(await deps.store.addPublicCallSignal(token.parse(req.params.token), uuid.parse(req.params.callSessionId), input.kind, input.payload)); } catch (e) { next(e); }
  });
  router.post('/:token/calls/:callSessionId/realtime-ticket', async (req, res, next) => {
    try { res.json(await deps.store.issuePublicRealtimeTicket(token.parse(req.params.token), uuid.parse(req.params.callSessionId))); } catch (e) { next(e); }
  });
  return router;
}

export function createConnectWebhookRouter(deps: {
  store: PrismaConnectStore;
  webhookSecret?: string;
}) {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = deps.webhookSecret || process.env.CONNECT_WEBHOOK_SECRET;
      const signature = req.headers['x-connect-signature'] as string | undefined;
      const bodyRaw: string = (req as any).rawBody ?? JSON.stringify(req.body);
      assertWebhookSignature(bodyRaw, signature, secret);

      const result = await deps.store.processConnectWebhook(req.body);
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
