import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { IdentityStore } from '../src/identity-store.js';
import type { SalesActor, SalesStore } from '../src/sales-store.js';
import { HttpError } from '../src/errors.js';

const token = {
  uid: 'sales-firebase-uid',
  email: 'sales.exec@vmotiv.in',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const actor: SalesActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: token.email!,
  displayName: 'Sales Executive',
  employeeCode: 'VM-SALES-101',
  roles: ['SALES_EXECUTIVE'],
  branches: [{ id: 'b-blr', code: 'BLR-01', name: 'Bengaluru Central', city: 'Bengaluru' }],
  globalScope: false,
};

function setup(options: { actorError?: Error } = {}) {
  const verify = vi.fn().mockResolvedValue(token);
  const identity: IdentityStore = { sync: vi.fn(), find: vi.fn(), ready: vi.fn() };

  const sales: SalesStore = {
    actor: options.actorError ? vi.fn().mockRejectedValue(options.actorError) : vi.fn().mockResolvedValue(actor),
    dashboard: vi.fn().mockResolvedValue({
      sellerFunnel: { SUBMITTED: 5, QUALIFYING: 2 },
      buyerFunnel: { RECEIVED: 4, CONTACTED: 1 },
      tasksDueToday: 3,
      upcomingTestDrives: 2,
      unassignedCount: 4,
      openOffersCount: 1,
      generatedAt: new Date(),
    }),
    notifications: vi.fn().mockResolvedValue({
      unassignedLeads: [{ id: '22222222-2222-4222-8222-222222222222', referenceCode: 'VM-ACQ-1001', make: 'Honda', model: 'City', city: 'Bengaluru', createdAt: new Date() }],
      overdueTasks: [],
      pendingTestDrives: [],
      totalUnread: 1,
    }),
    reports: vi.fn().mockResolvedValue({
      sellerFunnel: { SUBMITTED: 10, ACCEPTED: 2 },
      buyerFunnel: { RECEIVED: 8, CLOSED: 3 },
      inspectionsTotal: 5,
      offersTotal: 4,
      testDriveFunnel: { CONFIRMED: 6, COMPLETED: 4 },
      generatedAt: new Date(),
    }),
    sellerLeads: vi.fn().mockResolvedValue({
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          referenceCode: 'VM-ACQ-1001',
          sellerName: 'Vikram Patel',
          sellerPhone: '+919876543210',
          city: 'Bengaluru',
          pincode: '560001',
          make: 'Honda',
          model: 'City',
          variant: 'VX CVT',
          manufacturingYear: 2021,
          fuelType: 'PETROL',
          transmission: 'AUTOMATIC',
          odometerKm: 28000,
          ownershipNumber: 1,
          expectedPricePaise: 95000000n,
          status: 'SUBMITTED',
          inspectionDate: null,
          inspectionTimeSlot: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    createManualSellerLead: vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      referenceCode: 'VM-ACQ-1002',
      status: 'QUALIFYING',
    }),
    sellerLead: vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      referenceCode: 'VM-ACQ-1001',
      sellerName: 'Vikram Patel',
      status: 'SUBMITTED',
    }),
    updateSellerLeadStatus: vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'QUALIFYING',
    }),
    claimSellerLead: vi.fn().mockResolvedValue({
      id: 'claim-1',
      leadId: '22222222-2222-4222-8222-222222222222',
    }),
    assignSellerLead: vi.fn().mockResolvedValue({ id: 'assign-1' }),
    qualifySellerLead: vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'INSPECTION_SCHEDULED',
    }),
    interactions: vi.fn().mockResolvedValue([
      {
        id: 'inter-1',
        channel: 'CALL',
        outcome: 'CONNECTED',
        notes: 'Spoke with seller, vehicle ready for evaluation.',
        createdAt: new Date(),
      },
    ]),
    createInteraction: vi.fn().mockResolvedValue({
      id: 'inter-1',
      channel: 'CALL',
      outcome: 'CONNECTED',
      notes: 'Spoke with seller.',
      createdAt: new Date(),
    }),
    tasks: vi.fn().mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        type: 'CALL',
        priority: 'NORMAL',
        status: 'OPEN',
        details: 'Follow up after test drive',
        dueAt: new Date(),
      },
    ]),
    createTask: vi.fn().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'OPEN',
    }),
    completeTask: vi.fn().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'COMPLETED',
      actualOutcome: 'Done',
    }),
    inspectionRequests: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 }),
    requestInspection: vi.fn().mockResolvedValue({
      id: 'insp-1',
      status: 'PENDING_ASSIGNMENT',
    }),
    inspectionSummary: vi.fn().mockResolvedValue({
      lead: { id: '22222222-2222-4222-8222-222222222222' },
      hasCompletedInspection: true,
      approvedInspection: null,
      requests: [],
    }),
    valuations: vi.fn().mockResolvedValue([]),
    allValuations: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 }),
    reviewRequests: vi.fn().mockResolvedValue({ pendingValuations: [], pendingDiscounts: [], recentDecisions: [] }),
    createValuation: vi.fn().mockResolvedValue({ id: 'val-1', status: 'PENDING_APPROVAL' }),
    decideValuation: vi.fn().mockResolvedValue({ id: 'val-1', status: 'APPROVED' }),
    acquisitionOffers: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 }),
    getAcquisitionOffers: vi.fn().mockResolvedValue([]),
    proposeAcquisitionOffer: vi.fn().mockResolvedValue({
      id: 'offer-1',
      status: 'OFFERED',
    }),
    recordSellerOfferResponse: vi.fn().mockResolvedValue({
      id: 'offer-1',
      status: 'ACCEPTED',
    }),
    buyerLeads: vi.fn().mockResolvedValue({
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          status: 'RECEIVED',
          message: 'Interested in Honda City test drive',
          user: { displayName: 'Rajesh Kumar', email: 'rajesh@example.test', phone: '+919876543212' },
          listing: { id: '55555555-5555-4555-8555-555555555555', title: '2021 Honda City VX', pricePaise: 98000000n, status: 'PUBLISHED' },
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    buyerLead: vi.fn().mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      status: 'RECEIVED',
    }),
    updateBuyerLeadStatus: vi.fn().mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      status: 'CONTACTED',
    }),
    inventory: vi.fn().mockResolvedValue({
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          title: '2021 Honda City VX',
          pricePaise: 98000000n,
          status: 'PUBLISHED',
          vehicle: { make: 'Honda', model: 'City', manufacturingYear: 2021, city: 'Bengaluru', odometerKm: 28000 },
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    inventoryItem: vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      title: '2021 Honda City VX',
    }),
    testDrives: vi.fn().mockResolvedValue({
      items: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          status: 'REQUESTED',
          requestedDate: new Date(),
          timeSlot: '11:00 AM - 01:00 PM',
          user: { displayName: 'Rajesh Kumar' },
          listing: { title: '2021 Honda City VX' },
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    requestTestDrive: vi.fn().mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      status: 'REQUESTED',
    }),
    updateTestDriveStatus: vi.fn().mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      status: 'CONFIRMED',
    }),
    quotations: vi.fn().mockResolvedValue({
      items: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          quotationNumber: 'VM-QUO-2026-0001',
          status: 'DRAFT',
          totalPricePaise: 99500000n,
          validUntil: new Date(),
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    quotation: vi.fn().mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      quotationNumber: 'VM-QUO-2026-0001',
      status: 'DRAFT',
    }),
    createQuotation: vi.fn().mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      quotationNumber: 'VM-QUO-2026-0001',
      status: 'DRAFT',
    }),
    submitQuotation: vi.fn().mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      status: 'SUBMITTED',
    }),
    requestDiscount: vi.fn().mockResolvedValue({
      id: 'disc-1',
      status: 'PENDING_APPROVAL',
    }),
    decideDiscount: vi.fn().mockResolvedValue({
      id: 'disc-1',
      status: 'APPROVED',
    }),
    reservations: vi.fn().mockResolvedValue({
      items: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          reservationNumber: 'VM-RES-2026-0001',
          status: 'REQUESTED',
          expiresAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    requestReservation: vi.fn().mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      reservationNumber: 'VM-RES-2026-0001',
      status: 'REQUESTED',
    }),
    releaseReservation: vi.fn().mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      status: 'RELEASED',
    }),
    releaseListingReservation: vi.fn().mockResolvedValue({
      listing: { id: '55555555-5555-4555-8555-555555555555', status: 'PUBLISHED' },
      reservation: { id: '88888888-8888-4888-8888-888888888888', status: 'RELEASED' },
    }),
    customers: vi.fn().mockResolvedValue({
      items: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          displayName: 'Pooja Hegde',
          email: 'pooja@example.test',
          phone: '+919876543299',
          preferredCity: 'Bengaluru',
          createdAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    customer: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      displayName: 'Pooja Hegde',
      email: 'pooja@example.test',
    }),
    sendApprovedEmail: vi.fn().mockResolvedValue({
      id: 'mail-1',
      state: 'PENDING',
      queuedAt: new Date(),
    }),
  };

  const app = createApp({
    verify,
    store: identity,
    webOrigin: 'http://localhost:3100',
    adminWebOrigin: 'http://localhost:3200',
    sales,
  });

  return { app, sales, verify };
}

