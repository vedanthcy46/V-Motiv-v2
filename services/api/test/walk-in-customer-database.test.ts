import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaIdentityStore } from '../src/identity-store.js';
import { resolveWalkInCustomer } from '../src/walk-in-customer.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Counter customers get one app account, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const identity = new PrismaIdentityStore(db);
  afterAll(() => db.$disconnect());
  const unique = () => crypto.randomUUID().slice(0, 8);
  const phone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
  const base = (email: string | null, ph = phone()) => ({ name: 'Counter Customer', phone: ph, email, placeholderDomain: 'service.vmotiv.in' as const, context: 'your service booking' });

  it('creates an account with their phone and Gmail, emails the app link, and hands it over at first Google sign-in', async () => {
    const email = `buyer-${unique()}@gmail.com`;
    const first = await resolveWalkInCustomer(db, base(email));
    expect(first).toMatchObject({ accountCreated: true, existingAccount: false, inviteEmailed: true });
    expect(first.user.email).toBe(email);
    const mail = await db.emailOutbox.findUniqueOrThrow({ where: { eventKey: `app-invite/${first.user.id}` } });
    expect(mail.recipient).toBe(email);
    expect(mail.text).toContain('play.google.com');
    expect(mail.text).toContain(email);

    // A rental for the same person next week: the same account, no second invitation.
    const again = await resolveWalkInCustomer(db, { ...base(email, first.user.phone!), placeholderDomain: 'rental.vmotiv.in' });
    expect(again).toMatchObject({ accountCreated: false, existingAccount: true });
    expect(again.user.id).toBe(first.user.id);
    expect(await db.emailOutbox.count({ where: { eventKey: `app-invite/${first.user.id}` } })).toBe(1);

    // They install the app and sign in with that Gmail: they land in the account that already holds their history.
    const claimed = await identity.sync({ uid: `google-${unique()}`, email: email.toUpperCase(), name: 'Real Name' } as any);
    expect(claimed.id).toBe(first.user.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: first.user.id } })).firebaseUid).toMatch(/^google-/);
    expect(await db.user.count({ where: { email: { equals: email, mode: 'insensitive' } } })).toBe(1);
  });

  it('does not create a second account for an existing customer, and sends no invitation to a signed-in one', async () => {
    const email = `member-${unique()}@gmail.com`;
    const member = await db.user.create({ data: { firebaseUid: `google-${unique()}`, email, phone: phone(), displayName: 'Member' } });
    const result = await resolveWalkInCustomer(db, base(email, '+919000000001'));
    expect(result).toMatchObject({ accountCreated: false, existingAccount: true, inviteEmailed: false });
    expect(result.user.id).toBe(member.id);
    const byPhone = await resolveWalkInCustomer(db, base(null, member.phone!));
    expect(byPhone.user.id).toBe(member.id);
    expect(await db.emailOutbox.count({ where: { userId: member.id, eventKey: { startsWith: 'app-invite/' } } })).toBe(0);
  });

  it('refuses a phone and a Gmail that belong to two different accounts', async () => {
    const a = await db.user.create({ data: { firebaseUid: `google-${unique()}`, email: `a-${unique()}@gmail.com`, phone: phone() } });
    const b = await db.user.create({ data: { firebaseUid: `google-${unique()}`, email: `b-${unique()}@gmail.com`, phone: phone() } });
    await expect(resolveWalkInCustomer(db, base(b.email, a.phone!))).rejects.toMatchObject({ code: 'CUSTOMER_IDENTITY_CONFLICT' });
  });

  it('without a Gmail makes a placeholder account and sends nothing; adding the Gmail later invites them', async () => {
    const ph = phone();
    const first = await resolveWalkInCustomer(db, base(null, ph));
    expect(first).toMatchObject({ accountCreated: true, inviteEmailed: false });
    expect(first.user.email).toContain('@service.vmotiv.in');
    const email = `later-${unique()}@gmail.com`;
    const later = await resolveWalkInCustomer(db, base(email, ph));
    expect(later.user.id).toBe(first.user.id);
    expect(later).toMatchObject({ accountCreated: false, inviteEmailed: true });
    expect(later.user.email).toBe(email);
  });

  it('never claims an unrelated sign-in or a staff account by email', async () => {
    const email = `staff-${unique()}@gmail.com`;
    const walkIn = await resolveWalkInCustomer(db, base(email));
    await db.employee.create({ data: { userId: walkIn.user.id, role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${unique()}`.toUpperCase(), permissions: [] } });
    const signedIn = await identity.sync({ uid: `google-${unique()}`, email, name: 'Someone' } as any);
    expect(signedIn.id).not.toBe(walkIn.user.id);
  });
});
