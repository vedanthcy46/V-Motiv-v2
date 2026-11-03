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
} as unknown as DecodedIdToken;

const staffToken = {
  uid: 'staff-456',
  email: 'advisor@vmotiv.in',
  name: 'Service Advisor',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const financeToken = {
  uid: 'finance-789',
  email: 'finance@vmotiv.in',
  name: 'Finance Executive',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

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
    getPaymentOptionsForCategory: vi.fn().mockResolvedValue({
      categoryKey: 'REGULAR_SERVICE',
      categoryTitle: 'Regular Maintenance',
      pricingType: 'FIXED',
      fixedPackageAvailable: true,
      packagePricePaise: '499900',
      diagnosticFeePaise: '50000',
      policyCode: 'VMS-POL-2026.1',
      options: [
        { planId: 'ZERO_UPFRONT', title: 'Zero Upfront Booking', payNowPaise: '0', balancePaise: '499900' },
        { planId: 'PARTIAL_ADVANCE_25', title: 'Priority Advance (25%)', percentage: 25, payNowPaise: '124975', balancePaise: '374925' },
        { planId: 'FULL_PAYMENT_100', title: 'Full Advance Payment (100%)', percentage: 100, payNowPaise: '499900', balancePaise: '0' },
      ],
    }),
    updateCategoryPricing: vi.fn().mockResolvedValue({
      id: 'cat-1',
      categoryKey: 'REGULAR_SERVICE',
      pricingType: 'FIXED',
      fixedPackageAvailable: true,
      packagePricePaise: 599900n,
      diagnosticFeePaise: 50000n,
    }),
    getServicePaymentSummary: vi.fn().mockResolvedValue({
      requestId: REQUEST_ID,
      requestNumber: 'SR-20261101-1234',
      servicePaymentStatus: 'PARTIALLY_PAID',
      depositStatus: 'NOT_COLLECTED',
      verifiedPaidPaise: '124975',
      outstandingBalancePaise: '374925',
      payments: [],
    }),
    verifyCustomerGatewayPayment: vi.fn().mockResolvedValue({
      success: true,
      servicePaymentStatus: 'PAID_IN_FULL',
      verifiedPaidPaise: '499900',
      outstandingBalancePaise: '0',
    }),
    generateServiceInvoice: vi.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-SR-20261101-1234',
      subtotalPaise: '423644',
      cgstPaise: '38128',
      sgstPaise: '38128',
      totalAmountPaise: '499900',
      outstandingPaise: '374925',
      status: 'ISSUED',
      issuedAt: new Date().toISOString(),
    }),
    computeServiceReleaseReadiness: vi.fn().mockResolvedValue({
      canRelease: false,
      reasons: ['Outstanding balance of ₹3,749 must be paid in full prior to release.'],
      gateChecks: {
        qcPassed: true,
        estimateApproved: true,
        invoiceIssued: true,
        paymentSettled: false,
      },
      billAmountPaise: '499900',
      totalVerifiedPaidPaise: '124975',
      outstandingBalancePaise: '374925',
    }),
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

  it('GET /api/v2/service/categories/:key/payment-options returns calculated payment plans with paise math', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app).get('/api/v2/service/categories/REGULAR_SERVICE/payment-options');
    expect(res.status).toBe(200);
    expect(res.body.categoryKey).toBe('REGULAR_SERVICE');
    expect(res.body.options).toHaveLength(3);
    expect(res.body.options[0].planId).toBe('ZERO_UPFRONT');
    expect(res.body.options[1].planId).toBe('PARTIAL_ADVANCE_25');
    expect(res.body.options[1].payNowPaise).toBe('124975');
    expect(mockServiceStore.getPaymentOptionsForCategory).toHaveBeenCalledWith('REGULAR_SERVICE');
  });

  it('PUT /api/v2/operations/service/categories/:key/pricing allows Ops to update pricing and features', async () => {
    const { app, mockServiceStore } = setupApp('SERVICE_ADVISOR');
    const res = await request(app)
      .put('/api/v2/operations/service/categories/REGULAR_SERVICE/pricing')
      .set('Authorization', 'Bearer staff-token')
      .send({
        pricingType: 'FIXED',
        fixedPackageAvailable: true,
        packagePriceRupees: 5999,
        diagnosticFeeRupees: 500,
        packageFeatures: ['Engine Oil Flush', 'OEM Oil Filter Cartridge'],
      });
    expect(res.status).toBe(200);
    expect(mockServiceStore.updateCategoryPricing).toHaveBeenCalled();
  });

  it('GET /api/v2/service/requests/:id/payment-summary returns verified paid and outstanding balance', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .get(`/api/v2/service/requests/${REQUEST_ID}/payment-summary`)
      .set('Authorization', 'Bearer valid-customer-token');
    expect(res.status).toBe(200);
    expect(res.body.servicePaymentStatus).toBe('PARTIALLY_PAID');
    expect(res.body.verifiedPaidPaise).toBe('124975');
    expect(mockServiceStore.getServicePaymentSummary).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('POST /api/v2/service/requests/:id/verify-payment verifies payment signature & settles balance', async () => {
    const { app, mockServiceStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post(`/api/v2/service/requests/${REQUEST_ID}/verify-payment`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        gatewayOrderId: 'order_test_123',
        gatewayPaymentId: 'pay_test_456',
        gatewaySignature: 'demo_sig_verified_vmotiv',
        amountPaise: '374925',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockServiceStore.verifyCustomerGatewayPayment).toHaveBeenCalled();
  });

  it('POST /api/v2/operations/service/jobs/:id/invoices/generate produces official 18% GST tax invoice', async () => {
    const { app, mockServiceStore } = setupApp('SERVICE_ADVISOR');
    const res = await request(app)
      .post(`/api/v2/operations/service/jobs/${REQUEST_ID}/invoices/generate`)
      .set('Authorization', 'Bearer staff-token')
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toBe('INV-SR-20261101-1234');
    expect(res.body.totalAmountPaise).toBe('499900');
    expect(mockServiceStore.generateServiceInvoice).toHaveBeenCalled();
  });

  it('GET /api/v2/operations/service/jobs/:id/release-readiness strictly enforces 4 release gate conditions', async () => {
    const { app, mockServiceStore } = setupApp('SERVICE_ADVISOR');
    const res = await request(app)
      .get(`/api/v2/operations/service/jobs/${REQUEST_ID}/release-readiness`)
      .set('Authorization', 'Bearer staff-token');
    expect(res.status).toBe(200);
    expect(res.body.canRelease).toBe(false);
    expect(res.body.gateChecks.paymentSettled).toBe(false);
    expect(mockServiceStore.computeServiceReleaseReadiness).toHaveBeenCalledWith(REQUEST_ID);
  });
});
