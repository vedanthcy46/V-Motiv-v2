import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaFinanceStore } from '../src/finance-store.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Finance integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Seller payout approval with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaFinanceStore(db);
  const suffix = crypto.randomUUID().slice(0, 8);
  const uid = (name: string) => `${name}-${suffix}`;
  let maker: Awaited<ReturnType<typeof store.actor>>;
  let approver: Awaited<ReturnType<typeof store.actor>>;
  let other: Awaited<ReturnType<typeof store.actor>>;

  async function employee(name: string, permissions: string[]) {
    const adminRole = await db.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
    const user = await db.user.create({ data: { firebaseUid: uid(name), email: `${name}-${suffix}@example.test`, displayName: name } });
    await db.employee.create({ data: {
      userId: user.id, role: 'ADMIN', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `${name}-${suffix}`.toUpperCase(),
      permissions, roleAssignments: { create: { roleId: adminRole.id } },
    } });
    return store.actor(uid(name));
  }

  /** An accepted offer whose documents are all verified: the point where finance takes over. */
  async function readyCase() {
    const seller = await db.user.create({ data: { firebaseUid: `seller-${crypto.randomUUID()}`, email: `seller-${crypto.randomUUID()}@example.test`, displayName: 'Seller' } });
    const lead = await db.acquisitionLead.create({ data: {
      userId: seller.id, sellerName: 'Seller One', sellerPhone: '+919999999999', city: 'Bengaluru', pincode: '560001',
      make: 'Maruti Suzuki', model: 'Swift', manufacturingYear: 2019, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 40000, status: 'ACCEPTED',
    } });
    const offer = await db.acquisitionOffer.create({ data: { leadId: lead.id, offerAmountPaise: 45_000_000n, validUntil: new Date(Date.now() + 86_400_000), status: 'ACCEPTED', acceptedAt: new Date() } });
    const acquisitionCase = await db.acquisitionCase.create({ data: {
      leadId: lead.id, offerId: offer.id, sellerAcceptedByUserId: seller.id, acceptedAt: new Date(), status: 'SETTLEMENT_READY',
      documents: { create: [{ documentType: 'SELLER_IDENTITY', status: 'VERIFIED' }, { documentType: 'VEHICLE_REGISTRATION', status: 'VERIFIED' }] },
    } });
    return acquisitionCase.id;
  }

  const prepare = (actor: typeof maker, caseId: string) => store.preparePayout(actor, caseId, {
    beneficiaryName: 'Seller One', beneficiaryAccountMasked: 'XXXX 1234', paymentMethod: 'NEFT', idempotencyKey: crypto.randomUUID(),
  });

  beforeAll(async () => {
    await db.$connect();
    await ensureAdminCatalog(db);
    maker = await employee('maker', ['finance.portal.access', 'finance.settlement.read', 'finance.settlement.prepare', 'finance.payout.approve', 'finance.payout.execute']);
    approver = await employee('approver', ['finance.portal.access', 'finance.settlement.read', 'finance.payout.approve', 'finance.payout.execute', 'finance.payout.verify']);
    other = await employee('other', ['finance.portal.access', 'finance.settlement.read', 'finance.payout.execute', 'finance.payout.verify']);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('sends a prepared payout straight to approval, with no separate submit step', async () => {
    const caseId = await readyCase();
    const payout = await prepare(maker, caseId);
    expect(payout.status).toBe('APPROVAL_PENDING');
  });

  it('is approved by someone else, then paid and confirmed in one step', async () => {
    const caseId = await readyCase();
    const payout = await prepare(maker, caseId);

    await expect(store.approvePayout(maker, payout.id, undefined, 'APPROVE', 'ok')).rejects.toMatchObject({ code: 'PAYOUT_SELF_APPROVAL_DENIED' });
    const approved = await store.approvePayout(approver, payout.id, undefined, 'APPROVE', 'Checked against the signed agreement');
    expect(approved.status).toBe('APPROVED');

    await expect(store.payPayout(maker, approved.id, undefined, { bankReference: `UTR${suffix}A` })).rejects.toMatchObject({ code: 'PAYOUT_EXECUTION_SEPARATION_REQUIRED' });
    await expect(store.payPayout(approver, approved.id, undefined, { bankReference: '   ' })).rejects.toMatchObject({ code: 'BANK_REFERENCE_REQUIRED' });

    const paid = await store.payPayout(approver, approved.id, undefined, { bankReference: `UTR${suffix}B` });
    expect(paid.status).toBe('PAID_VERIFIED');

    const settled = await db.acquisitionCase.findUniqueOrThrow({ where: { id: caseId }, include: { settlement: true } });
    expect(settled.settlementStatus).toBe('PAYMENT_VERIFIED');
    expect(settled.settlement?.status).toBe('PAYMENT_VERIFIED');
    const evidence = await db.financePaymentEvidence.findMany({ where: { payoutInstructionId: paid.id } });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.evidenceUri).toBe(`bank-reference:UTR${suffix}B`); // no made-up evidence link

    // Saving twice (a double click, a retry) is harmless.
    const again = await store.payPayout(approver, approved.id, undefined, { bankReference: `UTR${suffix}B` });
    expect(again.status).toBe('PAID_VERIFIED');
  });

  it('does not let the same bank reference pay two payouts, or pay an unapproved one', async () => {
    const first = await prepare(maker, await readyCase());
    await expect(store.payPayout(other, first.id, undefined, { bankReference: `UTR${suffix}C` })).rejects.toMatchObject({ code: 'PAYOUT_NOT_EXECUTABLE' });
    const approvedFirst = await store.approvePayout(approver, first.id, undefined, 'APPROVE', 'ok');
    await store.payPayout(other, approvedFirst.id, undefined, { bankReference: `UTR${suffix}D` });

    const second = await prepare(maker, await readyCase());
    const approvedSecond = await store.approvePayout(approver, second.id, undefined, 'APPROVE', 'ok');
    await expect(store.payPayout(other, approvedSecond.id, undefined, { bankReference: `UTR${suffix}D` })).rejects.toMatchObject({ code: 'BANK_REFERENCE_ALREADY_EXISTS' });
  });

  it('keeps the older two-step path working for payouts already in flight', async () => {
    const payout = await prepare(maker, await readyCase());
    const approved = await store.approvePayout(approver, payout.id, undefined, 'APPROVE', 'ok');
    const executed = await store.executePayout(approver, approved.id, undefined, `UTR${suffix}E`);
    expect(executed.status).toBe('RECONCILIATION_PENDING');
    await expect(store.verifyPayout(approver, executed.id, undefined, { kind: 'MANUAL_BANK_CONFIRMATION', reference: `UTR${suffix}E`, observedAt: new Date() })).rejects.toMatchObject({ code: 'PAYOUT_RECONCILIATION_SEPARATION_REQUIRED' });
    const verified = await store.verifyPayout(other, executed.id, undefined, { kind: 'MANUAL_BANK_CONFIRMATION', reference: `UTR${suffix}E`, observedAt: new Date() });
    expect(verified.status).toBe('PAID_VERIFIED');
  });
});
