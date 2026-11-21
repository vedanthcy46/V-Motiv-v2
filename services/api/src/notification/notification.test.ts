import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isExpoPushToken, ExpoPushClient } from './expo-push.js';
import { NotificationService } from './notification-service.js';

describe('Expo Push Token Validation', () => {
  it('identifies standard ExponentPushToken formats', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  });

  it('identifies uuid format push tokens', () => {
    expect(isExpoPushToken('12345678-1234-1234-1234-123456789012')).toBe(true);
  });

  it('rejects invalid tokens', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('invalid-token')).toBe(false);
    expect(isExpoPushToken(null as any)).toBe(false);
  });
});

describe('ExpoPushClient', () => {
  it('batches messages and returns tickets', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: 'ok', id: 'ticket-123' }],
      }),
    });
    global.fetch = fakeFetch;

    const client = new ExpoPushClient();
    const result = await client.sendPushNotifications([
      {
        to: 'ExponentPushToken[test-123]',
        title: 'New Inspection Assigned',
        body: 'Job 104 is ready',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ status: 'ok', id: 'ticket-123' });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('polls receipts and maps results', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          'ticket-123': { status: 'ok' },
        },
      }),
    });
    global.fetch = fakeFetch;

    const client = new ExpoPushClient();
    const receipts = await client.getPushNotificationReceipts(['ticket-123']);

    expect(receipts['ticket-123']).toEqual({ status: 'ok' });
  });
});

describe('NotificationService Unit Tests', () => {
  let fakeDb: any;
  let service: NotificationService;

  beforeEach(() => {
    fakeDb = {
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notif-uuid-1', title: 'Test Title' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'notif-uuid-1', title: 'Test Title', read: false }]),
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ userId: 'user-1', inAppEnabled: true, pushEnabled: true, emailEnabled: true }),
        upsert: vi.fn().mockResolvedValue({ userId: 'user-1', inAppEnabled: true }),
      },
      notificationDelivery: {
        create: vi.fn().mockResolvedValue({ id: 'deliv-1' }),
      },
      pushDevice: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'dev-1', token: 'ExponentPushToken[token1]', active: true },
        ]),
        upsert: vi.fn().mockResolvedValue({ id: 'dev-1', active: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      pushTicket: {
        create: vi.fn().mockResolvedValue({ id: 'pt-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ id: 'pt-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@vmotiv.in', displayName: 'Test User' }),
      },
      emailOutbox: {
        create: vi.fn().mockResolvedValue({ id: 'email-1' }),
      },
    };

    service = new NotificationService(fakeDb as any, new ExpoPushClient());
  });

  it('dispatches domain events to in-app, push tickets, and email outbox', async () => {
    const res = await service.dispatchDomainEvent({
      type: 'SYSTEM_NOTIFICATION',
      category: 'INSPECTION',
      priority: 'HIGH',
      recipientUserIds: ['user-1'],
      title: 'New Inspection Assigned: 2022 Honda City',
      body: 'You have been assigned inspection job I-104.',
      deepLink: 'vmotiv://inspections/i-104',
      emailTemplate: 'inspection-assigned-v1',
      emailSubject: 'New Inspection Assignment: 2022 Honda City',
      emailBody: 'Inspection details...',
    });

    expect(res.notificationsCount).toBe(1);
    expect(res.pushTicketsCount).toBe(1);
    expect(res.emailsCount).toBe(1);

    expect(fakeDb.notification.create).toHaveBeenCalledTimes(1);
    expect(fakeDb.pushTicket.create).toHaveBeenCalledTimes(1);
    expect(fakeDb.emailOutbox.create).toHaveBeenCalledTimes(1);
  });

  it('routes employee events to the outbox instead of writing inbox rows directly, and never routes customers there', async () => {
    fakeDb.employee = { count: vi.fn().mockResolvedValue(1) };
    fakeDb.domainOutboxEvent = { create: vi.fn().mockResolvedValue({ id: 'evt-1' }) };
    const staff = await service.dispatchDomainEvent({ type: 'INSPECTION_ASSIGNED', category: 'INSPECTION', recipientUserIds: ['00000000-0000-4000-8000-000000000001'], referenceId: 'assign-1234', title: 't', body: 'b' });
    expect(staff.notificationsCount).toBe(0);
    expect(fakeDb.domainOutboxEvent.create).toHaveBeenCalledTimes(1);
    expect(fakeDb.notification.create).not.toHaveBeenCalled();
    // The same event type addressed to a customer (not an employee) stays on the customer path.
    fakeDb.employee.count.mockResolvedValue(0);
    fakeDb.domainOutboxEvent.create.mockClear();
    await service.dispatchDomainEvent({ type: 'INSPECTION_ASSIGNED', category: 'INSPECTION', recipientUserIds: ['00000000-0000-4000-8000-000000000002'], referenceId: 'assign-1234', title: 't', body: 'b' });
    expect(fakeDb.domainOutboxEvent.create).not.toHaveBeenCalled();
    expect(fakeDb.notification.create).toHaveBeenCalledTimes(1);
  });

  it('fetches notifications with unread counts and marks read', async () => {
    const list = await service.getNotifications('user-1', { page: 1, limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.unreadCount).toBe(1);

    await service.markAsRead('user-1', 'notif-uuid-1');
    expect(fakeDb.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-uuid-1', userId: 'user-1' },
      data: expect.objectContaining({ read: true }),
    });

    await service.markAllAsRead('user-1');
    expect(fakeDb.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', read: false },
      data: expect.objectContaining({ read: true }),
    });
  });

  it('clearing hides notifications instead of deleting them, and cleared ones are left out of the list and the unread count', async () => {
    await service.getNotifications('user-1', { page: 1, limit: 10 });
    expect(fakeDb.notification.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'user-1', dismissedAt: null });
    expect(fakeDb.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', read: false, dismissedAt: null } });
    await service.getUnreadCount('user-1');
    expect(fakeDb.notification.count).toHaveBeenLastCalledWith({ where: { userId: 'user-1', read: false, dismissedAt: null } });

    fakeDb.notification.updateMany.mockClear();
    await service.dismissNotification('user-1', 'notif-uuid-1');
    expect(fakeDb.notification.updateMany).toHaveBeenCalledWith({ where: { id: 'notif-uuid-1', userId: 'user-1', dismissedAt: null }, data: { dismissedAt: expect.any(Date) } });
    // only the person's own notification can be cleared
    expect(fakeDb.notification.updateMany.mock.calls.every(call => call[0].where.userId === 'user-1')).toBe(true);

    fakeDb.notification.updateMany.mockClear();
    await service.dismissAllNotifications('user-1');
    expect(fakeDb.notification.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1', dismissedAt: null }, data: { dismissedAt: expect.any(Date) } });
    expect(fakeDb.notification.delete ?? undefined).toBeUndefined(); // no hard delete exists on the fake, and none is used
  });

  it('registers and unregisters push devices idempotently', async () => {
    await service.registerPushDevice('user-1', {
      token: 'ExponentPushToken[device-token-1]',
      app: 'INSPECTOR',
      platform: 'ANDROID',
    });

    expect(fakeDb.pushDevice.upsert).toHaveBeenCalledTimes(1);

    await service.unregisterPushDevice('user-1', 'ExponentPushToken[device-token-1]');
    expect(fakeDb.pushDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', token: 'ExponentPushToken[device-token-1]' },
      data: { active: false },
    });
  });
});
