import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import { PrismaRentalStore } from '../src/rental-store.js';
import { HttpError } from '../src/errors.js';
import crypto from 'node:crypto';

const customerToken = {
  uid: 'cust-123',
  email: 'customer@example.com',
  name: 'Rental Customer',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const otherCustomerToken = {
  uid: 'cust-999',
  email: 'other@example.com',
  name: 'Other Customer',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const dispatchToken = {
  uid: 'dispatch-456',
  email: 'dispatch@vmotiv.in',
  name: 'Rental Dispatch Officer',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const managerToken = {
  uid: 'manager-101',
  email: 'rental.manager@vmotiv.in',
  name: 'Rental Manager',
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
const HOLD_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const EXTENSION_ID = '55555555-5555-4555-8555-555555555555';

function setupApp(activeRole: 'CUSTOMER' | 'OTHER_CUSTOMER' | 'RENTAL_DISPATCH' | 'RENTAL_MANAGER' | 'FINANCE') {
  const verify = vi.fn().mockImplementation(async (token: string) => {
    if (token === 'dispatch-token') return dispatchToken;
    if (token === 'manager-token') return managerToken;
    if (token === 'finance-token') return financeToken;
    if (token === 'other-customer-token') return otherCustomerToken;
    return customerToken;
  });

  const mockDb: any = {
    serviceHub: {
      findMany: vi.fn().mockResolvedValue([
        { id: HUB_ID, code: 'HUB-BLR-01', name: 'Indiranagar Hub', city: 'Bengaluru', address: '100ft Road', isActive: true },
      ]),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.firebaseUid === 'dispatch-456' || where.id === 'user-dispatch-456') {
          return Promise.resolve({
            id: 'user-dispatch-456',
            employee: {
              userId: 'user-dispatch-456',
              status: 'ACTIVE',
              roleAssignments: [{ role: { name: 'RENTAL_DISPATCH' } }],
            },
          });
        }
        if (where.firebaseUid === 'manager-101' || where.id === 'user-manager-101') {
          return Promise.resolve({
            id: 'user-manager-101',
            employee: {
              userId: 'user-manager-101',
              status: 'ACTIVE',
              roleAssignments: [{ role: { name: 'RENTAL_MANAGER' } }],
            },
          });
        }
        if (where.firebaseUid === 'finance-789' || where.id === 'user-finance-789') {
          return Promise.resolve({
            id: 'user-finance-789',
            employee: {
              userId: 'user-finance-789',
              status: 'ACTIVE',
              roleAssignments: [{ role: { name: 'FINANCE' } }],
            },
          });
        }
        if (where.firebaseUid === 'cust-999' || where.id === 'user-cust-999') {
          return Promise.resolve({ id: 'user-cust-999', displayName: 'Other Customer' });
        }
        return Promise.resolve({ id: 'user-cust-123', displayName: 'Rental Customer' });
      }),
    },
  };

  const mockRentalStore: Partial<PrismaRentalStore> = {
    resolveUserId: vi.fn().mockImplementation(async (idOrUid: string) => {
      if (idOrUid === 'cust-999' || idOrUid === 'user-cust-999') return 'user-cust-999';
      return 'user-cust-123';
    }),
    searchVehicles: vi.fn().mockResolvedValue([
      {
        id: VEHICLE_ID,
        fleetNumber: 'VMF-001',
        make: 'Hyundai',
        model: 'Creta',
        year: 2023,
        fuelType: 'PETROL',
        transmission: 'AUTOMATIC',
        seats: 5,
        color: 'Polar White',
        baseDailyRatePaise: '300000',
        baseHourlyRatePaise: '20000',
        securityDepositPaise: '500000',
        includedKmPerDay: 250,
        extraKmRatePaise: '1200',
        quote: {
          totalHours: 48,
          billableDays: 2,
          remainderHours: 0,
          baseFarePaise: '600000',
          taxPaise: '108000',
          securityDepositPaise: '500000',
          totalPayablePaise: '1208000',
          includedKm: 500,
          extraKmRatePaise: '1200',
        },
      },
    ]),
    getVehicleDetails: vi.fn().mockResolvedValue({
      id: VEHICLE_ID,
      fleetNumber: 'VMF-001',
      make: 'Hyundai',
      model: 'Creta',
      year: 2023,
      fuelType: 'PETROL',
      transmission: 'AUTOMATIC',
      seats: 5,
      color: 'Polar White',
      commercialPermitNumber: 'KA-RENT-2023-001',
      baseDailyRatePaise: '300000',
      baseHourlyRatePaise: '20000',
      securityDepositPaise: '500000',
      includedKmPerDay: 250,
      extraKmRatePaise: '1200',
    }),
    createHold: vi.fn().mockResolvedValue({
      id: HOLD_ID,
      holdCode: 'HLD-TEST-1234',
      vehicleId: VEHICLE_ID,
      customerId: 'user-cust-123',
      hubId: HUB_ID,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    checkoutHold: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      bookingNumber: 'VMR-2026-0001',
      totalPayablePaise: '1208000',
      gatewayOrderId: 'order_VMR_12345',
      validUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    verifyPayment: vi.fn().mockResolvedValue({
      booking: {
        id: BOOKING_ID,
        bookingNumber: 'VMR-2026-0001',
        status: 'CONFIRMED',
        kycStatus: 'PENDING_REVIEW',
      },
      alreadyVerified: false,
    }),
    submitDriverKyc: vi.fn().mockResolvedValue({
      id: 'kyc-1',
      bookingId: BOOKING_ID,
      licenseNumber: 'KA0120180012345',
      status: 'PENDING_REVIEW',
    }),
    getCustomerRentals: vi.fn().mockResolvedValue([
      { id: BOOKING_ID, bookingNumber: 'VMR-2026-0001', status: 'CONFIRMED' },
    ]),
    getBookingDetails: vi.fn().mockImplementation(async (bookingId: string, customerId?: string) => {
      if (customerId && customerId === 'user-cust-999') {
        throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      }
      return {
        id: bookingId,
        bookingNumber: 'VMR-2026-0001',
        customerId: 'user-cust-123',
        status: 'CONFIRMED',
        kycStatus: 'PENDING_REVIEW',
      };
    }),
    cancelBooking: vi.fn().mockResolvedValue({
      booking: { id: BOOKING_ID, status: 'CANCELLED' },
      calculatedRefundPaise: 1208000n,
    }),
    requestExtension: vi.fn().mockResolvedValue({
      id: EXTENSION_ID,
      bookingId: BOOKING_ID,
      requestedEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'REQUESTED',
    }),
    getOperationsSummary: vi.fn().mockResolvedValue({
      totalFleet: 12,
      availableCount: 8,
      onTripCount: 3,
      maintenanceCount: 1,
      activeBookingsCount: 3,
      pendingKycCount: 1,
      pendingDamageReviewCount: 0,
    }),
    getFleet: vi.fn().mockResolvedValue([
      { id: VEHICLE_ID, fleetNumber: 'VMF-001', status: 'AVAILABLE' },
    ]),
    createFleetVehicle: vi.fn().mockResolvedValue({
      id: 'veh-new-99',
      fleetNumber: 'VMF-002',
      make: 'Tata',
      model: 'Harrier',
    }),
    addVehicleBlock: vi.fn().mockResolvedValue({
      id: 'blk-1',
      reason: 'MAINTENANCE',
    }),
    getOperationsBookings: vi.fn().mockResolvedValue([
      { id: BOOKING_ID, bookingNumber: 'VMR-2026-0001', status: 'CONFIRMED' },
    ]),
    reviewDriverKyc: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'VERIFIED',
    }),
    recordPickupHandover: vi.fn().mockResolvedValue({
      id: BOOKING_ID,
      status: 'TRIP_ACTIVE',
    }),
    recordReturnAndSettlement: vi.fn().mockResolvedValue({
      booking: { id: BOOKING_ID, status: 'SETTLED' },
      trip: { excessKm: 40, excessKmChargePaise: '48000', depositRefundPaise: '452000', isSettled: true },
    }),
    approveExtension: vi.fn().mockResolvedValue({
      id: EXTENSION_ID,
      status: 'APPROVED',
    }),
    authorizeDepositRefund: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'VERIFIED',
      amountPaise: 452000n,
    }),
    getPaymentOptions: vi.fn().mockResolvedValue({
      quoteId: HOLD_ID,
      policyVersion: 'VMR-POL-2026.1',
      rentalChargesPaise: '708000',
      securityDepositPaise: '500000',
      plans: [
        { planId: 'ADVANCE_25', advancePercent: 25, advancePaise: '177000', balancePaise: '531000', isAvailable: true },
        { planId: 'FULL_100', advancePercent: 100, advancePaise: '708000', balancePaise: '0', isAvailable: true },
      ],
    }),
    getPaymentSummary: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      bookingNumber: 'VMR-2026-0001',
      rentalTotalPaise: '708000',
      verifiedPaidPaise: '177000',
      outstandingPaise: '531000',
      paymentStatus: 'PARTIALLY_PAID',
      balanceDueAt: '2026-11-04T10:00:00.000Z',
      isOverdue: false,
      deposit: { requiredPaise: '500000', status: 'NOT_COLLECTED' },
      pickupReadiness: { eligible: false, blockers: ['RENTAL_BALANCE_PENDING'] },
    }),
    getPaymentSchedule: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      currency: 'INR',
      rentalTotalPaise: '708000',
      installments: [
        { installmentNumber: 1, type: 'ADVANCE', amountPaise: '177000', status: 'VERIFIED' },
        { installmentNumber: 2, type: 'BALANCE', amountPaise: '531000', status: 'PENDING' },
      ],
      deposit: { title: 'Refundable Security Deposit', amountPaise: '500000', status: 'NOT_COLLECTED' },
    }),
    getPaymentHistory: vi.fn().mockResolvedValue([
      { id: 'pay-1', installmentType: 'ADVANCE', amountPaise: '177000', status: 'VERIFIED', paymentGateway: 'RAZORPAY' },
    ]),
    createBalancePaymentOrder: vi.fn().mockResolvedValue({
      bookingId: BOOKING_ID,
      bookingNumber: 'VMR-2026-0001',
      gatewayOrderId: 'order_bal_123',
      amountPaise: '531000',
      currency: 'INR',
    }),
    verifyBalancePayment: vi.fn().mockResolvedValue({
      success: true,
      rentalPaymentStatus: 'PAID_IN_FULL',
      verifiedPaidPaise: '708000',
      outstandingBalancePaise: '0',
    }),
    getPickupReadiness: vi.fn().mockResolvedValue({
      eligible: false,
      blockers: ['RENTAL_BALANCE_PENDING'],
      checklist: { rentalPaymentComplete: false, driverEligible: true, vehicleReady: true },
    }),
    getOperationsPaymentDashboard: vi.fn().mockResolvedValue({
      partiallyPaidBookings: 2,
      fullyPaidBookings: 5,
      overduePayments: 1,
      upcomingPickupsBlocked: 3,
      paymentReconciliation: 0,
      totalBookings: 8,
    }),
  };

  const app = createApp({
    verify,
    store: { sync: vi.fn(), find: vi.fn() } as any,
    webOrigin: 'http://localhost:3000',
    rental: mockRentalStore as PrismaRentalStore,
    db: mockDb,
  });

  return { app, mockRentalStore, mockDb };
}

