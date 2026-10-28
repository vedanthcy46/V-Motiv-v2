import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaConnectStore, verifyConnectSignature } from './connect-store.js';
import { HttpError } from './errors.js';

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
}).strict();

const callDecisionSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']) }).strict();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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

  return router;
}

/** Public, privacy-preserving sticker scan routes. No Firebase session required. */
export function createConnectPublicRouter(deps: { store: PrismaConnectStore }) {
  const router = Router();
  const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

  router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await deps.store.lookupPublicSticker(token.parse(req.params.token)));
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
      parse(callRequestSchema, req.body);
      res.status(201).json(await deps.store.requestPublicCall(token.parse(req.params.token), req.ip));
    } catch (e) {
      next(e);
    }
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
      const secret = deps.webhookSecret || process.env.CONNECT_WEBHOOK_SECRET || 'vmotiv_connect_secret_default';
      const signature = req.headers['x-connect-signature'] as string | undefined;

      // In production or when signature is present, verify
      if (signature && !verifyConnectSignature(JSON.stringify(req.body), signature, secret)) {
        throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE');
      }

      const result = await deps.store.processConnectWebhook(req.body);
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
