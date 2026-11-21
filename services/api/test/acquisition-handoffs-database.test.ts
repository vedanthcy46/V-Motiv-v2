import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaCustomerStore } from '../src/customer-store.js';
import { PrismaFinanceStore } from '../src/finance-store.js';
import { PrismaInspectionStore } from '../src/inspection-store.js';
import { NotificationService } from '../src/notification/index.js';
import { runOutboxOnce } from '../src/employee-notifications/processor.js';
import { settleOutbox } from './helpers/outbox.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Hand-offs from offer accepted to ready to pay, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const notifications = new NotificationService(db);
  const inspection = new PrismaInspectionStore(db, undefined, notifications);
  const finance = new PrismaFinanceStore(db, notifications);
  const customers = new PrismaCustomerStore(db, notifications);
  const suffix = crypto.randomUUID().slice(0, 8);
  const branchCity = `City${suffix}`;
  let branchId: string;
  let opsUserId: string;
  let financeUserId: string;
  let adminUserId: string;

  async function staff(name: string, role: 'OPERATIONS_MANAGER' | 'FINANCE' | 'ADMIN', permissions: string[] = [], withBranch = true) {
    const roleRow = await db.role.findUniqueOrThrow({ where: { key: role } });
    const user = await db.user.create({ data: { firebaseUid: `${name}-${suffix}`, email: `${name}-${suffix}@example.test`, displayName: name } });
    await db.employee.create({ data: {
      userId: user.id, role, active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `${name}-${suffix}`.toUpperCase(), permissions,
      roleAssignments: { create: { roleId: roleRow.id } }, ...(withBranch ? { branchAssignments: { create: { branchId } } } : {}),
    } });
    return user.id;
  }

  async function acceptedCase(options: { walkIn?: boolean } = {}) {
    const seller = await db.user.create({ data: { firebaseUid: `seller-${crypto.randomUUID()}`, email: `seller-${crypto.randomUUID()}@example.test`, displayName: 'Seller' } });
    const lead = await db.acquisitionLead.create({ data: {
      userId: seller.id, sellerName: 'Seller One', sellerPhone: '+919999999999', city: branchCity, pincode: '560001', make: 'Honda', model: 'City',
      manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 20000, status: 'OFFERED',
      // A walk-in lead has no inspection request; it belongs to a branch through its assignment.
      ...(options.walkIn ? { assignments: { create: { employeeId: adminUserId, branchId, reason: 'MANUAL_ENTRY_BY_SALES' } } } : {}),
    } });
    const offer = await db.acquisitionOffer.create({ data: { leadId: lead.id, offerAmountPaise: 50_000_000n, validUntil: new Date(Date.now() + 86_400_000), status: 'OFFERED' } });
    return { seller, lead, offer };
  }

  beforeAll(async () => {
    await db.$connect();
    await ensureAdminCatalog(db);
    branchId = (await db.branch.create({ data: { code: `H-${suffix}`, name: 'Hand-off Hub', city: branchCity } })).id;
    adminUserId = await staff('admin', 'ADMIN');
    opsUserId = await staff('ops', 'OPERATIONS_MANAGER');
    financeUserId = await staff('fin', 'FINANCE', ['finance.settlement.read', 'finance.settlement.prepare']);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('tells Operations when a seller accepts an offer', async () => {
    const { seller, offer } = await acceptedCase();
    await customers.acceptOffer(seller.firebaseUid, offer.id, offer.version);
    await settleOutbox(db);
    const note = await db.notification.findFirst({ where: { userId: opsUserId, eventType: 'ACQUISITION_OFFER_ACCEPTED_STAFF' }, orderBy: { createdAt: 'desc' } });
    expect(note?.body).toContain('Honda City');
  });

  it('verifies a document in one step, and tells Finance when the last one is verified', async () => {
    const { seller, offer } = await acceptedCase();
    await customers.acceptOffer(seller.firebaseUid, offer.id, offer.version);
    const kase = await db.acquisitionCase.findFirstOrThrow({ where: { offerId: offer.id }, include: { documents: true } });
    const ops = await inspection.actor(`admin-${suffix}`);
    const before = await db.notification.count({ where: { userId: financeUserId, eventType: 'FINANCE_READY_FOR_PAYMENT' } });

    for (const doc of kase.documents) {
      // REQUESTED -> VERIFIED directly (this used to need Received, then Under review, then Verified)
      await inspection.updateAcquisitionDocument(ops, kase.id, { documentType: doc.documentType, status: 'VERIFIED' });
    }
    const ready = await db.acquisitionCase.findUniqueOrThrow({ where: { id: kase.id } });
    expect(ready.status).toBe('SETTLEMENT_READY');
    await settleOutbox(db);
    const after = await db.notification.count({ where: { userId: financeUserId, eventType: 'FINANCE_READY_FOR_PAYMENT' } });
    expect(after).toBe(before + 1);
  });

  it('shows a walk-in lead (no inspection request) to Operations and Finance staff of its branch', async () => {
    const { lead, offer } = await acceptedCase({ walkIn: true });
    const kase = await db.acquisitionCase.create({ data: { leadId: lead.id, offerId: offer.id, sellerAcceptedByUserId: lead.userId, acceptedAt: new Date(), status: 'SETTLEMENT_READY' } });
    const opsActor = await inspection.actor(`ops-${suffix}`);
    const financeActor = await finance.actor(`fin-${suffix}`);
    // Operations' own view
    expect((await inspection.acquisitionCases(opsActor)).some(c => c.id === kase.id)).toBe(true);
    expect((await finance.settlements(financeActor)).some(c => c.id === kase.id)).toBe(true);

    // Staff of another branch still do not see it.
    const otherBranch = await db.branch.create({ data: { code: `X-${suffix}`, name: 'Elsewhere', city: 'Elsewhere' } });
    const roleRow = await db.role.findUniqueOrThrow({ where: { key: 'FINANCE' } });
    const stranger = await db.user.create({ data: { firebaseUid: `stranger-${suffix}`, email: `stranger-${suffix}@example.test`, displayName: 'Stranger' } });
    await db.employee.create({ data: { userId: stranger.id, role: 'FINANCE', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `STR-${suffix}`.toUpperCase(), permissions: ['finance.settlement.read'], roleAssignments: { create: { roleId: roleRow.id } }, branchAssignments: { create: { branchId: otherBranch.id } } } });
    const strangerActor = await finance.actor(`stranger-${suffix}`);
    expect((await finance.settlements(strangerActor)).some(c => c.id === kase.id)).toBe(false);
  });
});
