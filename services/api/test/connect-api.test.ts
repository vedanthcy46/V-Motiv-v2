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
    if (token === 'bad-token') throw new Error('auth/argument-error');
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
  let callSignals: any[] = [];
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
          if (where.callerType && call.callerType !== where.callerType) return false;
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
    connectCallSignal: {
      create: vi.fn().mockImplementation(({ data }) => {
        const signal = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
        callSignals.push(signal);
        return Promise.resolve(signal);
      }),
      findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(
        callSignals.filter(signal => signal.callId === where.callId)
      )),
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

  const notifications = { dispatchDomainEvent: vi.fn().mockResolvedValue(undefined), drainPushTickets: vi.fn().mockResolvedValue(0) };
  const store = new PrismaConnectStore(mockDb, notifications as any, async (publicUrl) => ({
    secureUrl: `https://res.cloudinary.com/vmotiv/image/upload/connect/${encodeURIComponent(publicUrl.slice(-12))}.png`,
    publicId: `vmotiv/connect-stickers/test-${crypto.randomUUID()}`,
  }));

  const app = createApp({
    verify,
    store: {} as any,
    webOrigin: 'http://localhost:3000',
    connect: store,
  });

  return { app, mockDb, vehicles, links, alerts, notifications };
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

    const secret = 'test_connect_webhook_secret';
    process.env.CONNECT_WEBHOOK_SECRET = secret;
    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    // Reject forged signature
    const badRes = await request(app)
      .post('/api/v2/webhooks/connect')
      .set('x-connect-signature', 'bad-signature-hex')
      .send(payload);
    expect(badRes.status).toBe(400);

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

  it('12a. does not let an active passerby chat suppress a new voice call', async () => {
    const { app } = setupApp();
    const issue = await request(app)
      .post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`)
      .set('Authorization', 'Bearer valid-customer-token')
      .send({});
    const token = issue.body.stickerUrl.split('/').pop();

    const chat = await request(app)
      .post(`/api/v2/public/connect/${token}/call-requests`)
      .send({ consentGiven: true, mode: 'CHAT', initialMessage: 'Is this vehicle blocking the gate?' });
    expect(chat.status).toBe(201);
    expect(chat.body.status).toBe('RINGING');

    const voice = await request(app)
      .post(`/api/v2/public/connect/${token}/call-requests`)
      .send({ consentGiven: true, mode: 'VOICE' });
    expect(voice.status).toBe(201);
    expect(voice.body.status).toBe('RINGING');
    expect(voice.body.callSessionId).not.toBe(chat.body.callSessionId);

    const incoming = await request(app)
      .get('/api/v2/customer/connect/calls/incoming')
      .set('Authorization', 'Bearer valid-customer-token');
    expect(incoming.status).toBe(200);
    expect(incoming.body.items).toHaveLength(2);
    expect(incoming.body.items.some((item: { callerType: string }) => item.callerType === 'visitor')).toBe(true);
  });

  describe('per-vehicle call / message switches', () => {
    async function issued() {
      const ctx = setupApp();
      const issue = await request(ctx.app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`).set('Authorization', 'Bearer valid-customer-token').send({});
      const token = issue.body.stickerUrl.split('/').pop();
      const setPrefs = (body: Record<string, unknown>) => request(ctx.app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/contact-preferences`).set('Authorization', 'Bearer valid-customer-token').send(body);
      return { ...ctx, token, setPrefs };
    }

    it('14. both are on by default, in the owner status and in the public lookup', async () => {
      const { app, token } = await issued();
      const status = await request(app).get(`/api/v2/customer/garage/${VEHICLE_ID}/connect`).set('Authorization', 'Bearer valid-customer-token');
      expect(status.body.link).toMatchObject({ callingEnabled: true, messagingEnabled: true });
      const lookup = await request(app).get(`/api/v2/public/connect/${token}`);
      expect(lookup.body.vehicle).toMatchObject({ callingEnabled: true, messagingEnabled: true });
    });

    it('15. the owner can switch calls off and chat stays on, and the public lookup reflects it', async () => {
      const { app, token, setPrefs } = await issued();
      const res = await setPrefs({ callingEnabled: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, callingEnabled: false, messagingEnabled: true });
      const lookup = await request(app).get(`/api/v2/public/connect/${token}`);
      expect(lookup.body.vehicle).toMatchObject({ callingEnabled: false, messagingEnabled: true });
      const status = await request(app).get(`/api/v2/customer/garage/${VEHICLE_ID}/connect`).set('Authorization', 'Bearer valid-customer-token');
      expect(status.body.link).toMatchObject({ callingEnabled: false, messagingEnabled: true });
    });

    it('16. a voice call is refused on the server when calls are off, but chat still works', async () => {
      const { app, token, setPrefs } = await issued();
      await setPrefs({ callingEnabled: false });
      const call = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'VOICE' });
      expect(call.status).toBe(403);
      expect(call.body.code).toBe('CONNECT_CALLING_DISABLED');
      const chat = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'CHAT', initialMessage: 'Your lights are on' });
      expect(chat.status).toBe(201);
    });

    it('17. chat is refused on the server when messages are off, including messages sent into an existing session', async () => {
      const { app, token, setPrefs } = await issued();
      const call = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'VOICE' });
      expect(call.status).toBe(201);
      await setPrefs({ messagingEnabled: false });
      const chatRequest = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'CHAT' });
      expect(chatRequest.status).toBe(403);
      expect(chatRequest.body.code).toBe('CONNECT_MESSAGING_DISABLED');
      const message = await request(app).post(`/api/v2/public/connect/${token}/calls/${call.body.callSessionId}/signals`).send({ kind: 'CHAT', payload: { text: 'hello' } });
      expect(message.status).toBe(403);
      // call signalling itself is not affected
      const offer = await request(app).post(`/api/v2/public/connect/${token}/calls/${call.body.callSessionId}/signals`).send({ kind: 'OFFER', payload: { sdp: 'x', type: 'offer' } });
      expect(offer.status).toBe(201);
    });

    it('18. the one-way alert still works when both are off', async () => {
      const { app, token, setPrefs } = await issued();
      await setPrefs({ callingEnabled: false, messagingEnabled: false });
      const alert = await request(app).post(`/api/v2/public/connect/${token}/alerts`).send({ reason: 'LIGHTS_ON', message: 'The headlights look switched on.' });
      expect(alert.status).toBe(201);
    });

    it('19. needs at least one switch, rejects unknown fields, and only the owner can change them', async () => {
      const { app, setPrefs } = await issued();
      expect((await setPrefs({})).status).toBe(400);
      expect((await setPrefs({ callingEnabled: 'no' })).status).toBe(400);
      expect((await setPrefs({ callingEnabled: false, somethingElse: true })).status).toBe(400);
      const stranger = await request(app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/contact-preferences`).set('Authorization', 'Bearer other-token').send({ callingEnabled: false });
      expect(stranger.status).toBe(404);
    });

    it('20. a re-issued sticker keeps the owner\'s choices', async () => {
      const { app, setPrefs } = await issued();
      await setPrefs({ callingEnabled: false });
      const again = await request(app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`).set('Authorization', 'Bearer valid-customer-token').send({});
      const newToken = again.body.stickerUrl.split('/').pop();
      const lookup = await request(app).get(`/api/v2/public/connect/${newToken}`);
      expect(lookup.body.vehicle).toMatchObject({ callingEnabled: false, messagingEnabled: true });
    });
  });

  describe('owner scanning their own vehicle', () => {
    async function issued() {
      const ctx = setupApp();
      const issue = await request(ctx.app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`).set('Authorization', 'Bearer valid-customer-token').send({});
      return { ...ctx, token: issue.body.stickerUrl.split('/').pop() as string };
    }

    it('21. the public lookup says "own vehicle" only to the signed-in owner', async () => {
      const { app, token } = await issued();
      const owner = await request(app).get(`/api/v2/public/connect/${token}`).set('Authorization', 'Bearer valid-customer-token');
      expect(owner.body.isOwnVehicle).toBe(true);
      const stranger = await request(app).get(`/api/v2/public/connect/${token}`).set('Authorization', 'Bearer other-token');
      expect(stranger.body.isOwnVehicle).toBe(false);
      const anonymous = await request(app).get(`/api/v2/public/connect/${token}`);
      expect(anonymous.body.isOwnVehicle).toBe(false);
    });

    it('22. an owner cannot call or chat with their own vehicle, but another person can', async () => {
      const { app, token } = await issued();
      for (const mode of ['VOICE', 'CHAT'] as const) {
        const own = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).set('Authorization', 'Bearer valid-customer-token').send({ consentGiven: true, mode });
        expect(own.status).toBe(409);
        expect(own.body.code).toBe('CONNECT_SELF_CONTACT');
      }
      const stranger = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).set('Authorization', 'Bearer other-token').send({ consentGiven: true, mode: 'VOICE' });
      expect(stranger.status).toBe(201);
    });

    it('23. an invalid or expired sign-in never breaks a public scan: it is simply treated as anonymous', async () => {
      const { app, token } = await issued();
      const lookup = await request(app).get(`/api/v2/public/connect/${token}`).set('Authorization', 'Bearer bad-token');
      expect(lookup.status).toBe(200);
      expect(lookup.body.isOwnVehicle).toBe(false);
      const call = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).set('Authorization', 'Bearer bad-token').send({ consentGiven: true, mode: 'VOICE' });
      expect(call.status).toBe(201);
    });
  });

  describe('clear owner notifications', () => {
    async function issued() {
      const ctx = setupApp();
      const issue = await request(ctx.app).post(`/api/v2/customer/garage/${VEHICLE_ID}/connect/issue`).set('Authorization', 'Bearer valid-customer-token').send({});
      return { ...ctx, token: issue.body.stickerUrl.split('/').pop() as string };
    }
    const sent = (notifications: { dispatchDomainEvent: ReturnType<typeof vi.fn> }) => notifications.dispatchDomainEvent.mock.calls.map(call => call[0]);

    it('24. a call names the vehicle and says the phone number stays hidden', async () => {
      const { app, token, notifications } = await issued();
      await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'VOICE' });
      const event = sent(notifications).find(e => e.type === 'CONNECT_CALL_REQUESTED');
      expect(event.title).toBe('Incoming call about your 2023 Honda City');
      expect(event.body).toContain('phone number stays hidden');
      expect(event.metadata.callSessionId).toBeTruthy();
    });

    it('25. an alert says what was reported and about which vehicle', async () => {
      const { app, token, notifications } = await issued();
      await request(app).post(`/api/v2/public/connect/${token}/alerts`).send({ reason: 'LIGHTS_ON', message: 'The headlights look switched on.' });
      const event = sent(notifications).find(e => e.type === 'CONNECT_OWNER_ALERT_CREATED');
      expect(event.title).toBe('Lights are on: 2023 Honda City');
      expect(event.body).toContain('The headlights look switched on.');
    });

    it('26. hanging up while it is still ringing leaves a missed-call notification that cannot ring the phone', async () => {
      const { app, token, notifications } = await issued();
      const call = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'VOICE' });
      await request(app).post(`/api/v2/public/connect/${token}/calls/${call.body.callSessionId}/signals`).send({ kind: 'HANGUP', payload: {} });
      const missed = sent(notifications).find(e => e.type === 'CONNECT_CALL_MISSED');
      expect(missed.title).toBe('Missed call about your 2023 Honda City');
      // no call session id: it must not be treated as a live ringing call by the push channel or the incoming-call screen
      expect(missed.metadata.callSessionId).toBeUndefined();
    });

    it('27. no missed call is recorded when the owner already answered', async () => {
      const { app, token, notifications } = await issued();
      const call = await request(app).post(`/api/v2/public/connect/${token}/call-requests`).send({ consentGiven: true, mode: 'VOICE' });
      await request(app).post(`/api/v2/customer/connect/calls/${call.body.callSessionId}/respond`).set('Authorization', 'Bearer valid-customer-token').send({ decision: 'ACCEPT' });
      await request(app).post(`/api/v2/public/connect/${token}/calls/${call.body.callSessionId}/signals`).send({ kind: 'HANGUP', payload: {} });
      expect(sent(notifications).some(e => e.type === 'CONNECT_CALL_MISSED')).toBe(false);
    });
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
