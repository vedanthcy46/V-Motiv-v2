import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { PrismaServiceStore } from '../src/service-store.js';

const customerToken = {
  uid: 'cust-123',
  email: 'customer@example.com',
  name: 'Test Customer',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const staffToken = {
  uid: 'staff-456',
  email: 'advisor@vmotiv.in',
  name: 'Service Advisor',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const financeToken = {
  uid: 'finance-789',
  email: 'finance@vmotiv.in',
  name: 'Finance Executive',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const HUB_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const ESTIMATE_ID = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555';

function setupApp(activeRole: 'CUSTOMER' | 'SERVICE_ADVISOR' | 'FINANCE') {
  const verify = vi.fn().mockImplementation(async (token: string) => {
    if (token === 'staff-token') return staffToken;
    if (token === 'finance-token') return financeToken;
    return customerToken;
  });

  const mockDb: any = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.firebaseUid === 'staff-456') {
          return Promise.resolve({
            id: 'user-staff-456',
            employee: {
              userId: 'user-staff-456',
              status: 'ACTIVE',
              roleAssignments: [{ role: { name: 'SERVICE_ADVISOR' } }],
            },
          });
        }
        if (where.firebaseUid === 'finance-789') {
          return Promise.resolve({
            id: 'user-finance-789',
            employee: {
              userId: 'user-finance-789',
              status: 'ACTIVE',
              roleAssignments: [{ role: { name: 'FINANCE' } }],
            },
          });
        }
        return Promise.resolve({ id: 'user-cust-123' });
      }),
    },
  };

  const mockServiceStore: Partial<PrismaServiceStore> = {
    getIssueCategories: vi.fn().mockResolvedValue([
      { categoryKey: 'REGULAR_SERVICE', title: 'Regular Maintenance', icon: 'wrench', fixedPackageAvailable: true, packagePricePaise: '499900' },
      { categoryKey: 'AC_SERVICE', title: 'AC Service & Cooling Issue', icon: 'wind', fixedPackageAvailable: true, packagePricePaise: '249900' },
    ]),
    getIssueTemplate: vi.fn().mockResolvedValue({
      categoryKey: 'AC_SERVICE',
      title: 'AC Service & Cooling Issue',
      questions: [{ stableId: 'q_ac_airflow', label: 'How is airflow?', responseType: 'SINGLE_SELECT', required: true }],
    }),
    listHubs: vi.fn().mockResolvedValue([
      { id: HUB_ID, code: 'HUB-CHN-01', name: 'Chennai Central Hub', city: 'Chennai' },
    ]),
    getSlotAvailability: vi.fn().mockResolvedValue([
      { slotDate: '2026-11-01', slotTime: '09:00-11:00', maxCapacity: 4, bookedCount: 1, isAvailable: true, availableCount: 3 },
    ]),
    listCustomerVehicles: vi.fn().mockResolvedValue([
      { id: VEHICLE_ID, make: 'Hyundai', model: 'Creta', year: 2022, registrationNumber: 'TN09BK1234', isPreferred: true },
    ]),
    createCustomerVehicle: vi.fn().mockResolvedValue({
      id: VEHICLE_ID,
      make: 'Tata',
      model: 'Nexon',
      year: 2023,
      registrationNumber: 'TN01AZ9999',
      isPreferred: true,
    }),
    updateCustomerVehicle: vi.fn().mockResolvedValue({
      id: VEHICLE_ID,
      color: 'White',
      odometerKm: 25000,
    }),
    archiveCustomerVehicle: vi.fn().mockResolvedValue({ success: true }),
    createServiceRequest: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      requestNumber: 'SR-20261101-1234',
      status: 'SUBMITTED',
      scheduledDate: '2026-11-01',
      scheduledTimeSlot: '09:00-11:00',
    }),
    listCustomerServiceRequests: vi.fn().mockResolvedValue([
      { id: REQUEST_ID, requestNumber: 'SR-20261101-1234', status: 'SUBMITTED', categoryKey: 'REGULAR_SERVICE' },
    ]),
    getCustomerServiceRequest: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      requestNumber: 'SR-20261101-1234',
      status: 'SUBMITTED',
      customerSymptoms: 'Brake making squeaking sound',
      historyEvents: [{ id: 'evt-1', title: 'Service Booking Submitted', createdAt: new Date().toISOString() }],
    }),
    respondToEstimate: vi.fn().mockResolvedValue({ success: true, status: 'ESTIMATE_APPROVED' }),
    cancelServiceRequest: vi.fn().mockResolvedValue({ id: REQUEST_ID, status: 'CANCELLED' }),
    getOperationsQueue: vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      limit: 25,
      items: [{ id: REQUEST_ID, requestNumber: 'SR-20261101-1234', status: 'SUBMITTED' }],
    }),
    getOperationsJobDetails: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      requestNumber: 'SR-20261101-1234',
      status: 'SUBMITTED',
    }),
    scheduleAppointment: vi.fn().mockResolvedValue({ id: REQUEST_ID, status: 'APPOINTMENT_SCHEDULED' }),
    recordCustodyCheckIn: vi.fn().mockResolvedValue({ id: 'custody-1', type: 'CHECK_IN', odometerKm: 24500 }),
    submitDiagnosis: vi.fn().mockResolvedValue({ id: 'diag-1', diagnosticSummary: 'Brake pads worn to 2mm' }),
    createEstimate: vi.fn().mockResolvedValue({ id: ESTIMATE_ID, version: 1, totalAmountPaise: '750000' }),
    createWorkOrder: vi.fn().mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' }),
    recordQC: vi.fn().mockResolvedValue({ id: 'qc-1', result: 'PASS' }),
    recordCustodyReturn: vi.fn().mockResolvedValue({ id: 'custody-2', type: 'CHECK_OUT' }),
    verifyServicePayment: vi.fn().mockResolvedValue({ id: PAYMENT_ID, status: 'PAID_VERIFIED' }),
  };

  const app = createApp({
    verify,
    store: { sync: vi.fn(), find: vi.fn() } as any,
    webOrigin: 'http://localhost:3000',
    service: mockServiceStore as PrismaServiceStore,
    db: mockDb,
  });

  return { app, mockServiceStore, mockDb };
}

