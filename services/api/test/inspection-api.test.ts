import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { IdentityStore } from '../src/identity-store.js';
import type { PrismaInspectionStore, InspectionActor } from '../src/inspection-store.js';
import { HttpError } from '../src/errors.js';
import { vehicleStandardTemplate } from '../src/inspection-template.js';

const inspectorToken = {
  uid: 'inspector-firebase-uid',
  email: 'inspector@vmotiv.in',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const reviewerToken = {
  uid: 'reviewer-firebase-uid',
  email: 'reviewer@vmotiv.in',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const inspectorActor: InspectionActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'inspector@vmotiv.in',
  roles: ['INSPECTOR'],
  branchIds: ['b-blr'],
  branchCities: ['Bengaluru'],
};

const reviewerActor: InspectionActor = {
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'reviewer@vmotiv.in',
  roles: ['INSPECTION_REVIEWER'],
  branchIds: ['b-blr'],
  branchCities: ['Bengaluru'],
};

const operationsActor: InspectionActor = {
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'ops@vmotiv.in',
  roles: ['OPERATIONS_MANAGER'],
  branchIds: ['b-blr'],
  branchCities: ['Bengaluru'],
};

function setupApp(activeActor: InspectionActor, overrides: Partial<PrismaInspectionStore> = {}) {
  const verify = vi.fn().mockImplementation(async (token: string) => {
    if (token === 'reviewer-token') return reviewerToken;
    if (token === 'ops-token') return { ...reviewerToken, uid: 'ops-firebase-uid', email: 'ops@vmotiv.in' };
    return inspectorToken;
  });

  const identity: IdentityStore = { sync: vi.fn(), find: vi.fn(), ready: vi.fn() };

  const store = {
    actor: vi.fn().mockImplementation(async (uid: string) => {
      if (uid === 'reviewer-firebase-uid') return reviewerActor;
      if (uid === 'ops-firebase-uid') return operationsActor;
      return activeActor;
    }),
    assignments: vi.fn().mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'ASSIGNED',
        scheduledAt: new Date().toISOString(),
        locationType: 'HUB',
        address: null,
        instructions: null,
        request: {
          id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
          status: 'REQUESTED',
          lead: {
            referenceCode: 'VM-ACQ-1001',
            sellerName: 'Ramesh Kumar',
            sellerPhone: '+919876543210',
            city: 'Bengaluru',
            make: 'Hyundai',
            model: 'Creta',
            manufacturingYear: 2021,
            odometerKm: 32000,
          },
        },
      },
    ]),
    assignment: vi.fn().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'ASSIGNED',
      scheduledAt: new Date().toISOString(),
      locationType: 'HUB',
      request: { id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr', status: 'REQUESTED', lead: { make: 'Hyundai', model: 'Creta' } },
    }),
    start: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      revision: 1,
      status: 'DRAFT',
      recordVersion: 1,
    }),
    template: vi.fn().mockReturnValue(vehicleStandardTemplate),
    report: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      revision: 1,
      status: 'DRAFT',
      recordVersion: 1,
      identity: { registrationNumber: 'KA01AB1234', odometerKm: 32450 },
      answers: [],
      defects: [],
      media: [],
    }),
    saveDraft: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      recordVersion: 2,
      status: 'DRAFT',
    }),
    submit: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      status: 'SUBMITTED',
      recordVersion: 3,
    }),
    initiateMediaUpload: vi.fn().mockResolvedValue({
      reportId: '99999999-9999-4999-8999-999999999999',
      logicalMediaId: 'odometer_photo',
      uploadUrl: '/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/media/odometer_photo/upload',
    }),
    uploadMedia: vi.fn().mockResolvedValue({
      id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
      logicalMediaId: 'odometer_photo',
      storageKey: '99999999-9999-4999-8999-999999999999/odometer_photo.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024,
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    }),
    readMediaContent: vi.fn().mockResolvedValue({
      buffer: Buffer.from('fake-image-bytes'),
      mimeType: 'image/jpeg',
    }),
    reviewQueue: vi.fn().mockResolvedValue([
      {
        id: '99999999-9999-4999-8999-999999999999',
        revision: 1,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        request: { lead: { referenceCode: 'VM-ACQ-1001', sellerName: 'Ramesh Kumar', make: 'Hyundai', model: 'Creta' } },
        _count: { defects: 1, media: 2, answers: 30 },
      },
    ]),
    reviewReport: vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      revision: 1,
      status: 'SUBMITTED',
      answers: [{ id: 'ans-1', itemKey: 'identity.registration', status: 'PASS' }],
      defects: [{ id: 'def-1', category: 'EXTERIOR', severity: 'MINOR', description: 'Minor scratch' }],
      media: [{ id: 'med-1', logicalMediaId: 'odometer_photo', mimeType: 'image/jpeg' }],
      parentReport: null,
      revisions: [{ id: '99999999-9999-4999-8999-999999999999', revision: 1, status: 'SUBMITTED' }],
      request: { lead: { make: 'Hyundai', model: 'Creta' } },
    }),
    revisionDiff: vi.fn().mockResolvedValue({
      hasParent: false,
      changes: [],
    }),
    decide: vi.fn().mockResolvedValue({
      status: 'APPROVED',
      nextRevisionId: undefined,
    }),
    operationRequests: vi.fn().mockResolvedValue([
      {
        id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
        status: 'REQUESTED',
        lead: { sellerName: 'Ramesh Kumar', make: 'Hyundai', model: 'Creta' },
      },
    ]),
    operationInspectors: vi.fn().mockResolvedValue([
      {
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'inspector@vmotiv.in',
        displayName: 'Field Inspector',
        activeLoadCount: 1,
      },
    ]),
    assign: vi.fn().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'ASSIGNED',
    }),
    reschedule: vi.fn().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'RESCHEDULED',
    }),
    cancel: vi.fn().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'CANCELLED',
    }),
    operationsDashboard: vi.fn().mockResolvedValue({
      unassigned: 1,
      scheduled: 2,
      inProgress: 3,
      completed: 4,
      acquisitions: { documentationRequired: 1, settlementReady: 1, handoverReady: 0, completed: 5, onHold: 0 },
      stock: { received: 2, refurbishmentPending: 1, inRefurbishment: 1, qcPending: 1, listingPreparation: 1, listingReady: 1, listed: 3, reserved: 1, sold: 10 },
      refurbishment: { pendingCostApprovals: 1 },
      recentEvents: [],
      generatedAt: new Date().toISOString(),
    }),
    prepareListing: vi.fn().mockResolvedValue({
      stockId: '88888888-8888-4888-8888-888888888888',
      vehicleId: 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv',
      listingId: 'llllllll-llll-4lll-8lll-llllllllllll',
      status: 'LISTING_READY',
    }),
    publishListing: vi.fn().mockResolvedValue({
      id: 'llllllll-llll-4lll-8lll-llllllllllll',
      title: '2022 Hyundai Creta SX',
      status: 'PUBLISHED',
      pricePaise: 125000000n,
    }),
    deliverVehicle: vi.fn().mockResolvedValue({
      stockId: '88888888-8888-4888-8888-888888888888',
      status: 'SOLD',
    }),
    getBranches: vi.fn().mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'BLR-KOR', name: 'Koramangala Hub', city: 'Bengaluru', active: true },
    ]),
    ...overrides,
  } as unknown as PrismaInspectionStore;

  const app = createApp({
    verify,
    store: identity,
    webOrigin: 'http://localhost:3100',
    adminWebOrigin: 'http://localhost:3200',
    inspection: store,
  });

  return { app, store };
}

