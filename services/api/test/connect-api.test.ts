import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import { PrismaConnectStore, sha256 } from '../src/connect-store.js';

const customerToken = {
  uid: 'cust-connect-123',
  email: 'owner@example.com',
  name: 'Car Owner',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const otherCustomerToken = {
  uid: 'cust-other-456',
  email: 'stranger@example.com',
  name: 'Stranger',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as unknown as DecodedIdToken;

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const ALERT_ID = '44444444-4444-4444-8444-444444444444';
const RAW_TOKEN = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
const TOKEN_HASH = sha256(RAW_TOKEN);

function setupApp() {
  const verify = vi.fn().mockImplementation(async (token: string) => {
    if (token === 'other-token') return otherCustomerToken;
    return customerToken;
  });

  const vehicles: any[] = [
    {
      id: VEHICLE_ID,
      userId: 'user-cust-123',
      make: 'Honda',
      model: 'City',
      year: 2023,
      registrationNumber: 'KA01AB1234',
      connectStatus: 'NOT_CONNECTED',
      connectDeviceId: null,
      isArchived: false,
    },
    {
      id: OTHER_VEHICLE_ID,
      userId: 'user-other-456',
      make: 'Hyundai',
      model: 'Creta',
      year: 2022,
      registrationNumber: 'DL02CD5678',
      connectStatus: 'NOT_CONNECTED',
      connectDeviceId: null,
      isArchived: false,
    },
  ];

  let links: any[] = [];
  let alerts: any[] = [];
  let callSessions: any[] = [];
  let auditEvents: any[] = [];

  const mockDb: any = {
    user: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.firebaseUid === 'cust-connect-123') return Promise.resolve({ id: 'user-cust-123' });
        if (where.firebaseUid === 'cust-other-456') return Promise.resolve({ id: 'user-other-456' });
        return Promise.resolve(null);
      }),
    },
    customerVehicle: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = vehicles.find((v) => v.id === where.id && v.userId === where.userId && !v.isArchived);
        return Promise.resolve(found ? { ...found } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = vehicles.findIndex((v) => v.id === where.id);
        if (idx !== -1) {
          vehicles[idx] = { ...vehicles[idx], ...data };
          return Promise.resolve(vehicles[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    customerGarageConnectLink: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = links.find((l) => {
          if (where.vehicleId && l.vehicleId !== where.vehicleId) return false;
          if (where.userId && l.userId !== where.userId) return false;
          if (where.qrTokenHash && l.qrTokenHash !== where.qrTokenHash) return false;
          if (where.status?.in && !where.status.in.includes(l.status)) return false;
          return true;
        });
        if (!found) return Promise.resolve(null);
        const vehicle = vehicles.find((v) => v.id === found.vehicleId);
        return Promise.resolve({
          ...found,
          vehicle,
          notifications: alerts.filter((a) => a.linkId === found.id),
          callSessions: callSessions.filter((c) => c.linkId === found.id),
        });
      }),
      findMany: vi.fn().mockImplementation(({ where }) => {
        return Promise.resolve(links.filter((l) => !where.userId || l.userId === where.userId));
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const created = { id: LINK_ID, ...data, createdAt: new Date(), updatedAt: new Date() };
        links.push(created);
        return Promise.resolve(created);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = links.findIndex((l) => l.id === where.id);
        if (idx !== -1) {
          links[idx] = { ...links[idx], ...data, updatedAt: new Date() };
          return Promise.resolve(links[idx]);
        }
        return Promise.resolve(null);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        links.forEach((l, i) => {
          if (where.vehicleId === l.vehicleId && (!where.status?.in || where.status.in.includes(l.status))) {
            links[i] = { ...l, ...data };
          }
        });
        return Promise.resolve({ count: 1 });
      }),
      count: vi.fn().mockImplementation(({ where }) => {
        return Promise.resolve(links.filter((l) => l.userId === where.userId).length);
      }),
    },
    connectNotificationReference: {
      count: vi.fn().mockImplementation(({ where }) => {
        return Promise.resolve(alerts.filter((a) => a.linkId === where.linkId && (where.isRead === undefined || a.isRead === where.isRead)).length);
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(alerts)),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        return Promise.resolve(alerts.find((a) => a.id === where.id) || null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const item = { id: ALERT_ID, ...data, isRead: false, createdAt: new Date() };
        alerts.push(item);
        return Promise.resolve(item);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = alerts.findIndex((a) => a.id === where.id);
        if (idx !== -1) {
          alerts[idx] = { ...alerts[idx], ...data };
          return Promise.resolve(alerts[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    connectCallSessionReference: {
      count: vi.fn().mockImplementation(({ where }) => {
        return Promise.resolve(callSessions.filter((c) => c.linkId === where.linkId).length);
      }),
      upsert: vi.fn().mockImplementation(({ create }) => {
        callSessions.push(create);
        return Promise.resolve(create);
      }),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = callSessions.find((call) => {
          if (where.linkId && call.linkId !== where.linkId) return false;
          if (where.callSessionId && call.callSessionId !== where.callSessionId) return false;
          if (where.status?.in && !where.status.in.includes(call.status)) return false;
          if (where.link?.userId) {
            const link = links.find((item) => item.id === call.linkId);
            if (link?.userId !== where.link.userId) return false;
          }
          return true;
        });
        if (!found) return Promise.resolve(null);
        const link = links.find((item) => item.id === found.linkId);
        return Promise.resolve({ ...found, link });
      }),
      findMany: vi.fn().mockImplementation(({ where }) => {
        const items = callSessions.filter((call) => {
          if (where.status?.in && !where.status.in.includes(call.status)) return false;
          const link = links.find((item) => item.id === call.linkId);
          return !where.link?.userId || link?.userId === where.link.userId;
        }).map((call) => {
          const link = links.find((item) => item.id === call.linkId);
          return { ...call, link: { ...link, vehicle: vehicles.find((vehicle) => vehicle.id === link?.vehicleId) } };
        });
        return Promise.resolve(items);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const item = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        callSessions.push(item);
        return Promise.resolve(item);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const index = callSessions.findIndex((call) => call.id === where.id);
        if (index === -1) return Promise.resolve(null);
        callSessions[index] = { ...callSessions[index], ...data, updatedAt: new Date() };
        return Promise.resolve(callSessions[index]);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        callSessions.forEach((c, i) => {
          if (where.linkId && c.linkId !== where.linkId) return;
          if (where.link?.userId) {
            const link = links.find((item) => item.id === c.linkId);
            if (link?.userId !== where.link.userId) return;
          }
          if (where.status?.in && !where.status.in.includes(c.status)) return;
          if (where.status && !where.status.in && c.status !== where.status) return;
          if (where.createdAt?.lt && new Date(c.createdAt) >= new Date(where.createdAt.lt)) return;
          callSessions[i] = { ...c, ...data };
          count++;
        });
        return Promise.resolve({ count });
      }),
    },
    connectIntegrationAuditEvent: {
      create: vi.fn().mockImplementation(({ data }) => {
        auditEvents.push(data);
        return Promise.resolve({ id: 'audit-1', ...data });
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => {
      return callback(mockDb);
    }),
  };

  const store = new PrismaConnectStore(mockDb, undefined, async (publicUrl) => ({
    secureUrl: `https://res.cloudinary.com/vmotiv/image/upload/connect/${encodeURIComponent(publicUrl.slice(-12))}.png`,
    publicId: `vmotiv/connect-stickers/test-${crypto.randomUUID()}`,
  }));

  const app = createApp({
    verify,
    store: {} as any,
    webOrigin: 'http://localhost:3000',
    connect: store,
  });

  return { app, mockDb, vehicles, links, alerts };
}

describe('V MOTIV V2 — Connect Integration API Suite', () => {
  it('1. GET /api/v2/customer/garage/:id/connect requires authentication', async () => {
    const { app } = setupApp();
    const res = await request(app).get(`/api/v2/customer/garage/${VEHICLE_ID}/connect`);
    expect(res.status).toBe(401);
  });

  it('2. GET /api/v2/customer/garage/:id/connect returns 404 for unowned vehicle', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .get(`/api/v2/customer/garage/${OTHER_VEHICLE_ID}/connect`)
      .set('Authorization', 'Bearer valid-customer-token');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GARAGE_VEHICLE_NOT_FOUND');
  });

  it('3. GET /api/v2/customer/garage/:id/connect returns unlinked status when not yet linked', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .get(`/api/v2/customer/garage/${VEHICLE_ID}/connect`)
      .set('Authorization', 'Bearer valid-customer-token');
    expect(res.status).toBe(200);
    expect(res.body.isLinked).toBe(false);
    expect(res.body.connectStatus).toBe('NOT_CONNECTED');
    expect(res.body.stats.totalAlerts).toBe(0);
  });

  it('4. POST /api/v2/customer/garage/:id/connect/link retires arbitrary prototype-token imports', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/link`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('CONNECT_LEGACY_LINKING_RETIRED');
  });

  it('5. POST /api/v2/customer/garage/:id/connect/issue creates a first-party QR sticker', async () => {
    const { app, vehicles, links } = setupApp();
    const res = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.link.status).toBe('ACTIVE');
    expect(res.body.stickerUrl).toMatch(/^https:\/\/www\.vmotiv\.in\/connect\//);
    expect(res.body.stickerImageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(vehicles[0].connectStatus).toBe('CONNECTED');
    expect(links.length).toBe(1);
    expect(links[0].qrTokenHash).not.toBe(TOKEN_HASH);
  });

  it('6. generated token is never returned in the owner status response', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});

    expect(res.status).toBe(201);
    const status = await request(app)
      .get(`/api/v2/customer/garage/${VEHICLE_ID}/connect`)
      .set('Authorization', 'Bearer valid-customer-token');
    expect(status.status).toBe(200);
    expect(JSON.stringify(status.body)).not.toContain(res.body.stickerUrl);
    expect(status.body.link.stickerImageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });

  it('7. POST /api/v2/customer/garage/:id/connect/toggle enables and disables QR safely', async () => {
    const { app } = setupApp();
    // Issue first
    await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});

    // Disable
    const disableRes = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/toggle`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({ enabled: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.status).toBe('DISABLED');
    expect(disableRes.body.connectStatus).toBe('DISABLED');

    // Re-enable
    const enableRes = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/toggle`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({ enabled: true });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.status).toBe('ACTIVE');
    expect(enableRes.body.connectStatus).toBe('CONNECTED');
  });

  it('8. POST /api/v2/customer/garage/:id/connect/revoke revokes sticker and resets vehicle status', async () => {
    const { app, vehicles } = setupApp();
    await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});

    const revokeRes = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/revoke`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({ reason: 'Sold car to private buyer' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revoked).toBe(true);
    expect(vehicles[0].connectStatus).toBe('NOT_CONNECTED');
  });

  it('9. POST /api/v2/customer/garage/:id/connect/request-sticker requests physical sticker delivery', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/request-sticker`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({
        deliveryAddress: 'Flat 402, Green Glen Layout, Bellandur',
        city: 'Bengaluru',
        pincode: '560103',
        instructions: 'Please deliver UV-resistant sticker with tamper-evident seal',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('PROCESSING');
    expect(res.body.estimatedDeliveryDays).toBe(3);
  });

  it('10. POST /api/v2/webhooks/connect verifies webhook signature and registers passerby alert', async () => {
    const { app } = setupApp();
    // The legacy webhook remains isolated from newly generated stickers.
    // Seed its old token only for interoperability coverage.
    const issued = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});
    const issuedToken = issued.body.stickerUrl.split('/').pop();

    const payload = {
      eventType: 'CONNECT_OWNER_ALERT_CREATED',
      tokenHash: sha256(issuedToken),
      reason: 'VEHICLE_BLOCKING',
      message: 'Hello, your car is blocking gate 2. Please move it.',
      visitorIp: '198.51.100.42',
    };

    const secret = 'vmotiv_connect_secret_default';
    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    // Reject forged signature
    const badRes = await request(app)
      .post('/api/v2/webhooks/connect')
      .set('x-connect-signature', 'bad-signature-hex')
      .send(payload);
    expect(badRes.status).toBe(401);

    // Accept valid signed webhook
    const goodRes = await request(app)
      .post('/api/v2/webhooks/connect')
      .set('x-connect-signature', signature)
      .send(payload);
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.matched).toBe(true);
    expect(goodRes.body.vehicleId).toBe(VEHICLE_ID);
  });

  it('11. issues a V2-owned sticker and keeps the public scan flow anonymous', async () => {
    const { app, links, alerts } = setupApp();
    const issue = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});

    expect(issue.status).toBe(201);
    expect(issue.body.stickerUrl).toMatch(/^https:\/\/www\.vmotiv\.in\/connect\//);
    expect(links[0].qrTokenHash).not.toContain(issue.body.stickerUrl);
    const token = issue.body.stickerUrl.split('/').pop();

    const lookup = await request(app).get(`/api/v2/public/connect/${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.vehicle.registrationNumber).toBeUndefined();
    expect(lookup.body.vehicle.nickname).toContain('Honda');

    const alert = await request(app)
      .post(`/api/v2/public/connect/${token}/alerts`)
      .send({ reason: 'LIGHTS_ON', message: 'The headlights look switched on.' });
    expect(alert.status).toBe(201);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].eventType).toBe('CONNECT_OWNER_ALERT_CREATED');
  });

  it('12. creates and resolves a server-side Connect call request', async () => {
    const { app } = setupApp();
    const issue = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});
    const token = issue.body.stickerUrl.split('/').pop();

    const requested = await request(app)
      .post(`/api/v2/public/connect/${token}/call-requests`)
      .send({ consentGiven: true });
    expect(requested.status).toBe(201);
    expect(requested.body.status).toBe('RINGING');

    const incoming = await request(app)
      .get('/api/v2/customer/connect/calls/incoming')
      .set('Authorization', 'Bearer valid-customer-token');
    expect(incoming.status).toBe(200);
    expect(incoming.body.items).toHaveLength(1);

    const answered = await request(app)
      .post(`/api/v2/customer/connect/calls/${requested.body.callSessionId}/respond`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({ decision: 'ACCEPT' });
    expect(answered.status).toBe(200);
    expect(answered.body.status).toBe('ACCEPTED');
  });

  it('13. POST /api/v2/public/connect/:token/alerts supports photos and POST /:token/photos uploads image', async () => {
    const { app, alerts } = setupApp();
    const issue = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});
    const token = issue.body.stickerUrl.split('/').pop();

    // 1. Upload photo via public endpoint
    const photoUpload = await request(app)
      .post(`/api/v2/public/connect/${token}/photos`)
      .send({ base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mimeType: 'image/png' });
    expect(photoUpload.status).toBe(201);
    expect(photoUpload.body.url).toBeDefined();

    // 2. Send alert with photos
    const alert = await request(app)
      .post(`/api/v2/public/connect/${token}/alerts`)
      .send({
        reason: 'DAMAGE_OR_ACCIDENT',
        message: 'Scratch on rear bumper',
        photos: [photoUpload.body.url, 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd'],
      });
    expect(alert.status).toBe(201);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const lastAlert = alerts[alerts.length - 1];
    expect(lastAlert.reason).toBe('DAMAGE_OR_ACCIDENT');
    expect(lastAlert.photoUrls).toHaveLength(2);
  });
});
