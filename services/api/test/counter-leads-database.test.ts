import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaSalesStore, type SalesActor } from '../src/sales-store.js';
import { isWalkInSeller } from '../src/in-person-acceptance.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Walk-in seller and buyer leads get an app account, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const sales = new PrismaSalesStore(db);
  afterAll(() => db.$disconnect());
  const unique = () => crypto.randomUUID().slice(0, 8);
  const phone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;

  async function advisor(): Promise<SalesActor> {
    const user = await db.user.create({ data: { firebaseUid: `adv-${crypto.randomUUID()}`, email: `adv-${unique()}@example.test`, displayName: 'Advisor' } });
    await db.employee.create({ data: { userId: user.id, role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${unique()}`.toUpperCase(), permissions: [] } });
    return { userId: user.id, email: user.email, displayName: 'Advisor', employeeCode: null, roles: ['SALES_EXECUTIVE'], branches: [], globalScope: true };
  }
  const seller = (email: string, ph = phone()) => ({ sellerName: 'Walk-in Seller', sellerPhone: ph, sellerEmail: email, city: 'Bengaluru', pincode: '560001', make: 'Hyundai', model: 'i20', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 25000 });

  it('seller lead: creates the account, emails the app link, and keeps in-person acceptance until they sign in', async () => {
    const actor = await advisor();
    const email = `seller-${unique()}@gmail.com`;
    const lead = await sales.createManualSellerLead(actor, seller(email)) as any;
    expect(lead.customerAccount).toMatchObject({ created: true, appInviteEmailed: true, email });
    const row = await db.acquisitionLead.findUniqueOrThrow({ where: { id: lead.id }, include: { user: true } });
    expect(row.user.email).toBe(email);
    expect(isWalkInSeller(row.user)).toBe(true);
    expect(await db.emailOutbox.count({ where: { recipient: email, eventKey: `app-invite/${row.user.id}` } })).toBe(1);

    // A second car from the same person: same account, no second invitation, still one user.
    const again = await sales.createManualSellerLead(actor, seller(email, row.user.phone!)) as any;
    expect(again.customerAccount).toMatchObject({ created: false, existing: true });
    expect((await db.acquisitionLead.findUniqueOrThrow({ where: { id: again.id } })).userId).toBe(row.user.id);

    // After they sign in to the app the account is theirs, so acceptance must happen in the app.
    await db.user.update({ where: { id: row.user.id }, data: { firebaseUid: `google-${unique()}` } });
    expect(isWalkInSeller((await db.user.findUniqueOrThrow({ where: { id: row.user.id } })))).toBe(false);
  });

  it('seller lead: an existing app customer is reused, never duplicated, and not emailed', async () => {
    const actor = await advisor();
    const member = await db.user.create({ data: { firebaseUid: `google-${unique()}`, email: `m-${unique()}@gmail.com`, phone: phone(), displayName: 'Member' } });
    const lead = await sales.createManualSellerLead(actor, seller(member.email, member.phone!)) as any;
    expect(lead.customerAccount).toMatchObject({ created: false, existing: true, appInviteEmailed: false });
    expect((await db.acquisitionLead.findUniqueOrThrow({ where: { id: lead.id } })).userId).toBe(member.id);
  });

  async function listing() {
    const vehicle = await db.vehicle.create({ data: { make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000 } });
    return db.vehicleListing.create({ data: { vehicleId: vehicle.id, title: `2021 Creta ${unique()}`, pricePaise: 57_500_000n, status: 'PUBLISHED' } });
  }

  it('buyer lead: creates the account and the enquiry, and a repeat for the same car is the same lead', async () => {
    const actor = await advisor();
    const car = await listing();
    const email = `buyer-${unique()}@gmail.com`;
    const input = { buyerName: 'Walk-in Buyer', buyerPhone: phone(), buyerEmail: email, listingId: car.id };
    const first = await sales.createManualBuyerLead(actor, input) as any;
    expect(first.customerAccount).toMatchObject({ created: true, appInviteEmailed: true });
    expect(first).toMatchObject({ alreadyExisted: false, status: 'RECEIVED' });
    const row = await db.purchaseEnquiry.findUniqueOrThrow({ where: { id: first.id }, include: { user: true } });
    expect(row.user.email).toBe(email);
    expect(row.listingId).toBe(car.id);

    const again = await sales.createManualBuyerLead(actor, input) as any;
    expect(again).toMatchObject({ id: first.id, alreadyExisted: true });
    expect(again.customerAccount).toMatchObject({ created: false, existing: true });
    expect(await db.purchaseEnquiry.count({ where: { userId: row.user.id, listingId: car.id } })).toBe(1);
  });

  it('buyer lead: refuses a car that is not for sale', async () => {
    const actor = await advisor();
    const car = await listing();
    await db.vehicleListing.update({ where: { id: car.id }, data: { status: 'SOLD' } });
    await expect(sales.createManualBuyerLead(actor, { buyerName: 'B', buyerPhone: phone(), buyerEmail: `b-${unique()}@gmail.com`, listingId: car.id })).rejects.toMatchObject({ code: 'LISTING_NOT_FOUND' });
  });
});
