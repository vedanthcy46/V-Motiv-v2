// Vehicle scrapping, kept deliberately small. A customer tells us about the vehicle and where it is; our sales team is notified and phones them;
// everything after that (inspection, price, paperwork, pickup, certificates) is handled outside this system. Nothing here estimates a price,
// tracks a facility, or generates or verifies any official document.
import { randomInt } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { currentCalendarYear } from './calendar.js';
import { HttpError } from './errors.js';
import type { NotificationService } from './notification/index.js';

const STATUS_TEXT: Record<string, string> = {
  NEW: 'Received. Our team will call you soon.',
  CONTACTED: 'Our team has contacted you.',
  CLOSED: 'Closed.',
};

export const normalizeRegistration = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const scrapRequestInput = z.object({
  registrationNumber: z.string().trim().min(4).max(20),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  manufacturingYear: z.number().int().min(1950).max(currentCalendarYear() + 1),
  fuelType: z.string().trim().min(2).max(30).optional(),
  odometerKm: z.number().int().min(0).max(5_000_000).optional(),
  condition: z.string().trim().max(1000).optional(),
  city: z.string().trim().min(2).max(80),
  pickupAddress: z.string().trim().max(300).optional(),
  /** Defaults to the number on the customer's account. */
  contactPhone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number').optional(),
  /** Makes a retried submission (double tap, lost response) return the same request instead of creating another. */
  submissionKey: z.string().trim().min(8).max(100).optional(),
}).strict();

export type ScrapRequestInput = z.infer<typeof scrapRequestInput>;

type Row = {
  id: string; requestNumber: string; status: string; registrationNumber: string; make: string; model: string; manufacturingYear: number; city: string; createdAt: Date;
};

const isUnique = (error: unknown, field?: string) => {
  const e = error as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  return !field || String(e.meta?.target ?? '').includes(field);
};

const newRequestNumber = () => `SCR-${currentCalendarYear()}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;

export class ScrapRequestStore {
  constructor(private readonly db: PrismaClient, private readonly notifications?: NotificationService, private readonly makeNumber: () => string = newRequestNumber) {}

  private view(row: Row) {
    return {
      id: row.id, requestNumber: row.requestNumber, status: row.status, statusText: STATUS_TEXT[row.status] ?? row.status,
      vehicle: { registrationNumber: row.registrationNumber, make: row.make, model: row.model, manufacturingYear: row.manufacturingYear },
      city: row.city, createdAt: row.createdAt,
    };
  }

  async create(uid: string, input: ScrapRequestInput) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: uid, status: 'ACTIVE' }, select: { id: true, displayName: true, email: true, phone: true } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');
    const phone = input.contactPhone ?? user.phone;
    if (!phone) throw new HttpError(400, 'PHONE_REQUIRED', 'Add a mobile number so our team can call you.');

    if (input.submissionKey) {
      const same = await this.db.scrapRequest.findFirst({ where: { submissionKey: input.submissionKey, customerId: user.id } });
      if (same) return { created: false, request: this.view(same) };
    }
    const registration = normalizeRegistration(input.registrationNumber);
    if (registration.length < 4) throw new HttpError(400, 'INVALID_INPUT', 'Enter the vehicle registration number.');
    const open = await this.db.scrapRequest.findFirst({ where: { customerId: user.id, registrationNumber: registration, status: { in: ['NEW', 'CONTACTED'] } } });
    if (open) throw new HttpError(409, 'SCRAP_REQUEST_ALREADY_OPEN', `You already asked us to scrap this vehicle (${open.requestNumber}). Our team will be in touch.`);

    let created: Row | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await this.db.scrapRequest.create({
          data: {
            requestNumber: this.makeNumber(),
            customerId: user.id, submissionKey: input.submissionKey ?? null, registrationNumber: registration, make: input.make, model: input.model,
            manufacturingYear: input.manufacturingYear, fuelType: input.fuelType ?? null, odometerKm: input.odometerKm ?? null, condition: input.condition || null,
            city: input.city, pickupAddress: input.pickupAddress || null, contactPhone: phone,
          },
        });
      } catch (error) {
        if (isUnique(error, 'submissionKey')) {
          const same = await this.db.scrapRequest.findFirst({ where: { submissionKey: input.submissionKey!, customerId: user.id } });
          if (same) return { created: false, request: this.view(same) };
        }
        if (!isUnique(error, 'requestNumber')) throw error; // a clash on the number is retried with a new one
      }
    }
    if (!created) throw new HttpError(503, 'TRY_AGAIN', 'We could not save your request. Please try again.');

    // After the request is saved, so a failed notification never loses it. Staff are told in the portal, by push and by email.
    await this.notifications?.dispatchDomainEvent({
      type: 'SCRAP_REQUEST_SUBMITTED',
      category: 'SELLING',
      priority: 'HIGH',
      recipientRoles: ['SALES_EXECUTIVE', 'SALES_MANAGER'],
      title: `Scrap request: ${input.manufacturingYear} ${input.make} ${input.model}`,
      body: `${user.displayName || user.email} (${phone}) wants to scrap ${registration} in ${input.city}. Call them to take it forward. Ref ${created.requestNumber}.`,
      actionUrl: '/sales?page=scrap',
      referenceId: created.id,
      entityType: 'ScrapRequest',
      metadata: { targetApp: 'SALES', scrapRequestId: created.id },
    }).catch(() => undefined);

    return { created: true, request: this.view(created) };
  }

  async listMine(uid: string) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: uid, status: 'ACTIVE' }, select: { id: true } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');
    const rows = await this.db.scrapRequest.findMany({ where: { customerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { items: rows.map(row => this.view(row)) };
  }
}

/** Customer routes. Staff see and update requests through the sales routes (`/sales/scrap-requests`). */
export function createScrapRequestRouter(deps: { verify: VerifyToken; store: ScrapRequestStore; limiter?: RequestHandler }) {
  const router = Router();
  const auth = authentication(deps.verify);
  if (deps.limiter) router.use('/customer/scrap', deps.limiter);
  router.post('/customer/scrap/requests', auth, async (req, res) => {
    const result = await deps.store.create((res.locals.identity as Identity).uid, scrapRequestInput.parse(req.body));
    res.status(result.created ? 201 : 200).json(result);
  });
  router.get('/customer/scrap/requests', auth, async (_req, res) => res.json(await deps.store.listMine((res.locals.identity as Identity).uid)));
  return router;
}
