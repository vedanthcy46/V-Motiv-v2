import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaSalesStore } from '../src/sales-store.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) throw new Error('Sales integration tests require the isolated local vmotiv_v2_test database.');

describe.skipIf(!url)('Sales CRM foundation with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaSalesStore(db); const suffix = crypto.randomUUID().slice(0, 8); let actor: Awaited<ReturnType<typeof store.actor>>; let inScopeLead = ''; let outScopeLead = ''; let buyerLead = ''; let outsideBuyerLead = ''; let inScopeListing = ''; let outsideListing = '';
  beforeAll(async () => {
    await db.$connect(); await ensureAdminCatalog(db);
    const [role, branch] = await Promise.all([db.role.findUniqueOrThrow({ where: { key: 'SALES_EXECUTIVE' } }), db.branch.create({ data: { code: `S-${suffix}`, name: 'Sales Test', city: 'Bengaluru' } })]);
    const user = await db.user.create({ data: { firebaseUid: `sales-${suffix}`, email: `sales-${suffix}@example.test`, displayName: 'Sales Test' } });
    await db.employee.create({ data: { userId: user.id, role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', roleAssignments: { create: { roleId: role.id } }, branchAssignments: { create: { branchId: branch.id } } } });
    const seller = await db.user.create({ data: { firebaseUid: `seller-${suffix}`, email: `seller-${suffix}@example.test` } });
    const [inScope, outScope] = await Promise.all([
      db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'Bengaluru Seller', sellerPhone: '+919876543210', city: 'Bengaluru', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'AUTOMATIC', odometerKm: 25000 } }),
      db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'Chennai Seller', sellerPhone: '+919876543211', city: 'Chennai', pincode: '600001', make: 'Tata', model: 'Nexon', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 19000 } }),
    ]);
    inScopeLead = inScope.id; outScopeLead = outScope.id; actor = await store.actor(`sales-${suffix}`);
    const [inVehicle, outVehicle] = await Promise.all([
      db.vehicle.create({ data: { make: 'Honda', model: 'Amaze', variant: 'VX', manufacturingYear: 2022, fuelType: 'PETROL', transmission: 'CVT', odometerKm: 12000, city: 'Bengaluru' } }),
      db.vehicle.create({ data: { make: 'Hyundai', model: 'i20', variant: 'Sportz', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 22000, city: 'Chennai' } }),
    ]);
    const [inListing, outListing] = await Promise.all([
      db.vehicleListing.create({ data: { vehicleId: inVehicle.id, title: 'Bengaluru Honda Amaze', pricePaise: 80000000n, status: 'PUBLISHED', publishedAt: new Date() } }),
      db.vehicleListing.create({ data: { vehicleId: outVehicle.id, title: 'Chennai Hyundai i20', pricePaise: 70000000n, status: 'PUBLISHED', publishedAt: new Date() } }),
    ]);
    const [buyer, otherBuyer] = await Promise.all([
      db.purchaseEnquiry.create({ data: { userId: seller.id, listingId: inListing.id, message: 'I would like to arrange a test drive.' } }),
      db.purchaseEnquiry.create({ data: { userId: seller.id, listingId: outListing.id, message: 'Please share vehicle availability.' } }),
    ]);
    buyerLead = buyer.id; outsideBuyerLead = otherBuyer.id;
    inScopeListing = inListing.id; outsideListing = outListing.id;
  });
  afterAll(async () => { await db.$disconnect(); });
  it('limits a Sales Executive to their branch queue and forbids cross-branch ID guessing', async () => {
    const page = await store.sellerLeads(actor, { page: 1, limit: 50 }) as { items: Array<{ id: string }> };
    expect(page.items.map(item => item.id)).toContain(inScopeLead); expect(page.items.map(item => item.id)).not.toContain(outScopeLead);
    await expect(store.sellerLead(actor, outScopeLead)).rejects.toMatchObject({ status: 404, code: 'SELLER_LEAD_NOT_FOUND' });
  });
  it('claims a real queue lead once and records the seller qualification workflow', async () => {
    await store.claimSellerLead(actor, inScopeLead);
    await expect(store.claimSellerLead(actor, inScopeLead)).rejects.toMatchObject({ status: 409, code: 'SELLER_LEAD_ALREADY_ASSIGNED' });
    await store.updateSellerLeadStatus(actor, inScopeLead, { status: 'QUALIFYING', note: 'Customer requested a valuation call.' });
    await store.createInteraction(actor, inScopeLead, { channel: 'CALL', outcome: 'CONNECTED', notes: 'Verified availability for inspection.' });
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const task = await store.createTask(actor, inScopeLead, { type: 'INSPECTION_COORDINATION', priority: 'HIGH', dueAt, details: 'Confirm a suitable inspection slot.' }) as { id: string };
    await store.completeTask(actor, task.id, { actualOutcome: 'Customer selected an afternoon appointment.' });
    const request = await store.requestInspection(actor, inScopeLead, { locationType: 'HUB', notes: 'Customer will bring original RC and insurance.' }) as { id: string; status: string };
    expect(request.status).toBe('REQUESTED');
    expect(await db.acquisitionLead.findUniqueOrThrow({ where: { id: inScopeLead } })).toMatchObject({ status: 'INSPECTION_SCHEDULED' });
    expect(await db.leadInteraction.count({ where: { leadId: inScopeLead } })).toBe(1);
    expect(await db.salesTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'COMPLETED' });
    expect(await db.auditEvent.count({ where: { entityId: request.id, action: 'INSPECTION_REQUESTED_BY_SALES' } })).toBe(1);
  });
  it('uses existing inventory and buyer enquiries without cross-branch data exposure', async () => {
    const [buyers, inventory] = await Promise.all([store.buyerLeads(actor, { page: 1, limit: 50 }), store.inventory(actor, { page: 1, limit: 50 })]) as [{ items: Array<{ id: string }> }, { items: Array<{ id: string }> }];
    expect(buyers.items.map(item => item.id)).toContain(buyerLead); expect(buyers.items.map(item => item.id)).not.toContain(outsideBuyerLead);
    expect(inventory.items.map(item => item.id)).toContain(inScopeListing); expect(inventory.items.map(item => item.id)).not.toContain(outsideListing);
    await store.updateBuyerLeadStatus(actor, buyerLead, 'IN_REVIEW');
    await expect(store.updateBuyerLeadStatus(actor, outsideBuyerLead, 'IN_REVIEW')).rejects.toMatchObject({ status: 404, code: 'BUYER_LEAD_NOT_FOUND' });
    expect(await db.purchaseEnquiry.findUniqueOrThrow({ where: { id: buyerLead } })).toMatchObject({ status: 'IN_REVIEW' });
  });
});
