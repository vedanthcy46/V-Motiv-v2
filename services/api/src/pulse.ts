// "Pulse": a tiny change-detection endpoint so screens do not have to re-run heavy list queries just to find out
// that nothing changed. A client polls GET /pulse?domains=... (one request, a few cheap count/max aggregates,
// cached for a few seconds), and only calls the real list endpoints when a domain's token differs from last time.
import crypto from 'node:crypto';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { HttpError } from './errors.js';

type Field = 'updatedAt' | 'createdAt';
export interface Probe {
  model: string;
  field: Field;
  where?: Record<string, unknown>;
}

/** Staff-facing domains: which tables, when any of their rows are inserted/updated/removed, make a screen stale. */
export const STAFF_DOMAINS: Record<string, Probe[]> = {
  dispatch: [
    { model: 'inspectionRequest', field: 'updatedAt' },
    { model: 'inspectionAssignment', field: 'updatedAt' },
    { model: 'acquisitionCase', field: 'updatedAt' },
    { model: 'vehicleStockUnit', field: 'updatedAt' },
    { model: 'vehicleHandover', field: 'updatedAt' },
    { model: 'testDriveRequest', field: 'updatedAt' },
    // Steps that were invisible to other screens until someone pressed Refresh:
    { model: 'acquisitionDocumentReview', field: 'updatedAt' },
    { model: 'acquisitionSettlement', field: 'updatedAt' },
    { model: 'refurbishmentWorkOrder', field: 'updatedAt' },
    { model: 'refurbishmentCostApproval', field: 'updatedAt' },
    { model: 'qualityControlReport', field: 'updatedAt' },
    { model: 'vehicleListing', field: 'updatedAt' },
  ],
  review: [
    { model: 'inspectionReport', field: 'updatedAt' },
    { model: 'inspectionReviewDecision', field: 'createdAt' },
  ],
  rentals: [
    { model: 'rentalBooking', field: 'updatedAt' },
    { model: 'rentalFleetVehicle', field: 'updatedAt' },
    { model: 'rentalBookingHold', field: 'updatedAt' },
    { model: 'rentalPaymentRecord', field: 'createdAt' },
    { model: 'rentalVehicleBlock', field: 'createdAt' },
  ],
  service: [
    { model: 'serviceRequest', field: 'updatedAt' },
    { model: 'serviceEstimate', field: 'updatedAt' },
    { model: 'servicePaymentRecord', field: 'updatedAt' },
    { model: 'serviceInvoice', field: 'updatedAt' },
  ],
  sales: [
    { model: 'salesTask', field: 'updatedAt' },
    { model: 'buyerQuotation', field: 'updatedAt' },
    { model: 'inspectionRequest', field: 'updatedAt' },
    { model: 'vehicleStockUnit', field: 'updatedAt' },
    { model: 'acquisitionLead', field: 'updatedAt' },
    { model: 'testDriveRequest', field: 'updatedAt' },
    { model: 'purchaseEnquiry', field: 'updatedAt' },
  ],
  finance: [
    // A seller payout moves between people (prepare -> approve -> pay); each hand-off must reach the next person's screen.
    { model: 'financePayoutInstruction', field: 'updatedAt' },
    // New accepted offers and "documents verified, ready to pay" come from Operations.
    { model: 'acquisitionCase', field: 'updatedAt' },
    { model: 'acquisitionDocumentReview', field: 'updatedAt' },
    { model: 'acquisitionSettlement', field: 'updatedAt' },
    { model: 'buyerPaymentObligation', field: 'updatedAt' },
    { model: 'incomingReceipt', field: 'updatedAt' },
    { model: 'refundCase', field: 'updatedAt' },
    { model: 'expenseClaim', field: 'updatedAt' },
    { model: 'financialJournal', field: 'updatedAt' },
  ],
};