describe('Sales Executive Portal API Boundaries', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v2/sales/me');
    expect(res.status).toBe(401);
  });

  it('rejects non-sales employees with 403', async () => {
    const { app } = setup({ actorError: new HttpError(403, 'SALES_ACCESS_REQUIRED') });
    const res = await request(app)
      .get('/api/v2/sales/me')
      .set('Authorization', 'Bearer valid-firebase-token');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'SALES_ACCESS_REQUIRED' });
  });

  it('returns sales actor identity, branches, and scope on GET /me', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/api/v2/sales/me')
      .set('Authorization', 'Bearer valid-firebase-token');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(token.email);
    expect(res.body.roles).toContain('SALES_EXECUTIVE');
  });

  it('retrieves live dashboard and reporting KPIs', async () => {
    const { app, sales } = setup();
    const [dashRes, repRes] = await Promise.all([
      request(app).get('/api/v2/sales/dashboard').set('Authorization', 'Bearer valid-firebase-token'),
      request(app).get('/api/v2/sales/reports').set('Authorization', 'Bearer valid-firebase-token'),
    ]);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.unassignedCount).toBe(4);
    expect(repRes.status).toBe(200);
    expect(sales.reports).toHaveBeenCalled();
  });

  it('queries seller leads within branch scope', async () => {
    const { app, sales } = setup();
    const res = await request(app)
      .get('/api/v2/sales/seller-leads?status=SUBMITTED&limit=10')
      .set('Authorization', 'Bearer valid-firebase-token');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].referenceCode).toBe('VM-ACQ-1001');
    expect(sales.sellerLeads).toHaveBeenCalled();
  });

  it('creates a manual walk-in seller lead with strict Zod validation', async () => {
    const { app, sales } = setup();
    const payload = {
      sellerName: 'Ramesh Rao',
      sellerPhone: '+919876543219',
      city: 'Bengaluru',
      pincode: '560002',
      make: 'Maruti',
      model: 'Swift',
      variant: 'ZXi',
      manufacturingYear: 2022,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      odometerKm: 18000,
      expectedPricePaise: 75000000,
    };
    const res = await request(app)
      .post('/api/v2/sales/seller-leads')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.referenceCode).toBe('VM-ACQ-1002');
    expect(sales.createManualSellerLead).toHaveBeenCalled();
  });

  it('claims an unassigned seller lead once', async () => {
    const { app, sales } = setup();
    const res = await request(app)
      .post('/api/v2/sales/seller-leads/22222222-2222-4222-8222-222222222222/claim')
      .set('Authorization', 'Bearer valid-firebase-token');
    expect(res.status).toBe(201);
    expect(sales.claimSellerLead).toHaveBeenCalledWith(actor, '22222222-2222-4222-8222-222222222222');
  });

  it('records a customer call interaction and schedules a task', async () => {
    const { app, sales } = setup();
    const interRes = await request(app)
      .post('/api/v2/sales/seller-leads/22222222-2222-4222-8222-222222222222/interactions')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({ channel: 'CALL', outcome: 'CONNECTED', notes: 'Vehicle available for valuation' });
    expect(interRes.status).toBe(201);

    const taskRes = await request(app)
      .post('/api/v2/sales/seller-leads/22222222-2222-4222-8222-222222222222/tasks')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({
        type: 'INSPECTION_COORDINATION',
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        details: 'Confirm inspector location',
      });
    expect(taskRes.status).toBe(201);
  });

  it('proposes versioned acquisition offer and records customer response', async () => {
    const { app, sales } = setup();
    const offerRes = await request(app)
      .post('/api/v2/sales/seller-leads/22222222-2222-4222-8222-222222222222/offers')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({
        valuationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        offerAmountPaise: 92000000,
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        terms: 'Valid for 7 days upon physical verification',
      });
    expect(offerRes.status).toBe(201);

    const decisionRes = await request(app)
      .post('/api/v2/sales/seller-leads/22222222-2222-4222-8222-222222222222/offers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/decision')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({ decision: 'ACCEPTED' });
    expect(decisionRes.status).toBe(200);
  });

  it('creates retail quotations and safely reserves inventory stock', async () => {
    const { app, sales } = setup();
    const quoteRes = await request(app)
      .post('/api/v2/sales/quotations')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({
        listingId: '55555555-5555-4555-8555-555555555555',
        customerId: '99999999-9999-4999-8999-999999999999',
        chargesPaise: 1500000,
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
    expect(quoteRes.status).toBe(201);

    const reserveRes = await request(app)
      .post('/api/v2/sales/reservations')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({
        listingId: '55555555-5555-4555-8555-555555555555',
        customerId: '99999999-9999-4999-8999-999999999999',
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        notes: 'Deposit paid at hub',
      });
    expect(reserveRes.status).toBe(201);

    const releaseRes = await request(app)
      .post('/api/v2/sales/reservations/88888888-8888-4888-8888-888888888888/release')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({ reason: 'Customer changed mind' });
    expect(releaseRes.status).toBe(200);

    const releaseListingRes = await request(app)
      .post('/api/v2/sales/listings/55555555-5555-4555-8555-555555555555/release-reservation')
      .set('Authorization', 'Bearer valid-firebase-token')
      .send({ reason: 'Customer cancelled' });
    expect(releaseListingRes.status).toBe(200);
  });

  it('queries all branch inspection requests and acquisition offers', async () => {
    const { app, sales } = setup();
    const [inspRes, offerRes] = await Promise.all([
      request(app).get('/api/v2/sales/inspection-requests?status=REQUESTED').set('Authorization', 'Bearer valid-firebase-token'),
      request(app).get('/api/v2/sales/acquisition-offers?status=OFFERED').set('Authorization', 'Bearer valid-firebase-token'),
    ]);
    expect(inspRes.status).toBe(200);
    expect(sales.inspectionRequests).toHaveBeenCalled();
    expect(offerRes.status).toBe(200);
    expect(sales.acquisitionOffers).toHaveBeenCalled();
  });
});
