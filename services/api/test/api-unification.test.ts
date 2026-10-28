import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';

const mockCustomerToken = {
  uid: 'user-unify-1',
  email: 'unify@example.com',
  name: 'Unify Test User',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

describe('Unified API (/api/v2 canonical with /api/v1 and /api aliases)', () => {
  const verify = vi.fn().mockImplementation(async () => mockCustomerToken);

  const mockIdentityStore: any = {
    ready: vi.fn().mockResolvedValue(true),
    sync: vi.fn().mockResolvedValue({ id: 'user-unify-1', email: 'unify@example.com' }),
    find: vi.fn().mockResolvedValue({ id: 'user-unify-1', status: 'ACTIVE', email: 'unify@example.com' }),
  };

  const mockCustomerStore: any = {
    inventory: vi.fn().mockResolvedValue({ items: [{ id: 'car-1', make: 'Honda' }], total: 1 }),
    cities: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Bengaluru' }]),
    vehicle: vi.fn().mockResolvedValue({ id: 'car-1', make: 'Honda' }),
    wishlist: vi.fn().mockResolvedValue([]),
    drives: vi.fn().mockResolvedValue([]),
    leads: vi.fn().mockResolvedValue([]),
    purchaseEnquiries: vi.fn().mockResolvedValue([]),
  };

  const mockServiceStore: any = {
    listCustomerVehicles: vi.fn().mockResolvedValue([
      { id: 'veh-1', make: 'Hyundai', model: 'Creta', year: 2023, isPreferred: true, photoUrls: [] },
    ]),
    getIssueCategories: vi.fn().mockResolvedValue([
      { categoryKey: 'PERIODIC_MAINTENANCE', title: 'Periodic Maintenance' },
    ]),
  };

  const app = createApp({
    verify,
    store: mockIdentityStore,
    customer: mockCustomerStore,
    service: mockServiceStore,
    webOrigin: 'http://localhost:3100',
  });

  it('serves health endpoints on /health, /api/v1/health/live, and /api/v2/health/live', async () => {
    const r1 = await request(app).get('/health');
    const r2 = await request(app).get('/api/v1/health/live');
    const r3 = await request(app).get('/api/v2/health/live');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it('serves inventory and cities seamlessly across /api/v2, /api/v1, and /api', async () => {
    const v2Inv = await request(app).get('/api/v2/inventory');
    const v1Inv = await request(app).get('/api/v1/inventory');
    const apiInv = await request(app).get('/api/inventory');
    expect(v2Inv.status).toBe(200);
    expect(v1Inv.status).toBe(200);
    expect(apiInv.status).toBe(200);

    const v2Cities = await request(app).get('/api/v2/cities');
    const v1Cities = await request(app).get('/api/v1/cities');
    const apiCities = await request(app).get('/api/cities');
    expect(v2Cities.status).toBe(200);
    expect(v1Cities.status).toBe(200);
    expect(apiCities.status).toBe(200);
  });

  it('serves customer profile /me and /auth/sync across /api/v2, /api/v1, and /api', async () => {
    const authHeader = 'Bearer test-valid-token';
    const v2Me = await request(app).get('/api/v2/me').set('Authorization', authHeader);
    const v1Me = await request(app).get('/api/v1/me').set('Authorization', authHeader);
    const apiMe = await request(app).get('/api/me').set('Authorization', authHeader);
    expect(v2Me.status).toBe(200);
    expect(v1Me.status).toBe(200);
    expect(apiMe.status).toBe(200);
    expect(v2Me.body.id).toBe('user-unify-1');
  });

  it('serves customer garage across /api/v2/customer/garage, /api/v1/customer/garage, and /api/customer/garage', async () => {
    const authHeader = 'Bearer test-valid-token';
    const v2Garage = await request(app).get('/api/v2/customer/garage').set('Authorization', authHeader);
    const v1Garage = await request(app).get('/api/v1/customer/garage').set('Authorization', authHeader);
    const apiGarage = await request(app).get('/api/customer/garage').set('Authorization', authHeader);
    expect(v2Garage.status).toBe(200);
    expect(v1Garage.status).toBe(200);
    expect(apiGarage.status).toBe(200);
    expect(v2Garage.body[0].make).toBe('Hyundai');
  });

  it('serves service categories across /api/v2/service/categories, /api/v1/service/categories, and /api/service/categories', async () => {
    const v2Cat = await request(app).get('/api/v2/service/categories');
    const v1Cat = await request(app).get('/api/v1/service/categories');
    const apiCat = await request(app).get('/api/service/categories');
    expect(v2Cat.status).toBe(200);
    expect(v1Cat.status).toBe(200);
    expect(apiCat.status).toBe(200);
  });
});