describe('V MOTIV V2 — Advance Car Rental Platform API Suite', () => {
  // -------------------------------------------------------------
  // 1. Search & Availability
  // -------------------------------------------------------------
  it('1. GET /api/v2/rentals/search allows searching available fleet for future intervals', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v2/rentals/search?city=Bengaluru&startTime=${futureStart}&endTime=${futureEnd}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].fleetNumber).toBe('VMF-001');
    expect(mockRentalStore.searchVehicles).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 2. Hubs & Vehicle Details
  // -------------------------------------------------------------
  it('2a. GET /api/v2/rentals/hubs reads only backwards-compatible hub fields', async () => {
    const { app, mockDb } = setupApp('CUSTOMER');

    const res = await request(app)
      .get('/api/v2/rentals/hubs')
      .expect(200);

    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: HUB_ID, name: 'Indiranagar Hub', supportsRentals: true }),
    ]));
    expect(mockDb.serviceHub.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true },
      select: { id: true, name: true, city: true, address: true, code: true, isActive: true },
    }));
  });

  it('2. GET /api/v2/rentals/vehicles/:id returns vehicle specs and dynamic quote', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v2/rentals/vehicles/${VEHICLE_ID}?startTime=${futureStart}&endTime=${futureEnd}`)
      .expect(200);

    expect(res.body.id).toBe(VEHICLE_ID);
    expect(res.body.make).toBe('Hyundai');
    expect(mockRentalStore.getVehicleDetails).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 3. Temporary 15-Minute Checkout Hold
  // -------------------------------------------------------------
  it('3. POST /api/v2/rentals/holds creates an exclusive checkout hold with TTL', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v2/rentals/holds')
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        vehicleId: VEHICLE_ID,
        hubId: HUB_ID,
        startTime: futureStart,
        endTime: futureEnd,
      })
      .expect(201);

    expect(res.body.id).toBe(HOLD_ID);
    expect(res.body.status).toBe('ACTIVE');
    expect(mockRentalStore.createHold).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 4. Terms Acceptance Required at Checkout
  // -------------------------------------------------------------
  it('4. POST /api/v2/rentals/holds/:id/checkout requires terms acceptance', async () => {
    const { app } = setupApp('CUSTOMER');

    const res = await request(app)
      .post(`/api/v2/rentals/holds/${HOLD_ID}/checkout`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        acceptTerms: false,
        termsVersion: 'VMR-TERMS-V2026.1',
      })
      .expect(400);

    expect(res.body.code).toBe('INVALID_INPUT');
  });

  // -------------------------------------------------------------
  // 5. Checkout Conversion to Pending Booking
  // -------------------------------------------------------------
  it('5. POST /api/v2/rentals/holds/:id/checkout creates booking order with terms accepted', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const res = await request(app)
      .post(`/api/v2/rentals/holds/${HOLD_ID}/checkout`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        acceptTerms: true,
        termsVersion: 'VMR-TERMS-V2026.1',
      })
      .expect(201);

    expect(res.body.bookingId).toBe(BOOKING_ID);
    expect(res.body.bookingNumber).toBe('VMR-2026-0001');
    expect(mockRentalStore.checkoutHold).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 6. Server-Side Payment Verification & Booking Confirmation
  // -------------------------------------------------------------
  it('6. POST /api/v2/rentals/bookings/:id/verify-payment confirms booking on verified gateway signature', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const res = await request(app)
      .post(`/api/v2/rentals/bookings/${BOOKING_ID}/verify-payment`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        paymentGateway: 'RAZORPAY',
        gatewayOrderId: 'order_VMR_12345',
        gatewayPaymentId: 'pay_1234567890',
        gatewaySignature: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      })
      .expect(200);

    expect(res.body.booking.status).toBe('CONFIRMED');
    expect(mockRentalStore.verifyPayment).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 7. Customer Driver KYC Submission
  // -------------------------------------------------------------
  it('7. POST /api/v2/rentals/bookings/:id/driver-kyc submits primary driver license details', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const res = await request(app)
      .post(`/api/v2/rentals/bookings/${BOOKING_ID}/driver-kyc`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        licenseNumber: 'KA0120180012345',
        licenseExpiry: '2032-12-31',
        licenseCategory: 'LMV',
        dateOfBirth: '1998-05-15',
        drivingExperienceYears: 6,
        licenseFrontUrl: 'https://storage.vmotiv.in/kyc/dl-front.jpg',
        licenseBackUrl: 'https://storage.vmotiv.in/kyc/dl-back.jpg',
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING_REVIEW');
    expect(mockRentalStore.submitDriverKyc).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 8. Other Customer Booking Privacy Inaccessible (403 Forbidden)
  // -------------------------------------------------------------
  it('8. GET /api/v2/rentals/bookings/:id rejects unauthorized customer access', async () => {
    const { app } = setupApp('OTHER_CUSTOMER');

    const res = await request(app)
      .get(`/api/v2/rentals/bookings/${BOOKING_ID}`)
      .set('Authorization', 'Bearer other-customer-token')
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN_BOOKING_OWNER_MISMATCH');
  });

  // -------------------------------------------------------------
  // 9. Operations Fleet Management Access Control
  // -------------------------------------------------------------
  it('9. Operations endpoints require authorized rental employee roles', async () => {
    const { app } = setupApp('CUSTOMER');

    // Customer attempting to view fleet management
    await request(app)
      .get('/api/v2/operations/rentals/fleet')
      .set('Authorization', 'Bearer valid-customer-token')
      .expect(403);

    // Authorized Dispatch Officer viewing fleet
    const { app: dispatchApp } = setupApp('RENTAL_DISPATCH');
    const res = await request(dispatchApp)
      .get('/api/v2/operations/rentals/fleet')
      .set('Authorization', 'Bearer dispatch-token')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // -------------------------------------------------------------
  // 10. Operations Driver KYC Review & Approval
  // -------------------------------------------------------------
  it('10. POST /api/v2/operations/rentals/bookings/:id/kyc/review approves driver KYC', async () => {
    const { app, mockRentalStore } = setupApp('RENTAL_DISPATCH');

    const res = await request(app)
      .post(`/api/v2/operations/rentals/bookings/${BOOKING_ID}/kyc/review`)
      .set('Authorization', 'Bearer dispatch-token')
      .send({
        decision: 'APPROVE',
      })
      .expect(200);

    expect(res.body.status).toBe('VERIFIED');
    expect(mockRentalStore.reviewDriverKyc).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 11. Strict KYC Gate for Vehicle Pickup Handover
  // -------------------------------------------------------------
  it('11. POST /api/v2/operations/rentals/bookings/:id/handover records pickup custody', async () => {
    const { app, mockRentalStore } = setupApp('RENTAL_DISPATCH');

    const res = await request(app)
      .post(`/api/v2/operations/rentals/bookings/${BOOKING_ID}/handover`)
      .set('Authorization', 'Bearer dispatch-token')
      .send({
        odometerKm: 24500,
        fuelPercent: 100,
        photos: ['https://storage.vmotiv.in/custody/pickup1.jpg'],
        notes: 'Vehicle inspected and keys handed over',
        customerSigned: true,
      })
      .expect(200);

    expect(res.body.status).toBe('TRIP_ACTIVE');
    expect(mockRentalStore.recordPickupHandover).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 12. Trip Extension Request
  // -------------------------------------------------------------
  it('12. POST /api/v2/rentals/bookings/:id/extension-requests allows customer to request extra time', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');

    const newEnd = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/v2/rentals/bookings/${BOOKING_ID}/extension-requests`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        requestedEndTime: newEnd,
      })
      .expect(201);

    expect(res.body.status).toBe('REQUESTED');
    expect(mockRentalStore.requestExtension).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 13. Return Inspection, Excess Km & Final Settlement
  // -------------------------------------------------------------
  it('13. POST /api/v2/operations/rentals/bookings/:id/return records return custody & computes settlement', async () => {
    const { app, mockRentalStore } = setupApp('RENTAL_DISPATCH');

    const res = await request(app)
      .post(`/api/v2/operations/rentals/bookings/${BOOKING_ID}/return`)
      .set('Authorization', 'Bearer dispatch-token')
      .send({
        returnOdometerKm: 25040,
        returnFuelPercent: 100,
        photos: ['https://storage.vmotiv.in/custody/return1.jpg'],
        notes: 'Vehicle returned in clean condition',
        customerSigned: true,
      })
      .expect(200);

    expect(res.body.booking.status).toBe('SETTLED');
    expect(res.body.trip.excessKm).toBe(40);
    expect(mockRentalStore.recordReturnAndSettlement).toHaveBeenCalled();
  });

  // -------------------------------------------------------------
  // 14. Finance Deposit Refund Authorization
  // -------------------------------------------------------------
  it('14. POST /api/v2/operations/rentals/bookings/:id/refund authorizes deposit refund (Finance Only)', async () => {
    const { app: dispatchApp } = setupApp('RENTAL_DISPATCH');

    // Non-finance staff is rejected
    await request(dispatchApp)
      .post(`/api/v2/operations/rentals/bookings/${BOOKING_ID}/refund`)
      .set('Authorization', 'Bearer dispatch-token')
      .send({
        refundPaise: 452000,
        bankReference: 'NEFT-REF-20261027-01',
      })
      .expect(403);

    // Finance officer is authorized
    const { app: financeApp, mockRentalStore } = setupApp('FINANCE');
    const res = await request(financeApp)
      .post(`/api/v2/operations/rentals/bookings/${BOOKING_ID}/refund`)
      .set('Authorization', 'Bearer finance-token')
      .send({
        refundPaise: 452000,
        bankReference: 'NEFT-REF-20261027-01',
        notes: 'Verified bank refund to original payment source',
      })
      .expect(200);

    expect(res.body.status).toBe('VERIFIED');
    expect(mockRentalStore.authorizeDepositRefund).toHaveBeenCalled();
  });

  it('15. GET /api/v2/rentals/holds/:id/payment-options returns configurable advance payment plans', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .get(`/api/v2/rentals/holds/${HOLD_ID}/payment-options`)
      .expect(200);

    expect(res.body.policyVersion).toBe('VMR-POL-2026.1');
    expect(res.body.plans).toBeInstanceOf(Array);
    expect(mockRentalStore.getPaymentOptions).toHaveBeenCalled();
  });

  it('16. GET /api/v2/rentals/bookings/:id/payment-summary returns authoritative ledger snapshot', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .get(`/api/v2/rentals/bookings/${BOOKING_ID}/payment-summary`)
      .set('Authorization', 'Bearer customer-token')
      .expect(200);

    expect(res.body.bookingId).toBe(BOOKING_ID);
    expect(res.body.paymentStatus).toBe('PARTIALLY_PAID');
    expect(res.body.outstandingPaise).toBe('531000');
    expect(mockRentalStore.getPaymentSummary).toHaveBeenCalled();
  });

  it('17. POST /api/v2/rentals/bookings/:id/pay-balance creates idempotent balance payment order', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post(`/api/v2/rentals/bookings/${BOOKING_ID}/pay-balance`)
      .set('Authorization', 'Bearer customer-token')
      .expect(201);

    expect(res.body.gatewayOrderId).toBe('order_bal_123');
    expect(res.body.amountPaise).toBe('531000');
    expect(mockRentalStore.createBalancePaymentOrder).toHaveBeenCalled();
  });

  it('18. POST /api/v2/rentals/bookings/:id/verify-balance-payment transitions booking to PAID_IN_FULL', async () => {
    const { app, mockRentalStore } = setupApp('CUSTOMER');
    const res = await request(app)
      .post(`/api/v2/rentals/bookings/${BOOKING_ID}/verify-balance-payment`)
      .set('Authorization', 'Bearer customer-token')
      .send({
        paymentGateway: 'RAZORPAY',
        gatewayOrderId: 'order_bal_123',
        gatewayPaymentId: 'pay_bal_456',
        gatewaySignature: 'sig_bal_789',
      })
      .expect(200);

    expect(res.body.rentalPaymentStatus).toBe('PAID_IN_FULL');
    expect(res.body.outstandingBalancePaise).toBe('0');
    expect(mockRentalStore.verifyBalancePayment).toHaveBeenCalled();
  });

  it('19. GET /api/v2/operations/rentals/payment-dashboard returns real-time financial tracking widgets', async () => {
    const { app, mockRentalStore } = setupApp('RENTAL_DISPATCH');
    const res = await request(app)
      .get('/api/v2/operations/rentals/payment-dashboard')
      .set('Authorization', 'Bearer dispatch-token')
      .expect(200);

    expect(res.body.partiallyPaidBookings).toBe(2);
    expect(res.body.fullyPaidBookings).toBe(5);
    expect(res.body.overduePayments).toBe(1);
    expect(res.body.upcomingPickupsBlocked).toBe(3);
    expect(mockRentalStore.getOperationsPaymentDashboard).toHaveBeenCalled();
  });
});

