import { PrismaClient } from '@prisma/client';
import type { Identity } from './auth.js';
import { HttpError } from './errors.js';
import { UNCLAIMED_UID_PREFIX } from './walk-in-customer.js';
import { INSPECTION_POINT } from './inspection-claim.js';

export const profileSelect = {
  id: true, email: true, displayName: true, phone: true, status: true,
  marketingConsent: true, preferredCity: true, termsAcceptedAt: true, termsVersion: true, createdAt: true,
  employee: { select: { role: true, active: true, permissions: true, locationIds: true } },
} as const;
export type Profile = Awaited<ReturnType<PrismaIdentityStore['find']>>;
export interface IdentityStore {
  sync(identity: Identity): Promise<NonNullable<Profile>>;
  find(uid: string): Promise<Profile>;
  ready(): Promise<void>;
}
export class PrismaIdentityStore implements IdentityStore {
  constructor(private db: PrismaClient) {}
  async ready() { await this.db.$queryRaw`SELECT 1`; }
  find(uid: string) { return this.db.user.findUnique({ where: { firebaseUid: uid }, select: profileSelect }); }
  async sync(identity: Identity) {
    // UID lock serializes concurrent registration and the welcome event in one transaction.
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.uid}, 0))::text`;
      const existing = await tx.user.findUnique({ where: { firebaseUid: identity.uid }, select: profileSelect });
      if (existing) {
        if (existing.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
        return existing;
      }
      // A customer first served at a service desk or rental hub already has an account waiting under their email. Because
      // the identity is a Google-verified address, signing in with it claims that account, so their history is there.
      // Nothing else is ever linked by email, and employee access is never granted this way.
      const waiting = await tx.user.findFirst({
        where: { firebaseUid: { startsWith: UNCLAIMED_UID_PREFIX }, email: { equals: identity.email, mode: 'insensitive' }, employee: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, displayName: true },
      });
      if (waiting) {
        if (waiting.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
        const claimed = await tx.user.update({
          where: { id: waiting.id },
          data: { firebaseUid: identity.uid, email: identity.email, ...(waiting.displayName ? {} : { displayName: identity.name }) },
          select: profileSelect,
        });
        await tx.auditEvent.create({ data: { actorId: claimed.id, action: 'CUSTOMER_ACCOUNT_CLAIMED', entityId: claimed.id } });
        return claimed;
      }
      // Matching email text never links identities or creates employee access.
      const user = await tx.user.create({
        data: { firebaseUid: identity.uid, email: identity.email, displayName: identity.name },
        select: profileSelect,
      });
      await tx.emailOutbox.create({
        data: {
          userId: user.id,
          eventKey: 'welcome/' + user.id,
          recipient: user.email,
          templateVersion: 'welcome-v1',
          subject: 'Welcome to V MOTIV · Verified Pre-Owned Cars',
          text: `Welcome to V MOTIV!\n\nYour verified customer account is ready.\n\nWith V MOTIV, you enjoy:\n• 100% ${INSPECTION_POINT} Inspected & Certified Pre-Owned Vehicles\n• Doorstep Test Drives with flexible scheduling\n• Instant Car Valuation & Guaranteed Direct Purchase Offers\n• 5-Day Money-Back & Exchange Guarantee\n\nExplore verified inventory or request a car valuation anytime in the V MOTIV mobile app.`,
        },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'CUSTOMER_REGISTERED', entityId: user.id },
      });
      return user;
    });
  }
}

