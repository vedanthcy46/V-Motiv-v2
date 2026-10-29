import { describe, it, expect, vi } from 'vitest';
import { PrismaAdminStore } from '../src/admin-store.js';
import { PrismaCustomerStore } from '../src/customer-store.js';
import type { AdminActor } from '../src/admin-store.js';

describe('support case message email throttling', () => {
  const actor: AdminActor = {
    userId: '11111111-1111-4111-8111-111111111111',
    firebaseUid: 'admin-firebase-1',
    email: 'admin@vmotiv.in',
    displayName: 'Admin User',
    employeeCode: 'VM-ADMIN-1',
    designation: 'Support Admin',
    status: 'ACTIVE',
    mfaStatus: 'COMPLIANT',
    roles: ['SUPER_ADMIN'],
    permissions: ['support.respond'],
    branches: [],
  };

  it('does NOT create an email in emailOutbox when a customer replies to their own case', async () => {
    const mockEmailCreate = vi.fn().mockResolvedValue({});
    const mockSupportUpdate = vi.fn().mockResolvedValue({});
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: 'customer@test.com', status: 'ACTIVE' }),
      },
      supportCase: {
        findFirst: vi.fn().mockResolvedValue({ id: 'case-1', referenceCode: 'V-100', subject: 'Help with account' }),
        update: mockSupportUpdate,
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'reply-1', authorType: 'CUSTOMER', body: 'Hello again', createdAt: new Date() }]),
      emailOutbox: {
        create: mockEmailCreate,
      },
    };

    const store = new PrismaCustomerStore(mockDb as any);
    const reply = await store.replySupportCase('firebase-uid-1', 'case-1', 'Hello again');

    expect(reply.id).toBe('reply-1');
    expect(mockSupportUpdate).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { status: 'OPEN' } });
    // Customer must never receive an email for typing their own message
    expect(mockEmailCreate).not.toHaveBeenCalled();
  });

  it('queues an email only on the FIRST team reply, and NOT on subsequent replies', async () => {
    const emailOutboxCreate = vi.fn().mockResolvedValue({});
    let supportReplyCount = 0;

    const mockTx = {
      supportCase: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'case-1',
          referenceCode: 'V-100',
          subject: 'Help with account',
          user: { email: 'customer@test.com', preferredCity: 'Bengaluru' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      supportCaseReply: {
        count: vi.fn().mockImplementation(() => Promise.resolve(supportReplyCount)),
        create: vi.fn().mockImplementation(({ data }) => {
          if (data.authorType === 'SUPPORT') supportReplyCount++;
          return Promise.resolve({ id: `reply-${supportReplyCount}`, authorType: data.authorType, body: data.body, createdAt: new Date() });
        }),
      },
      emailOutbox: {
        create: emailOutboxCreate,
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const mockDb = {
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockTx)),
    };

    const adminStore = new PrismaAdminStore(mockDb as any);

    // 1. First team reply -> must trigger email
    await adminStore.replySupportCase(actor, 'case-1', 'Hello! We are looking into this for you.');
    expect(emailOutboxCreate).toHaveBeenCalledTimes(1);
    expect(emailOutboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: 'support-agent-first-reply/case-1',
          recipient: 'customer@test.com',
          templateVersion: 'support-reply-v1',
        }),
      }),
    );

    // 2. Second team reply in the same chat -> must NOT trigger another email
    await adminStore.replySupportCase(actor, 'case-1', 'Here is the next update on your request.');
    expect(emailOutboxCreate).toHaveBeenCalledTimes(1); // still 1!

    // 3. Third team reply -> still no additional email
    await adminStore.replySupportCase(actor, 'case-1', 'Let us know if you need anything else.');
    expect(emailOutboxCreate).toHaveBeenCalledTimes(1); // still 1!
  });
});