describe('PrismaRentalStore — Core Engine Unit Rules', () => {
  const store = new PrismaRentalStore({} as any);

  it('Enforces minimum 8 hours rental duration', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTooShort = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4 hours

    expect(() => store.validateRentalInterval(start, endTooShort)).toThrow(
      'MINIMUM_RENTAL_DURATION_IS_8_HOURS'
    );
  });

  it('Enforces maximum 30 days rental duration', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTooLong = new Date(start.getTime() + 35 * 24 * 60 * 60 * 1000); // 35 days

    expect(() => store.validateRentalInterval(start, endTooLong)).toThrow(
      'MAXIMUM_RENTAL_DURATION_IS_30_DAYS'
    );
  });

  it('Enforces minimum 2 hours advance reservation notice', () => {
    const startTooSoon = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
    const end = new Date(startTooSoon.getTime() + 12 * 60 * 60 * 1000);

    expect(() => store.validateRentalInterval(startTooSoon, end)).toThrow(
      'START_TIME_MUST_BE_AT_LEAST_2_HOURS_IN_ADVANCE'
    );
  });

  it('Accurately computes versioned pricing, 18% GST and refundable security deposit', () => {
    const start = new Date('2026-11-01T10:00:00Z');
    const end = new Date('2026-11-03T10:00:00Z'); // 48 hours = 2 days

    const quote = store.calculateQuote(
      {
        id: VEHICLE_ID,
        baseDailyRatePaise: 300000n, // ₹3,000/day
        baseHourlyRatePaise: 20000n,
        securityDepositPaise: 500000n, // ₹5,000 deposit
        includedKmPerDay: 250,
        extraKmRatePaise: 1200n, // ₹12/km
      },
      start,
      end
    );

    expect(quote.billableDays).toBe(2);
    expect(quote.baseFarePaise).toBe(600000n); // ₹6,000
    expect(quote.taxPaise).toBe(108000n); // 18% of ₹6,000 = ₹1,080
    expect(quote.securityDepositPaise).toBe(500000n); // ₹5,000
    expect(quote.totalPayablePaise).toBe(1208000n); // ₹6,000 + ₹1,080 + ₹5,000 = ₹12,080
    expect(quote.includedKm).toBe(500); // 2 * 250 km
    expect(quote.termsVersion).toBe('VMR-TERMS-V2026.1');
  });

  it('Evaluates authoritative pickup readiness: blocks when balance is pending', () => {
    const readiness = store.computePickupReadiness(
      {
        status: 'CONFIRMED',
        kycStatus: 'VERIFIED',
        vehicle: { status: 'AVAILABLE' },
      },
      600000n, // ₹6,000 pending
      'PARTIALLY_PAID'
    );

    expect(readiness.eligible).toBe(false);
    expect(readiness.blockers).toContain('RENTAL_BALANCE_PENDING');
    expect(readiness.checklist.rentalPaymentComplete).toBe(false);
    expect(readiness.checklist.driverEligible).toBe(true);
    expect(readiness.checklist.vehicleReady).toBe(true);
  });

  it('Evaluates authoritative pickup readiness: eligible when fully paid and KYC verified', () => {
    const readiness = store.computePickupReadiness(
      {
        status: 'CONFIRMED',
        kycStatus: 'VERIFIED',
        rentalPaymentStatus: 'PAID_IN_FULL',
        vehicle: { status: 'AVAILABLE' },
      },
      0n, // ₹0 balance
      'PAID_IN_FULL'
    );

    expect(readiness.eligible).toBe(true);
    expect(readiness.blockers.length).toBe(0);
    expect(readiness.checklist.rentalPaymentComplete).toBe(true);
    expect(readiness.checklist.driverEligible).toBe(true);
  });

  it('Evaluates authoritative pickup readiness: blocks if driver KYC is not verified', () => {
    const readiness = store.computePickupReadiness(
      {
        status: 'CONFIRMED',
        kycStatus: 'PENDING_REVIEW',
        rentalPaymentStatus: 'PAID_IN_FULL',
        vehicle: { status: 'AVAILABLE' },
      },
      0n,
      'PAID_IN_FULL'
    );

    expect(readiness.eligible).toBe(false);
    expect(readiness.blockers).toContain('KYC_NOT_VERIFIED');
  });
});
