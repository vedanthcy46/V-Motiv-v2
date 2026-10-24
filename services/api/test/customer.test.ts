import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { PrismaIdentityStore } from '../src/identity-store.js';
import { PrismaCustomerStore } from '../src/customer-store.js';
import { createApp } from '../src/app.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Customer integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('customer mobile API against PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const identities = new PrismaIdentityStore(db); const customers = new PrismaCustomerStore(db);
  const uid = `mobile-${crypto.randomUUID()}`; let userId = ''; let vehicleId = ''; let listingId = ''; let driveId = ''; let cityId = '';
  const token = { uid, email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' } } as DecodedIdToken;
  const app = createApp({ verify: async () => token, store: identities, customer: customers, webOrigin: 'http://localhost:3100' });
  const authorized = () => ({ get: (path: string) => request(app).get(path).set('Authorization', 'Bearer test'), post: (path: string) => request(app).post(path).set('Authorization', 'Bearer test'), put: (path: string) => request(app).put(path).set('Authorization', 'Bearer test'), patch: (path: string) => request(app).patch(path).set('Authorization', 'Bearer test'), delete: (path: string) => request(app).delete(path).set('Authorization', 'Bearer test') });

  beforeAll(async () => {
    await db.$connect(); const city = await db.supportedCity.upsert({ where: { name: 'Bengaluru' }, update: { active: true }, create: { name: 'Bengaluru' } }); cityId = city.id; const user = await identities.sync({ uid, email: token.email!, name: 'Mobile Customer', secondFactor: false }); userId = user.id;
    const vehicle = await db.vehicle.create({ data: { make: 'Tata', model: 'Nexon', variant: 'XZ+', manufacturingYear: 2023, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 12000, city: 'Bengaluru', inspectionSummary: 'Inspection summary published by operations.', features: ['Rear camera'], verifiedTags: ['INSPECTED'] } }); vehicleId = vehicle.id;
    const listing = await db.vehicleListing.create({ data: { vehicleId, title: '2023 Tata Nexon XZ+', pricePaise: 95000000n, status: 'PUBLISHED', publishedAt: new Date() } }); listingId = listing.id;
  });
  afterAll(async () => {
    await db.testDriveRequest.deleteMany({ where: { userId } }); await db.wishlistItem.deleteMany({ where: { userId } }); await db.acquisitionLead.deleteMany({ where: { userId } }); await db.purchaseEnquiry.deleteMany({ where: { userId } }); await db.supportCase.deleteMany({ where: { userId } }); await db.savedSearch.deleteMany({ where: { userId } });
    await db.vehicleListing.deleteMany({ where: { id: listingId } }); await db.vehicle.deleteMany({ where: { id: vehicleId } });
    await db.emailOutbox.deleteMany({ where: { userId } }); await db.$executeRaw`DELETE FROM "PrivacyRequest" WHERE "userId" = ${userId}::uuid`; await db.auditEvent.deleteMany({ where: { actorId: userId } }); await db.user.deleteMany({ where: { id: userId } }); await db.supportedCity.deleteMany({ where: { id: cityId } }); await db.$disconnect();
  });

  it('lists only published inventory and maintains the signed-in customer wishlist', async () => {
    const inventory = await authorized().get('/api/v1/inventory?search=Nexon');
    expect(inventory.status).toBe(200); expect(inventory.body.items).toHaveLength(1); expect(inventory.body.items[0].pricePaise).toBe('95000000'); expect(inventory.body.items[0].vehicle.verifiedTags).toContain('INSPECTED'); expect(inventory.body.items[0].isWishlisted).toBe(false);
    expect((await authorized().put(`/api/v1/me/wishlist/${listingId}`)).status).toBe(204);
    const wishlist = await authorized().get('/api/v1/me/wishlist'); expect(wishlist.body).toHaveLength(1); expect(wishlist.body[0].isWishlisted).toBe(true);
  });

  it('validates and records a customer-owned selling request and processes offer lifecycle', async () => {
    expect((await authorized().post('/api/v1/acquisition-leads').send({ make: 'Tata' })).body.code).toBe('INVALID_INPUT');
    const unsupported = await authorized().post('/api/v1/acquisition-leads').send({ sellerName: 'Mobile Customer', sellerPhone: '+919876543210', city: 'Not Configured', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 42000 }); expect(unsupported.body.code).toBe('CITY_NOT_SUPPORTED');
    const result = await authorized().post('/api/v1/acquisition-leads').send({ sellerName: 'Mobile Customer', sellerPhone: '+919876543210', city: 'Bengaluru', pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 42000, expectedPricePaise: 72500000, ownershipCount: 1, accidentHistory: 'NO', serviceHistory: 'COMPLETE', sellerNotes: 'Single owner and regularly maintained.', inspectionDate: '2026-11-05', inspectionTimeSlot: '10:00-12:00', inspectionLocationType: 'HUB' });
    expect(result.status).toBe(201); expect(result.body.status).toBe('INSPECTION_SCHEDULED'); expect(result.body.expectedPricePaise).toBe('72500000');
    const leadId = result.body.id;
    const retrieved = await authorized().get(`/api/v1/me/acquisition-leads/${leadId}`);
    expect(retrieved.status).toBe(200); expect(retrieved.body.make).toBe('Honda');

    // Create a mock offer on the lead
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 3);
    const offer = await db.acquisitionOffer.create({ data: { leadId, offerAmountPaise: 71000000n, validUntil, status: 'OFFERED', version: 1 } });
    
    // Concurrency version check
    const mismatch = await authorized().patch(`/api/v1/acquisition-offers/${offer.id}/accept`).send({ version: 99 });
    expect(mismatch.status).toBe(409); expect(mismatch.body.code).toBe('VERSION_MISMATCH');

    // Successful accept
    const accepted = await authorized().patch(`/api/v1/acquisition-offers/${offer.id}/accept`).send({ version: 1 });
    expect(accepted.status).toBe(200); expect(accepted.body.status).toBe('ACCEPTED');
    expect((await authorized().get(`/api/v1/me/acquisition-leads/${leadId}`)).body.status).toBe('ACCEPTED');
  });

  it('prevents invalid or duplicate test drives and permits one customer cancellation', async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const invalid = await authorized().post('/api/v1/test-drive-requests').send({ listingId, requestedDate: yesterday.toISOString().slice(0, 10), timeSlot: '10:00-12:00' }); expect(invalid.status).toBe(400);
    const future = new Date(); future.setDate(future.getDate() + 2); const body = { listingId, requestedDate: future.toISOString().slice(0, 10), timeSlot: '10:00-12:00', serviceCity: 'Bengaluru', locationPreference: 'HUB', customerNotes: 'Morning preferred' };
    const created = await authorized().post('/api/v1/test-drive-requests').send(body); expect(created.status).toBe(201); expect(created.body.status).toBe('REQUESTED'); driveId = created.body.id;
    expect((await authorized().post('/api/v1/test-drive-requests').send(body)).status).toBe(409);
    expect((await authorized().patch(`/api/v1/test-drive-requests/${driveId}/cancel`).send({ reason: 'Plans changed' })).status).toBe(204);
    expect((await authorized().patch(`/api/v1/test-drive-requests/${driveId}/cancel`).send({ reason: 'Again' })).status).toBe(409);
  });

  it('updates only the authenticated customer profile fields', async () => {
    const invalid = await authorized().patch('/api/v1/me').send({ role: 'ADMIN' }); expect(invalid.status).toBe(400);
    const updated = await authorized().patch('/api/v1/me').send({ displayName: 'Updated Customer', phone: '+919876543210', marketingConsent: true });
    expect(updated.status).toBe(200); expect(updated.body.displayName).toBe('Updated Customer'); expect(updated.body.marketingConsent).toBe(true); expect(updated.body.employee).toBeNull();
  });

  it('records account privacy requests without treating them as immediate deletion', async () => {
    const invalid = await authorized().post('/api/v1/me/privacy-requests').send({ requestType: 'ERASE_NOW' });
    expect(invalid.status).toBe(400);
    const access = await authorized().post('/api/v1/me/privacy-requests').send({ requestType: 'DATA_ACCESS' });
    expect(access.status).toBe(201); expect(access.body).toMatchObject({ requestType: 'DATA_ACCESS', status: 'REQUESTED' });
    const deletion = await authorized().post('/api/v1/me/privacy-requests').send({ requestType: 'ACCOUNT_DELETION' });
    expect(deletion.status).toBe(201); expect(deletion.body).toMatchObject({ requestType: 'ACCOUNT_DELETION', status: 'REQUESTED' });
  });

  it('allows anonymous published discovery but scopes saved searches, purchase enquiries and support to the customer', async () => {
    const publicInventory = await request(app).get('/api/v1/inventory'); expect(publicInventory.status).toBe(200); expect(publicInventory.body.items.some((item: { id: string }) => item.id === listingId)).toBe(true);
    expect((await request(app).get('/api/v1/inventory?minYear=2024&maxYear=2020')).status).toBe(400);
    const search = await authorized().post('/api/v1/me/saved-searches').send({ name: 'Nexon search', query: { make: 'Tata' } }); expect(search.status).toBe(201);
    expect((await authorized().get('/api/v1/me/saved-searches')).body[0].id).toBe(search.body.id);
    const purchase = await authorized().post('/api/v1/purchase-enquiries').send({ listingId, idempotencyKey: crypto.randomUUID(), message: 'Please contact me.' }); expect(purchase.status).toBe(201); expect(purchase.body.status).toBe('RECEIVED');
    const support = await authorized().post('/api/v1/support-cases').send({ subject: 'Need help', category: 'OTHER', description: 'Please help with my customer account.' }); expect(support.status).toBe(201); expect((await authorized().get('/api/v1/me/support-cases')).body[0].id).toBe(support.body.id);
    const reply = await authorized().post(`/api/v1/support-cases/${support.body.id}/replies`).send({ body: 'I can share more details if needed.' });
    expect(reply.status).toBe(201); expect(reply.body.authorType).toBe('CUSTOMER');
    const caseDetail = await authorized().get(`/api/v1/support-cases/${support.body.id}`);
    expect(caseDetail.status).toBe(200); expect(caseDetail.body.replies).toHaveLength(1); expect(caseDetail.body.replies[0].body).toContain('more details');
  });

  it('returns a customer-scoped, paginated activity timeline without inventing outcomes', async () => {
    const activity = await authorized().get('/api/v1/me/activity?page=1&limit=2');
    expect(activity.status).toBe(200);
    expect(activity.body).toMatchObject({ page: 1, limit: 2 });
    expect(activity.body.total).toBeGreaterThanOrEqual(4);
    expect(activity.body.items).toHaveLength(2);
    expect(activity.body.items.every((item: { kind: string; status: string; title: string }) =>
      ['TEST_DRIVE', 'SELLING', 'PURCHASE', 'SUPPORT'].includes(item.kind)
      && typeof item.status === 'string'
      && typeof item.title === 'string'
    )).toBe(true);
  });
});