describe('V MOTIV V2 — Car Service & My Garage API', () => {
  it('GET /api/v2/service/categories returns service issue categories and packages', async () => {
    const { app } = setupApp('CUSTOMER');
    const res = await request(app).get('/api/v2/service/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].categoryKey).toBe('REGULAR_SERVICE');
  });

  it('GET /api/v2/service/categories/:key returns dynamic questions for category', async () => {
    const { app } = setupApp('CUSTOMER');
    const res = await request(app).get('/api/v2/service/categories/AC_SERVICE');
    expect(res.status).toBe(200);
    expect(res.body.categoryKey).toBe('AC_SERVICE');
    expect(res.body.questions).toHaveLength(1);
  });

  it('GET /api/v2/service/hubs returns active service hubs', async () => {
    const { app } = setupApp('CUSTOMER');
    const res = await request(app).get('/api/v2/service/hubs?city=Chennai');
    expect(res.status).toBe(200);
    expect(res.body[0].code).toBe('HUB-CHN-01');
  });

  it('GET /api/v2/service/availability returns slot capacities', async () => {
    const { app } = setupApp('CUSTOMER');
    const res = await request(app).get(`/api/v2/service/availability?hubId=${HUB_ID}&date=2026-11-01`);
    expect(res.status).toBe(200);
    expect(res.body[0].slotTime).toBe('09:00-11:00');
    expect(res.body[0].isAvailable).toBe(true);
  });

  it('GET /api/v2/customer/garage lists customer vehicles', async () => {
    const { app } = setupApp('CUSTOMER');
    const res = await request(app)
      .get('/api/v2/customer/garage')
      .set('Authorization', 'Bearer valid-customer-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].registrationNumber).toBe('TN09BK1234');
  });

  it('POST /api/v2/customer/garage creates a new vehicle in garage', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post('/api/v2/customer/garage')
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        make: 'Tata',
        model: 'Nexon',
        year: 2023,
        fuelType: 'PETROL',
        transmission: 'MANUAL',
        registrationNumber: 'TN01AZ9999',
        declaredOwnership: 'OWNER',
      });
    expect(res.status).toBe(201);
    expect(mockServiceStore.createCustomerVehicle).toHaveBeenCalled();
  });

  it('DELETE /api/v2/customer/garage/:id soft archives a vehicle', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .delete(`/api/v2/customer/garage/${VEHICLE_ID}`)
      .set('Authorization', 'Bearer valid-customer-token');
    expect(res.status).toBe(200);
    expect(mockServiceStore.archiveCustomerVehicle).toHaveBeenCalled();
  });

  it('POST /api/v2/service/requests books a service appointment', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post('/api/v2/service/requests')
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        vehicleId: VEHICLE_ID,
        hubId: HUB_ID,
        categoryKey: 'REGULAR_SERVICE',
        customerSymptoms: 'Scheduled 30,000 km regular service and oil change',
        questionAnswers: { q_last_service: '6 - 12 months ago', q_current_odo: 28500 },
        fulfillmentType: 'SELF_DROP_AT_HUB',
        scheduledDate: '2026-11-01',
        scheduledTimeSlot: '09:00-11:00',
      });
    expect(res.status).toBe(201);
    expect(mockServiceStore.createServiceRequest).toHaveBeenCalled();
  });

  it('POST /api/v2/service/estimates/:id/respond approves an estimate', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post(`/api/v2/service/estimates/${ESTIMATE_ID}/respond`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        decision: 'APPROVE',
        notes: 'Proceed with brake pad replacement',
      });
    expect(res.status).toBe(200);
    expect(mockServiceStore.respondToEstimate).toHaveBeenCalled();
  });

  it('GET /api/v2/operations/service/queue returns jobs queue for service staff', async () => {
    const { app } = setupApp('SERVICE_ADVISOR');
    const res = await request(app)
      .get('/api/v2/operations/service/queue')
      .set('Authorization', 'Bearer staff-token');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('POST /api/v2/operations/service/jobs/:id/custody records custody check-in', async () => {
    const { app, mockServiceStore } = setupApp('SERVICE_ADVISOR');
    const res = await request(app)
      .post(`/api/v2/operations/service/jobs/${REQUEST_ID}/custody`)
      .set('Authorization', 'Bearer staff-token')
      .send({
        type: 'CHECK_IN',
        odometerKm: 24500,
        fuelChargeLevel: '75%',
        keyCount: 1,
        handoverByPerson: 'Customer Rajesh',
      });
    expect(res.status).toBe(200);
    expect(mockServiceStore.recordCustodyCheckIn).toHaveBeenCalled();
  });

  it('Finance verification: Service Advisor cannot verify payment (403), Finance can', async () => {
    // 1. Service Advisor attempts verify -> 403 Forbidden
    const { app: advisorApp } = setupApp('SERVICE_ADVISOR');
    const failRes = await request(advisorApp)
      .post(`/api/v2/operations/service/payments/${PAYMENT_ID}/verify`)
      .set('Authorization', 'Bearer staff-token')
      .send({ verified: true });
    expect(failRes.status).toBe(403);

    // 2. Finance attempts verify -> 200 OK
    const { app: finApp, mockServiceStore } = setupApp('FINANCE');
    const successRes = await request(finApp)
      .post(`/api/v2/operations/service/payments/${PAYMENT_ID}/verify`)
      .set('Authorization', 'Bearer finance-token')
      .send({ verified: true, notes: 'NEFT credit confirmed in HDFC account' });
    expect(successRes.status).toBe(200);
    expect(mockServiceStore.verifyServicePayment).toHaveBeenCalled();
  });
});