/** A customer's own records (their service requests, rentals, enquiries, drives, support cases, selling requests). */
export function customerProbes(userId: string): Probe[] {
  return [
    { model: 'serviceRequest', field: 'updatedAt', where: { customerId: userId } },
    { model: 'rentalBooking', field: 'updatedAt', where: { customerId: userId } },
    { model: 'testDriveRequest', field: 'updatedAt', where: { userId } },
    { model: 'purchaseEnquiry', field: 'updatedAt', where: { userId } },
    { model: 'supportCase', field: 'updatedAt', where: { userId } },
    { model: 'acquisitionLead', field: 'updatedAt', where: { userId } },
  ];
}

/** Count + newest timestamp per table, folded into one short opaque token. Any insert, update or delete changes it. */
export async function computeToken(db: PrismaClient, probes: Probe[]): Promise<string> {
  const parts = await Promise.all(
    probes.map(async probe => {
      const delegate = (db as unknown as Record<string, { aggregate: (args: unknown) => Promise<{ _count: { _all: number }; _max: Record<string, Date | null> }> }>)[probe.model];
      if (!delegate) return `${probe.model}:missing`;
      const result = await delegate.aggregate({ where: probe.where, _count: { _all: true }, _max: { [probe.field]: true } });
      const max = result._max[probe.field];
      return `${probe.model}:${result._count._all}:${max ? new Date(max).getTime() : 0}`;
    }),
  );
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

/** Tiny in-memory cache with in-flight de-duplication: N clients polling the same domain share one DB round. */
export class PulseCache {
  private readonly entries = new Map<string, { value: string; expires: number; storedAt: number }>();
  private readonly inflight = new Map<string, Promise<string>>();
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  /** `maxAgeMs` tightens the freshness for this call only (used right after a realtime signal). */
  async get(key: string, load: () => Promise<string>, maxAgeMs?: number): Promise<string> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now() && (maxAgeMs === undefined || this.now() - hit.storedAt < maxAgeMs)) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = load()
      .then(value => {
        this.entries.set(key, { value, expires: this.now() + this.ttlMs, storedAt: this.now() });
        if (this.entries.size > 2000) this.entries.clear();
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

export const FRESH_MAX_AGE_MS = 1_500;
export const PULSE_DOMAINS = [...Object.keys(STAFF_DOMAINS), 'me'] as const;

export function createPulseRouter(deps: { verify: VerifyToken; db: PrismaClient; ttlMs?: number }) {
  const router = Router();
  const cache = new PulseCache(deps.ttlMs ?? 8_000);
  router.get('/', authentication(deps.verify), async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const requested = String(req.query.domains ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      if (requested.length === 0 || requested.length > 8 || requested.some(item => !(PULSE_DOMAINS as readonly string[]).includes(item))) {
        throw new HttpError(400, 'INVALID_PULSE_DOMAINS');
      }
      // Authorization is checked on every request (never cached): suspended staff must stop getting signals at once.
      const user = await deps.db.user.findUnique({
        where: { firebaseUid: identity.uid },
        select: { id: true, status: true, employee: { select: { active: true, status: true } } },
      });
      if (!user || user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
      const isStaff = Boolean(user.employee?.active && user.employee.status === 'ACTIVE');
      // fresh=1: a realtime signal just said something changed, so accept at most ~1.5 s old data (simultaneous clients still share one query).
      const maxAge = req.query.fresh === '1' ? FRESH_MAX_AGE_MS : undefined;
      const tokens: Record<string, string> = {};
      await Promise.all(
        requested.map(async domain => {
          if (domain === 'me') {
            tokens[domain] = await cache.get(`me:${user.id}`, () => computeToken(deps.db, customerProbes(user.id)), maxAge);
            return;
          }
          if (!isStaff) throw new HttpError(403, 'EMPLOYEE_ACCESS_REQUIRED');
          tokens[domain] = await cache.get(`staff:${domain}`, () => computeToken(deps.db, STAFF_DOMAINS[domain]!), maxAge);
        }),
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ tokens });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
