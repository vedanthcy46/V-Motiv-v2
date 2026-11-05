import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaInspectionStore } from '../src/inspection-store.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Listing integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Listing readiness and live editing with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaInspectionStore(db);
  const suffix = crypto.randomUUID().slice(0, 8);
  let actor: Awaited<ReturnType<typeof store.actor>>;
  let branchId: string;

  /** A car that is ready to list: stock unit, vehicle and a draft listing with the given number of photos. */
  async function car(photos: number, extras: { color?: string | null; registrationNumber?: string | null; conditionSummary?: string | null; status?: 'LISTING_READY' | 'LISTED' } = {}) {
    const seller = await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test`, displayName: 'Seller' } });
    const lead = await db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'S', sellerPhone: '+919999999999', city: 'Bengaluru', pincode: '560001', make: 'Hyundai', model: 'Creta', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000, status: 'ACCEPTED' } });
    const offer = await db.acquisitionOffer.create({ data: { leadId: lead.id, offerAmountPaise: 90_000_000n, validUntil: new Date(Date.now() + 86_400_000), status: 'ACCEPTED' } });
    const kase = await db.acquisitionCase.create({ data: { leadId: lead.id, offerId: offer.id, sellerAcceptedByUserId: seller.id, acceptedAt: new Date(), status: 'COMPLETED' } });
    const vehicle = await db.vehicle.create({ data: {
      make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000,
      color: extras.color === undefined ? 'White' : extras.color, conditionSummary: extras.conditionSummary === undefined ? 'Clean car, single owner' : extras.conditionSummary,
    } });
    await db.vehicleListing.create({ data: {
      vehicleId: vehicle.id, title: '2021 Hyundai Creta', pricePaise: extras.status === 'LISTED' ? 120_000_000n : 0n, status: extras.status === 'LISTED' ? 'PUBLISHED' : 'DRAFT',
      media: { create: Array.from({ length: photos }, (_, i) => ({ url: `https://img.example.test/${suffix}/${crypto.randomUUID()}-${i}.jpg`, mediaType: 'IMAGE', displayOrder: i })) },
    } });
    const stock = await db.vehicleStockUnit.create({ data: {
      stockCode: `STK-${crypto.randomUUID().slice(0, 10)}`, acquisitionCaseId: kase.id, vehicleId: vehicle.id, branchId, receivedByEmployeeId: actor.userId,
      status: extras.status ?? 'LISTING_READY', physicalLocation: 'Hub', registrationNumber: extras.registrationNumber === undefined ? 'KA01AB1234' : extras.registrationNumber,
      make: 'Hyundai', model: 'Creta', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000, acquisitionCostPaise: 90_000_000n,
    } });
    return stock;
  }

  beforeAll(async () => {
    await db.$connect();
    await ensureAdminCatalog(db);
    const adminRole = await db.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
    const branch = await db.branch.create({ data: { code: `L-${suffix}`, name: 'Listing Hub', city: 'Bengaluru' } });
    branchId = branch.id;
    const user = await db.user.create({ data: { firebaseUid: `lister-${suffix}`, email: `lister-${suffix}@example.test`, displayName: 'Lister' } });
    await db.employee.create({ data: { userId: user.id, role: 'ADMIN', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `LST-${suffix}`.toUpperCase(), roleAssignments: { create: { roleId: adminRole.id } }, branchAssignments: { create: { branchId } } } });
    actor = await store.actor(`lister-${suffix}`);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('refuses to publish a car with too few photos, naming what is missing', async () => {
    const stock = await car(1, { color: null });
    await expect(store.publishListing(actor, stock.id, { retailPricePaise: 120_000_000n, expectedVersion: stock.version })).rejects.toMatchObject({
      code: 'LISTING_INCOMPLETE',
      message: expect.stringMatching(/photos.*colour/s),
    });
  });

  it('publishes a complete car, then lets the listing be edited while live', async () => {
    const stock = await car(3);
    await store.publishListing(actor, stock.id, { retailPricePaise: 120_000_000n, expectedVersion: stock.version });
    const live = await db.vehicleStockUnit.findUniqueOrThrow({ where: { id: stock.id }, include: { vehicle: { include: { listing: { include: { media: true } } } } } });
    expect(live.status).toBe('LISTED');
    const photos = live.vehicle!.listing!.media.map(m => m.url);

    // Add a photo, drop one, change the price, add features and the condition text.
    const added = `https://img.example.test/${suffix}/new.jpg`;
    const result = await store.updateListing(actor, stock.id, {
      mediaUrls: [added, photos[1]!, photos[2]!], retailPricePaise: 118_500_000n, features: ['Sunroof', 'Rear camera'], conditionSummary: 'Serviced at 30,000 km', color: 'Polar White',
    });
    expect(result.changed).toEqual(expect.arrayContaining(['mediaUrls', 'retailPricePaise', 'features']));
    const edited = await db.vehicleListing.findFirstOrThrow({ where: { vehicleId: live.vehicleId! }, include: { media: { orderBy: { displayOrder: 'asc' } }, vehicle: true } });
    expect(edited.status).toBe('PUBLISHED');
    expect(edited.pricePaise).toBe(118_500_000n);
    expect(edited.media.map(m => m.url)).toEqual([added, photos[1], photos[2]]);
    expect(edited.vehicle.features).toEqual(['Sunroof', 'Rear camera']);
    const profile = edited.customerProfile as { specifications: { color: string }; topFeatures: string[]; customerConditionSummary: string };
    expect(profile.specifications.color).toBe('Polar White');
    expect(profile.topFeatures).toEqual(['Sunroof', 'Rear camera']);
    expect(profile.customerConditionSummary).toBe('Serviced at 30,000 km');

    const audit = await db.auditEvent.findFirst({ where: { action: 'VEHICLE_LISTING_EDITED_LIVE', entityId: edited.id } });
    expect(audit).not.toBeNull();
  });

  it('does not let a live listing be left incomplete, or a reserved car change price', async () => {
    const stock = await car(3);
    await store.publishListing(actor, stock.id, { retailPricePaise: 120_000_000n, expectedVersion: stock.version });
    const listing = await db.vehicleListing.findFirstOrThrow({ where: { vehicle: { stockUnit: { id: stock.id } } }, include: { media: true } });
    await expect(store.updateListing(actor, stock.id, { mediaUrls: [listing.media[0]!.url] })).rejects.toMatchObject({ code: 'LISTING_INCOMPLETE' });
    await expect(store.updateListing(actor, stock.id, {})).rejects.toMatchObject({ code: 'NOTHING_TO_UPDATE' });

    await db.vehicleStockUnit.update({ where: { id: stock.id }, data: { status: 'RESERVED' } });
    await expect(store.updateListing(actor, stock.id, { retailPricePaise: 100_000_000n })).rejects.toMatchObject({ code: 'LISTING_RESERVED_PRICE_LOCKED' });
  });

  it('reports what a listing still lacks in the stock list', async () => {
    const stock = await car(0, { registrationNumber: null });
    const units = await store.stockUnits(actor);
    const found = units.find(u => u.id === stock.id) as unknown as { listingGaps: Array<{ key: string }> };
    expect(found.listingGaps.map(g => g.key)).toEqual(expect.arrayContaining(['photos', 'registrationNumber']));
  });
});
