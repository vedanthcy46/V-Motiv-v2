import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaAdminStore, type AdminActor } from '../src/admin-store.js';
import { PrismaSalesStore, type SalesActor } from '../src/sales-store.js';
import { NotificationService } from '../src/notification/index.js';
import { runOutboxOnce } from '../src/employee-notifications/processor.js';
import { settleOutbox } from './helpers/outbox.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Seller offers go through administration approval, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const sales = new PrismaSalesStore(db, undefined, new NotificationService(db));
  const admin = new PrismaAdminStore(db);
  afterAll(() => db.$disconnect());

  async function person(name: string, role: 'SALES_EXECUTIVE' | 'SUPER_ADMIN') {
    const user = await db.user.create({ data: { firebaseUid: `${name}-${crypto.randomUUID()}`, email: `${name}-${crypto.randomUUID()}@example.test`, displayName: name } });
    await db.employee.create({ data: { userId: user.id, role, active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: [] } });
    return user;
  }

  async function leadWithApprovedInspection() {
    const seller = await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test`, displayName: 'Seller' } });
    const inspector = await person('inspector', 'SALES_EXECUTIVE');
    const lead = await db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'Seller One', sellerPhone: '+919999999999', city: 'Bengaluru', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 20000, expectedPricePaise: 60_000_000n, status: 'QUALIFYING' } });
    const branch = await db.branch.create({ data: { code: `B${crypto.randomUUID().slice(0, 6)}`, name: 'Test Hub', city: 'Bengaluru', address: 'x' } as any });
    const request = await db.inspectionRequest.create({ data: { leadId: lead.id, requestedByEmployeeId: inspector.id, branchId: branch.id, locationType: 'HUB', status: 'REQUESTED' } });
    const assignment = await db.inspectionAssignment.create({ data: { requestId: request.id, inspectorId: inspector.id, assignedById: inspector.id, locationType: 'HUB' } });
    await db.inspectionReport.create({ data: { requestId: request.id, assignmentId: assignment.id, inspectorId: inspector.id, revision: 1, status: 'APPROVED' } });
    return { seller, lead };
  }

  const salesActor = (id: string, roles: SalesActor['roles'] = ['SALES_EXECUTIVE']): SalesActor => ({ userId: id, email: 'sales@example.test', displayName: 'Sales Person', employeeCode: null, roles, branches: [], globalScope: true });
  const adminActor = (id: string): AdminActor => ({ userId: id, firebaseUid: 'f', email: 'a@example.test', displayName: 'Admin', employeeCode: null, designation: null, status: 'ACTIVE', mfaStatus: 'COMPLIANT', roles: ['SUPER_ADMIN'], permissions: ['approval.decide'], branches: [] } as any);

  it('files a request instead of issuing the offer, even for an administrator, and tells the seller only after approval', async () => {
    const requester = await person('sales', 'SALES_EXECUTIVE');
    const approver = await person('boss', 'SUPER_ADMIN');
    const { seller, lead } = await leadWithApprovedInspection();

    const result = await sales.proposeAcquisitionOffer(salesActor(requester.id, ['SUPER_ADMIN']), lead.id, { offerAmountPaise: 55_000_000n, reason: 'Clean car' }) as any;
    expect(result.status).toBe('PENDING_ADMIN_APPROVAL');
    expect(await db.acquisitionOffer.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await db.acquisitionLead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('OFFER_PENDING');
    expect(await db.notification.count({ where: { userId: seller.id } })).toBe(0);

    // A second request for the same seller is refused while one is waiting.
    await expect(sales.proposeAcquisitionOffer(salesActor(requester.id), lead.id, { offerAmountPaise: 56_000_000n })).rejects.toMatchObject({ code: 'OFFER_APPROVAL_ALREADY_PENDING' });

    const request = await db.approvalRequest.findUniqueOrThrow({ where: { id: result.id } });
    expect(request).toMatchObject({ requestType: 'OFFER_REQUEST', status: 'PENDING', requesterId: requester.id });
    // The person who asked cannot approve their own request (a different administrator must).
    await expect(admin.decideApproval({ ...adminActor(requester.id), roles: ['ADMIN'] as any }, request.id, { decision: 'APPROVE', version: request.version, reason: 'Within the pricing band' } as any)).rejects.toMatchObject({ code: 'SELF_APPROVAL_DENIED' });

    await admin.decideApproval(adminActor(approver.id), request.id, { decision: 'APPROVE', version: request.version, reason: 'Within the pricing band' } as any);
    const offer = await db.acquisitionOffer.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(offer).toMatchObject({ status: 'OFFERED', offerAmountPaise: 55_000_000n });
    expect((await db.acquisitionLead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('OFFERED');
    await settleOutbox(db);
    expect(await db.notification.count({ where: { userId: seller.id, eventType: 'ACQUISITION_OFFER_RECEIVED' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: requester.id, eventType: 'ACQUISITION_OFFER_APPROVED' } })).toBe(1);
  });

  it('keeps the seller uninformed when administration rejects, and tells Sales why', async () => {
    const requester = await person('sales', 'SALES_EXECUTIVE');
    const approver = await person('boss', 'SUPER_ADMIN');
    const { seller, lead } = await leadWithApprovedInspection();
    const result = await sales.proposeAcquisitionOffer(salesActor(requester.id), lead.id, { offerAmountPaise: 59_000_000n }) as any;
    const request = await db.approvalRequest.findUniqueOrThrow({ where: { id: result.id } });
    await admin.decideApproval(adminActor(approver.id), request.id, { decision: 'REJECT', version: request.version, reason: 'Too high for this model' } as any);
    expect(await db.acquisitionOffer.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: seller.id } })).toBe(0);
    await settleOutbox(db);
    const told = await db.notification.findFirstOrThrow({ where: { userId: requester.id, eventType: 'ACQUISITION_OFFER_REJECTED' } });
    // The note says it was not approved; the reason itself stays on the approval record, not in the alert.
    expect(told.body).toContain('did not approve');
  });

  it('refuses a request when the car has no approved inspection', async () => {
    const requester = await person('sales', 'SALES_EXECUTIVE');
    const seller = await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test`, displayName: 'Seller' } });
    const lead = await db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'S', sellerPhone: '+919999999999', city: 'Bengaluru', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 20000, status: 'QUALIFYING' } });
    await expect(sales.proposeAcquisitionOffer(salesActor(requester.id), lead.id, { offerAmountPaise: 50_000_000n })).rejects.toMatchObject({ code: 'OFFER_REQUIRES_APPROVED_INSPECTION' });
  });
});
