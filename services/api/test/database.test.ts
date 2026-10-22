import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaIdentityStore } from '../src/identity-store.js';
import { processEmail } from '../src/email.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Database integration tests require the isolated local vmotiv_v2_test database.');
}
describe.skipIf(!url)('real PostgreSQL identity and email transactions', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaIdentityStore(db);
  const uid = 'integration-' + crypto.randomUUID();
  let id: string;
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });
  it('serializes concurrent login and creates one user, welcome event and audit event', async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => store.sync({ uid, email: 'integration@example.test', secondFactor: false })));
    expect(new Set(users.map(user => user.id)).size).toBe(1);
    id = users[0]!.id;
    expect(await db.emailOutbox.count({ where: { userId: id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { entityId: id } })).toBe(1);
    expect(users[0]!.marketingConsent).toBe(false);
    expect(users[0]!.employee).toBeNull();
  });
  it('keeps failed delivery observable and accepts a retry with the same immutable message key', async () => {
    await db.emailOutbox.updateMany({ where: { userId: id }, data: { availableAt: new Date(0) } });
    const own = await db.emailOutbox.findUniqueOrThrow({ where: { eventKey: 'welcome/' + id } });
    await processEmail(db, async () => { throw new Error('mock provider outage'); }, 'Test <notifications@example.test>', own.id);
    let event = await db.emailOutbox.findUniqueOrThrow({ where: { eventKey: 'welcome/' + id } });
    expect(event.state).toBe('PENDING');
    expect(event.lastErrorCode).toBe('EMAIL_SEND_FAILED');
    expect(event.attempts).toBe(1);
    await db.emailOutbox.update({ where: { id: event.id }, data: { availableAt: new Date(0) } });
    await processEmail(db, async row => {
      expect(row.eventKey).toBe(event.eventKey);
      expect(row.sender).toBe(event.sender);
      return 'test-provider-' + row.id;
    }, 'Changed sender <other@example.test>', event.id);
    event = await db.emailOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(event.state).toBe('ACCEPTED');
    expect(event.attempts).toBe(2);
  });
  it('rejects local suspended identity even with valid Firebase credentials', async () => {
    await db.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await expect(store.sync({ uid, email: 'integration@example.test', secondFactor: false })).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
  });
});

