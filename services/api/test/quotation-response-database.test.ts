import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaCustomerStore } from '../src/customer-store.js';
import { NotificationService } from '../src/notification/index.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Customer answers a retail quotation, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaCustomerStore(db, new NotificationService(db));
  const suffix = crypto.randomUUID().slice(0, 8);
  afterAll(() => db.$disconnect());

  async function fixture(options: { validUntil?: Date; listingStatus?: 'PUBLISHED' | 'RESERVED' } = {}) {
    const customer = await db.user.create({ data: { firebaseUid: `cust-${crypto.randomUUID()}`, email: `cust-${crypto.randomUUID()}@example.test`, displayName: 'Customer' } });
    const author = await db.user.create({ data: { firebaseUid: `auth-${crypto.randomUUID()}`, email: `auth-${crypto.randomUUID()}@example.test`, displayName: 'Advisor' } });
    await db.employee.create({ data: { userId: author.id, role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `ADV-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: [] } });
    const vehicle = await db.vehicle.create({ data: { make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000 } });
    const listing = await db.vehicleListing.create({ data: { vehicleId: vehicle.id, title: `2021 Creta ${suffix}`, pricePaise: 57_500_000n, status: options.listingStatus ?? 'PUBLISHED' } });
    const quote = await db.buyerQuotation.create({ data: {
      listingId: listing.id, customerId: customer.id, employeeId: author.id, basePricePaise: 57_500_000n, discountPaise: 1_500_000n, finalAmountPaise: 56_000_000n,
      status: 'SENT', validUntil: options.validUntil ?? new Date(Date.now() + 7 * 86_400_000),
    } });
    return { customer, author, listing, quote };
  }

  it('accepting reserves the car for the customer and tells the advisor', async () => {
    const f = await fixture();
    const result = await store.respondToQuotation(f.customer.firebaseUid, f.quote.id, { decision: 'ACCEPT' });
    expect(result).toMatchObject({ status: 'ACCEPTED' });
    expect((await db.buyerQuotation.findUniqueOrThrow({ where: { id: f.quote.id } })).acceptedAt).not.toBeNull();
    expect((await db.vehicleListing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe('RESERVED');
    const reservation = await db.vehicleReservation.findFirstOrThrow({ where: { quotationId: f.quote.id } });
    expect(reservation).toMatchObject({ status: 'CONFIRMED', customerId: f.customer.id, reservedById: f.author.id });
    expect(await db.notification.count({ where: { userId: f.author.id, eventType: 'RETAIL_QUOTATION_ACCEPTED' } })).toBe(1);
    // Answering again is harmless, and the opposite answer is refused.
    expect(await store.respondToQuotation(f.customer.firebaseUid, f.quote.id, { decision: 'ACCEPT' })).toMatchObject({ alreadyResponded: true });
    await expect(store.respondToQuotation(f.customer.firebaseUid, f.quote.id, { decision: 'DECLINE' })).rejects.toMatchObject({ code: 'QUOTATION_NOT_OPEN_FOR_RESPONSE' });
    expect(await db.vehicleReservation.count({ where: { quotationId: f.quote.id } })).toBe(1);
  });

  it('lists a customer\'s sent quotations with the right state, and never shows others\'', async () => {
    const f = await fixture();
    const stale = await fixture({ validUntil: new Date(Date.now() - 1000) });
    const list = (await store.quotations(f.customer.firebaseUid)) as any[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: f.quote.id, status: 'SENT', canRespond: true, finalAmountPaise: '56000000', discountPaise: '1500000' });
    expect(list[0].listing.title).toContain('Creta');
    const old = (await store.quotation(stale.customer.firebaseUid, stale.quote.id)) as any;
    expect(old).toMatchObject({ status: 'EXPIRED', canRespond: false });
    await expect(store.quotation(f.customer.firebaseUid, stale.quote.id)).rejects.toMatchObject({ code: 'QUOTATION_NOT_FOUND' });
  });

  it('declining records the reason, holds nothing and tells the advisor', async () => {
    const f = await fixture();
    await store.respondToQuotation(f.customer.firebaseUid, f.quote.id, { decision: 'DECLINE', notes: 'Found a cheaper one' });
    const quote = await db.buyerQuotation.findUniqueOrThrow({ where: { id: f.quote.id } });
    expect(quote).toMatchObject({ status: 'DECLINED', customerResponseNotes: 'Found a cheaper one' });
    expect((await db.vehicleListing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe('PUBLISHED');
    expect(await db.vehicleReservation.count({ where: { quotationId: f.quote.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: f.author.id, eventType: 'RETAIL_QUOTATION_DECLINED' } })).toBe(1);
  });

  it('refuses an expired quotation, a car someone else reserved, and another customer\'s quotation', async () => {
    const expired = await fixture({ validUntil: new Date(Date.now() - 1000) });
    await expect(store.respondToQuotation(expired.customer.firebaseUid, expired.quote.id, { decision: 'ACCEPT' })).rejects.toMatchObject({ code: 'QUOTATION_EXPIRED' });
    expect((await db.buyerQuotation.findUniqueOrThrow({ where: { id: expired.quote.id } })).status).toBe('EXPIRED');

    const taken = await fixture({ listingStatus: 'RESERVED' });
    await expect(store.respondToQuotation(taken.customer.firebaseUid, taken.quote.id, { decision: 'ACCEPT' })).rejects.toMatchObject({ code: 'VEHICLE_NO_LONGER_AVAILABLE' });
    expect((await db.buyerQuotation.findUniqueOrThrow({ where: { id: taken.quote.id } })).status).toBe('SENT');

    const mine = await fixture();
    const other = await fixture();
    await expect(store.respondToQuotation(other.customer.firebaseUid, mine.quote.id, { decision: 'ACCEPT' })).rejects.toMatchObject({ code: 'QUOTATION_NOT_FOUND' });
  });
});
