import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaInspectionStore } from '../src/inspection-store.js';
import { templateFor } from '../src/inspection-template.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) throw new Error('Inspection integration tests require isolated vmotiv_v2_test.');

describe.skipIf(!url)('Inspection lifecycle with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaInspectionStore(db); const suffix = crypto.randomUUID().slice(0, 8); let operations: Awaited<ReturnType<typeof store.actor>>; let inspector: Awaited<ReturnType<typeof store.actor>>; let reviewer: Awaited<ReturnType<typeof store.actor>>; let reviewerRoleId = ''; let requestId = '';
  beforeAll(async () => {
    await db.$connect(); await ensureAdminCatalog(db);
    const [branch, operationsRole, inspectorRole, reviewerRole] = await Promise.all([db.branch.create({ data: { code: `I-${suffix}`, name: 'Inspection Test', city: 'Bengaluru' } }), db.role.findUniqueOrThrow({ where: { key: 'OPERATIONS_MANAGER' } }), db.role.findUniqueOrThrow({ where: { key: 'INSPECTOR' } }), db.role.findUniqueOrThrow({ where: { key: 'INSPECTION_REVIEWER' } })]); reviewerRoleId = reviewerRole.id;
    const makeEmployee = async (uid: string, role: 'OPERATIONS_MANAGER' | 'INSPECTOR' | 'INSPECTION_REVIEWER', roleId: string) => { const user = await db.user.create({ data: { firebaseUid: uid, email: `${uid}@example.test` } }); await db.employee.create({ data: { userId: user.id, role, active: true, status: 'ACTIVE', roleAssignments: { create: { roleId } }, branchAssignments: { create: { branchId: branch.id } } } }); return user; };
    const [opUser, inspectorUser, reviewerUser, seller] = await Promise.all([makeEmployee(`ops-${suffix}`, 'OPERATIONS_MANAGER', operationsRole.id), makeEmployee(`inspector-${suffix}`, 'INSPECTOR', inspectorRole.id), makeEmployee(`reviewer-${suffix}`, 'INSPECTION_REVIEWER', reviewerRole.id), db.user.create({ data: { firebaseUid: `seller-${suffix}`, email: `seller-${suffix}@example.test` } })]);
    const lead = await db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'Inspection Seller', sellerPhone: '+919876543210', city: 'Bengaluru', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'HYBRID', transmission: 'AUTOMATIC', odometerKm: 40000, status: 'QUALIFYING' } });
    const request = await db.inspectionRequest.create({ data: { leadId: lead.id, requestedByEmployeeId: opUser.id, branchId: branch.id, locationType: 'HUB', status: 'REQUESTED' } }); requestId = request.id;
    [operations, inspector, reviewer] = await Promise.all([store.actor(`ops-${suffix}`), store.actor(`inspector-${suffix}`), store.actor(`reviewer-${suffix}`)]);
    expect(inspector.userId).toBe(inspectorUser.id); expect(reviewer.userId).toBe(reviewerUser.id);
  });
  afterAll(async () => { await db.$disconnect(); });
  it('enforces Operations assignment, inspector draft/submission, and independent approval', async () => {
    const assignment = await store.assign(operations, requestId, { inspectorId: inspector.userId, locationType: 'HUB' }) as { id: string };
    const rescheduled = await store.reschedule(operations, requestId, { scheduledAt: new Date('2030-01-01T10:00:00.000Z'), locationType: 'HUB', reason: 'Seller requested a different slot.' });
    expect(rescheduled).toMatchObject({ status: 'RESCHEDULED' });
    expect((await store.assignments(inspector) as Array<{ id: string }>).map(item => item.id)).toContain(assignment.id);
    const report = await store.start(inspector, assignment.id) as { id: string; recordVersion: number };
    const template = templateFor('vehicle-standard', 2)!;
    const draft = await store.saveDraft(inspector, report.id, { recordVersion: report.recordVersion, identity: { registrationNumber: 'KA01AB1234', odometerKm: 40125 }, answers: template.items.filter(item => item.required && (!item.applicableFuel || (item.applicableFuel as any).includes('PETROL'))).map(item => ({ itemKey: item.key, status: 'PASS' as const, value: item.key === 'identity.registration' ? 'KA01AB1234' : undefined })), defects: [{ category: 'EXTERIOR', severity: 'MINOR', description: 'Light scratch on rear bumper.' }] }) as { recordVersion: number };
    await expect(store.decide(inspector, report.id, { decision: 'APPROVE' })).rejects.toMatchObject({ status: 403 });
    await store.submit(inspector, report.id, draft.recordVersion);
    expect((await store.reviewQueue(reviewer) as Array<{ id: string }>).map(item => item.id)).toContain(report.id);
    await db.employeeRoleAssignment.create({ data: { employeeId: inspector.userId, roleId: reviewerRoleId } });
    const dualRoleInspector = await store.actor(`inspector-${suffix}`);
    await expect(store.decide(dualRoleInspector, report.id, { decision: 'APPROVE' })).rejects.toMatchObject({ status: 403, code: 'INSPECTION_SELF_APPROVAL_DENIED' });
    const decision = await store.decide(reviewer, report.id, { decision: 'APPROVE' });
    expect(decision).toMatchObject({ status: 'APPROVED' });
    expect(await db.inspectionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: 'APPROVED' });
  });
});