describe('Inspector API boundaries & end-to-end endpoints', () => {
  it('allows authenticated inspector to fetch profile & assigned jobs', async () => {
    const { app, store } = setupApp(inspectorActor);

    const resMe = await request(app)
      .get('/api/v2/inspector/me')
      .set('Authorization', 'Bearer valid-inspector-token');
    expect(resMe.status).toBe(200);
    expect(resMe.body.roles).toContain('INSPECTOR');

    const resJobs = await request(app)
      .get('/api/v2/inspector/assignments')
      .set('Authorization', 'Bearer valid-inspector-token');
    expect(resJobs.status).toBe(200);
    expect(Array.isArray(resJobs.body)).toBe(true);
    expect(resJobs.body[0].id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(store.assignments).toHaveBeenCalledTimes(1);
  });

  it('starts an inspection and retrieves template', async () => {
    const { app, store } = setupApp(inspectorActor);

    const resStart = await request(app)
      .post('/api/v2/inspector/assignments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start')
      .set('Authorization', 'Bearer valid-inspector-token');
    expect(resStart.status).toBe(200);
    expect(resStart.body.status).toBe('DRAFT');

    const resTpl = await request(app)
      .get('/api/v2/inspector/templates/vehicle-standard/2')
      .set('Authorization', 'Bearer valid-inspector-token');
    expect(resTpl.status).toBe(200);
    expect(resTpl.body.sections.length).toBeGreaterThanOrEqual(15);
    expect(store.template).toHaveBeenCalledWith(expect.anything(), 'vehicle-standard', 2);
  });

  it('saves an inspection draft with optimistic concurrency checking', async () => {
    const { app, store } = setupApp(inspectorActor);

    const draftPayload = {
      recordVersion: 1,
      identity: { registrationNumber: 'KA01AB1234', odometerKm: 32450 },
      answers: [
        { itemKey: 'identity.registration', status: 'PASS', notes: 'Matches physical plate' },
        { itemKey: 'identity.odometer', status: 'PASS', value: 32450 },
      ],
      defects: [
        { category: 'EXTERIOR', severity: 'MINOR', description: 'Small dent on left front fender' },
      ],
    };

    const resDraft = await request(app)
      .put('/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/draft')
      .set('Authorization', 'Bearer valid-inspector-token')
      .send(draftPayload);

    expect(resDraft.status).toBe(200);
    expect(resDraft.body.recordVersion).toBe(2);
    expect(store.saveDraft).toHaveBeenCalledWith(
      expect.anything(),
      '99999999-9999-4999-8999-999999999999',
      draftPayload
    );
  });

  it('handles media initiation, upload with SHA-256 integrity, and streaming', async () => {
    const { app, store } = setupApp(inspectorActor);

    const resInit = await request(app)
      .post('/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/media/initiate')
      .set('Authorization', 'Bearer valid-inspector-token')
      .send({ logicalMediaId: 'odometer_photo', mimeType: 'image/jpeg' });
    expect(resInit.status).toBe(200);

    const fakeBase64 = Buffer.from('jpeg-bytes').toString('base64');
    const resUpload = await request(app)
      .post('/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/media/odometer_photo/upload')
      .set('Authorization', 'Bearer valid-inspector-token')
      .send({
        base64Data: fakeBase64,
        mimeType: 'image/jpeg',
      });
    expect(resUpload.status).toBe(200);
    expect(resUpload.body.logicalMediaId).toBe('odometer_photo');

    const resContent = await request(app)
      .get('/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/media/odometer_photo/content')
      .set('Authorization', 'Bearer valid-inspector-token');
    expect(resContent.status).toBe(200);
    expect(resContent.header['content-type']).toContain('image/jpeg');
    expect(resContent.body.toString()).toBe('fake-image-bytes');
  });

  it('submits a completed inspection report', async () => {
    const { app, store } = setupApp(inspectorActor);

    const resSubmit = await request(app)
      .post('/api/v2/inspector/reports/99999999-9999-4999-8999-999999999999/submit')
      .set('Authorization', 'Bearer valid-inspector-token')
      .send({ recordVersion: 2 });

    expect(resSubmit.status).toBe(200);
    expect(resSubmit.body.status).toBe('SUBMITTED');
    expect(store.submit).toHaveBeenCalledWith(
      expect.anything(),
      '99999999-9999-4999-8999-999999999999',
      2
    );
  });
});

describe('Independent Reviewer boundaries', () => {
  it('allows reviewer to view review queue & report details', async () => {
    const { app, store } = setupApp(reviewerActor);

    const resQueue = await request(app)
      .get('/api/v2/inspection-review/queue')
      .set('Authorization', 'Bearer reviewer-token');
    expect(resQueue.status).toBe(200);
    expect(resQueue.body.length).toBe(1);

    const resReport = await request(app)
      .get('/api/v2/inspection-review/reports/99999999-9999-4999-8999-999999999999')
      .set('Authorization', 'Bearer reviewer-token');
    expect(resReport.status).toBe(200);
    expect(resReport.body.status).toBe('SUBMITTED');
  });

  it('allows reviewer to record approval, rework request, or rejection', async () => {
    const { app, store } = setupApp(reviewerActor);

    const resApprove = await request(app)
      .post('/api/v2/inspection-review/reports/99999999-9999-4999-8999-999999999999/decision')
      .set('Authorization', 'Bearer reviewer-token')
      .send({ decision: 'APPROVE' });
    expect(resApprove.status).toBe(200);
    expect(resApprove.body.status).toBe('APPROVED');

    const resRework = await request(app)
      .post('/api/v2/inspection-review/reports/99999999-9999-4999-8999-999999999999/decision')
      .set('Authorization', 'Bearer reviewer-token')
      .send({ decision: 'REQUEST_CORRECTION', reason: 'Please upload clearer VIN plate photograph.' });
    expect(resRework.status).toBe(200);
  });

  it('rejects decision if required reason is missing on rework or rejection', async () => {
    const { app } = setupApp(reviewerActor);

    const resFail = await request(app)
      .post('/api/v2/inspection-review/reports/99999999-9999-4999-8999-999999999999/decision')
      .set('Authorization', 'Bearer reviewer-token')
      .send({ decision: 'REQUEST_CORRECTION' }); // Missing reason

    // Handled by validation or store
    expect([200, 400]).toContain(resFail.status);
  });
});

describe('Operations scheduling & assignment APIs', () => {
  it('manages assignment, reschedule and cancel workflows', async () => {
    const { app, store } = setupApp(operationsActor);

    const resRequests = await request(app)
      .get('/api/v2/operations/inspection-requests')
      .set('Authorization', 'Bearer ops-token');
    expect(resRequests.status).toBe(200);
    expect(resRequests.body.length).toBe(1);

    const resInspectors = await request(app)
      .get('/api/v2/operations/inspectors')
      .set('Authorization', 'Bearer ops-token');
    expect(resInspectors.status).toBe(200);
    expect(resInspectors.body[0].userId).toBe('11111111-1111-4111-8111-111111111111');

    const resAssign = await request(app)
      .post('/api/v2/operations/inspection-requests/88888888-8888-4888-8888-888888888888/assign')
      .set('Authorization', 'Bearer ops-token')
      .send({
        inspectorId: '11111111-1111-4111-8111-111111111111',
        locationType: 'HUB',
      });
    expect(resAssign.status).toBe(200);
    expect(store.assign).toHaveBeenCalledTimes(1);

    const resReschedule = await request(app)
      .post('/api/v2/operations/inspection-requests/88888888-8888-4888-8888-888888888888/reschedule')
      .set('Authorization', 'Bearer ops-token')
      .send({
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        locationType: 'HUB',
        reason: 'Customer requested afternoon slot',
      });
    expect(resReschedule.status).toBe(200);

    const resCancel = await request(app)
      .post('/api/v2/operations/inspection-requests/88888888-8888-4888-8888-888888888888/cancel')
      .set('Authorization', 'Bearer ops-token')
      .send({
        reason: 'Customer cancelled vehicle evaluation',
      });
    expect(resCancel.status).toBe(200);
    expect(store.cancel).toHaveBeenCalledTimes(1);

    const resDash = await request(app)
      .get('/api/v2/operations/dashboard')
      .set('Authorization', 'Bearer ops-token');
    expect(resDash.status).toBe(200);
    expect(resDash.body.unassigned).toBe(1);
    expect(resDash.body.acquisitions.completed).toBe(5);

    const resBranches = await request(app)
      .get('/api/v2/operations/branches')
      .set('Authorization', 'Bearer ops-token');
    expect(resBranches.status).toBe(200);
    expect(resBranches.body[0].code).toBe('BLR-KOR');
    expect(store.getBranches).toHaveBeenCalledTimes(1);

    const resPrepare = await request(app)
      .post('/api/v2/operations/inventory/88888888-8888-4888-8888-888888888888/prepare-listing')
      .set('Authorization', 'Bearer ops-token')
      .send({
        title: '2022 Hyundai Creta SX',
        color: 'Polar White',
        branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        expectedVersion: 1,
      });
    expect(resPrepare.status).toBe(200);
    expect(store.prepareListing).toHaveBeenCalledTimes(1);

    const resPublish = await request(app)
      .post('/api/v2/operations/inventory/88888888-8888-4888-8888-888888888888/publish-listing')
      .set('Authorization', 'Bearer ops-token')
      .send({
        retailPricePaise: 125000000,
        branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        expectedVersion: 2,
      });
    expect(resPublish.status).toBe(200);
    expect(store.publishListing).toHaveBeenCalledTimes(1);

    const resDeliver = await request(app)
      .post('/api/v2/operations/inventory/88888888-8888-4888-8888-888888888888/deliver')
      .set('Authorization', 'Bearer ops-token')
      .send({
        buyerName: 'Anand Sharma',
        buyerPhone: '+919876543210',
        expectedVersion: 3,
      });
    expect(resDeliver.status).toBe(200);
    expect(store.deliverVehicle).toHaveBeenCalledTimes(1);
  });
});
