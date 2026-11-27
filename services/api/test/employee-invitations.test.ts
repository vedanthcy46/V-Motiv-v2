import { describe, expect, it, vi } from 'vitest';
import { INVITATION_RESEND_COOLDOWN_MS, PrismaAdminStore } from '../src/admin-store.js';
import { classifyEmailError, EmailSendError } from '../src/email-errors.js';
import { idempotencyKeyFor, processEmail } from '../src/email.js';
import { claimInvitedEmployee, INVITED_UID_PREFIX, withInvitedEmployeeClaim } from '../src/invited-employee.js';

type Any = any;
const B1 = '11111111-1111-4111-8111-111111111111';
const B2 = '22222222-2222-4222-8222-222222222222';
const INV = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HOUR = 60 * 60 * 1000;
const reason = 'Email bounced, confirmed by phone';

const admin: Any = { userId: 'admin-1', roles: ['ADMIN'], permissions: ['employee.invite', 'email.delivery.read'], branches: [{ id: B1 }] };

/** Just enough of the Prisma query language for these functions. */
function matches(row: Any, where: Any = {}): boolean {
  return Object.entries(where).every(([key, want]: [string, Any]) => {
    if (key === 'OR') return want.some((one: Any) => matches(row, one));
    const have = row[key];
    if (want === null || typeof want !== 'object' || want instanceof Date) return have === want;
    if ('startsWith' in want) return String(have).startsWith(want.startsWith);
    if ('equals' in want) return want.mode === 'insensitive' ? String(have).toLowerCase() === String(want.equals).toLowerCase() : have === want.equals;
    if ('isNot' in want) return Boolean(have);
    return matches(have ?? {}, want);
  });
}

function world(options: { invitation?: Any; users?: Any[]; employees?: Any[]; outbox?: Any[]; privileged?: boolean } = {}) {
  const invitation: Any = {
    id: INV, email: 'asha@vmotiv.in', fullName: 'Asha Rao', designation: 'Advisor', status: 'PENDING', tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() + 24 * HOUR), createdAt: new Date(), createdById: 'admin-1', roleId: 'role-1',
    role: { key: 'SALES_EXECUTIVE', name: 'Sales Executive', active: true, privileged: Boolean(options.privileged) },
    branches: [{ branchId: B1, branch: { code: 'BLR', name: 'Bengaluru' } }],
    ...options.invitation,
  };
  const users: Any[] = options.users ?? [];
  const employees: Any[] = options.employees ?? [];
  const outbox: Any[] = options.outbox ?? [{ id: 'mail-1', eventKey: `employee-invitation/${INV}`, state: 'PENDING', attempts: 2, lastErrorCode: 'RECIPIENT_REJECTED', createdAt: new Date(Date.now() - HOUR), updatedAt: new Date(), text: 'Open invitation: https://admin.example/accept-invitation?token=SECRET123\n', recipient: 'asha@vmotiv.in' }];
  const audit: Any[] = [];
  let ids = 0;
  const db: Any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    employeeInvitation: {
      findUnique: vi.fn(async ({ where }: Any) => (where.id === invitation.id ? invitation : null)),
      findMany: vi.fn(async () => (invitation.status === 'PENDING' ? [invitation] : [])),
      update: vi.fn(async ({ data }: Any) => Object.assign(invitation, data)),
    },
    user: {
      findUnique: vi.fn(async ({ where }: Any) => users.find(u => u.firebaseUid === where.firebaseUid) ?? null),
      findFirst: vi.fn(async ({ where }: Any) => users.map(u => ({ ...u, employee: employees.find(e => e.userId === u.id) ?? null })).find(u => matches(u, where)) ?? null),
      findMany: vi.fn(async ({ where }: Any) => users.filter(u => matches(u, where))),
      create: vi.fn(async ({ data }: Any) => { const user = { id: `user-${++ids}`, status: 'ACTIVE', ...data }; users.push(user); return user; }),
      update: vi.fn(async ({ where, data }: Any) => Object.assign(users.find(u => u.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: Any) => { const found = users.filter(u => matches(u, where)); found.forEach(u => Object.assign(u, data)); return { count: found.length }; }),
    },
    employee: {
      findFirst: vi.fn(async ({ where }: Any) => employees.find(e => matches({ ...e, user: users.find(u => u.id === e.userId) }, where)) ?? null),
      create: vi.fn(async ({ data }: Any) => { employees.push(data); return data; }),
    },
    emailOutbox: {
      findMany: vi.fn(async ({ where }: Any = {}) => outbox.filter(m => matches(m, where)).sort((a, b) => b.createdAt - a.createdAt)),
      findFirst: vi.fn(async ({ where }: Any) => outbox.filter(m => matches(m, where)).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null),
      findUnique: vi.fn(async ({ where }: Any) => outbox.find(m => m.id === where.id) ?? null),
      count: vi.fn(async () => outbox.length),
      groupBy: vi.fn(async () => []),
      create: vi.fn(async ({ data }: Any) => { const mail = { id: `mail-${++ids + 1}`, state: 'PENDING', attempts: 0, createdAt: new Date(), ...data }; outbox.push(mail); return mail; }),
      update: vi.fn(async ({ where, data }: Any) => Object.assign(outbox.find(m => m.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: Any) => { const found = outbox.filter(m => matches(m, where)); found.forEach(m => Object.assign(m, data)); return { count: found.length }; }),
    },
    auditEvent: { create: vi.fn(async ({ data }: Any) => { audit.push(data); return data; }) },
  };
  db.$transaction = vi.fn(async (fn: Any) => fn(db));
  return { db, store: new PrismaAdminStore(db), invitation, users, employees, outbox, audit };
}

describe('why an email failed', () => {
  it('turns the provider answer into a code an administrator can act on', () => {
    expect(classifyEmailError({ name: 'validation_error', message: 'You can only send testing emails to your own email address.' })).toBe('SENDER_NOT_VERIFIED');
    expect(classifyEmailError({ name: 'validation_error', message: 'The vmotiv.in domain is not verified.' })).toBe('SENDER_NOT_VERIFIED');
    expect(classifyEmailError({ name: 'validation_error', message: 'Invalid `to` field.' })).toBe('RECIPIENT_REJECTED');
    expect(classifyEmailError({ name: 'validation_error', message: 'Recipient is on the suppression list' })).toBe('RECIPIENT_SUPPRESSED');
    expect(classifyEmailError({ name: 'daily_quota_exceeded' })).toBe('PROVIDER_QUOTA_EXCEEDED');
    expect(classifyEmailError({ name: 'rate_limit_exceeded' })).toBe('PROVIDER_RATE_LIMITED');
    expect(classifyEmailError({ name: 'restricted_api_key' })).toBe('PROVIDER_KEY_REJECTED');
    expect(classifyEmailError({ name: 'invalid_idempotent_request' })).toBe('PROVIDER_IDEMPOTENCY_CONFLICT');
    expect(classifyEmailError({ name: 'something_new', message: 'who knows' })).toBe('EMAIL_SEND_FAILED');
    expect(classifyEmailError(null)).toBe('EMAIL_SEND_FAILED');
  });

  it('saves that code, never the provider text, when a send fails', async () => {
    const row = { id: 'mail-1', attempts: 0, firstAttemptAt: null, sender: null };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([row]), emailOutbox: { update: vi.fn().mockResolvedValue({ ...row, attempts: 1 }) } };
    const db: Any = { $transaction: async (fn: Any) => fn(tx), emailOutbox: { updateMany: vi.fn() } };
    await processEmail(db, async () => { throw new EmailSendError('RECIPIENT_REJECTED', 'Invalid `to`: asha@vmotiv.in'); }, 'noreply@vmotiv.in');
    const saved = db.emailOutbox.updateMany.mock.calls[0][0].data;
    expect(saved.lastErrorCode).toBe('RECIPIENT_REJECTED');
    expect(JSON.stringify(saved)).not.toContain('asha');
  });

  it('uses the same send key while retrying, and a new one to send again something the provider had accepted', () => {
    expect(idempotencyKeyFor({ eventKey: 'a/1', providerMessageId: null })).toBe('a/1');
    expect(idempotencyKeyFor({ eventKey: 'a/1', providerMessageId: 'msg_9' })).toBe('a/1/after/msg_9');
  });
});

describe('the admin retry button', () => {
  it('really sends again: the retry window restarts and the sender is chosen afresh', async () => {
    const w = world({ outbox: [{ id: 'mail-1', eventKey: 'x', state: 'FAILED', attempts: 6, lastErrorCode: 'SENDER_NOT_VERIFIED', firstAttemptAt: new Date(0), sender: 'old@bad.example', createdAt: new Date(0) }] });
    await w.store.retryEmailOutbox(admin, 'mail-1');
    expect(w.outbox[0]).toMatchObject({ state: 'PENDING', attempts: 0, firstAttemptAt: null, sender: null, lastErrorCode: null });
  });

  it('refuses an email whose link has been replaced, and one that does not exist', async () => {
    const w = world({ outbox: [{ id: 'mail-1', eventKey: 'x', state: 'FAILED', lastErrorCode: 'SUPERSEDED', createdAt: new Date() }] });
    await expect(w.store.retryEmailOutbox(admin, 'mail-1')).rejects.toThrow(/EMAIL_SUPERSEDED/);
    await expect(w.store.retryEmailOutbox(admin, 'nope')).rejects.toThrow(/EMAIL_NOT_FOUND/);
  });

  it('never shows a one-time link in the delivery list', async () => {
    const page: Any = await world().store.communicationsOutbox(admin, { page: 1, limit: 25 });
    expect(page.items[0].text).toContain('token=[hidden]');
    expect(JSON.stringify(page)).not.toContain('SECRET123');
  });
});

describe('pending invitations', () => {
  it('shows what happened to the latest email', async () => {
    const w = world();
    const [row]: Any = await w.store.invitations(admin);
    expect(row).toMatchObject({ id: INV, expired: false, delivery: { state: 'PENDING', attempts: 2, errorCode: 'RECIPIENT_REJECTED' } });
    expect(JSON.stringify(row)).not.toContain('SECRET123');
    // The link's hash is never asked for, and only invitations inside this administrator's branches are listed.
    const query = w.db.employeeInvitation.findMany.mock.calls[0][0];
    expect(query.select.tokenHash).toBeUndefined();
    expect(query.where).toMatchObject({ status: 'PENDING', branches: { every: { branchId: { in: [B1] } } } });
  });

  it('needs the invite permission', async () => {
    await expect(world().store.invitations({ ...admin, permissions: [] })).rejects.toThrow(/PERMISSION_DENIED/);
  });
});

describe('send again', () => {
  it('makes a new link, kills the old one and its unsent email, and restarts the expiry', async () => {
    const w = world();
    await w.store.resendInvitation(admin, INV, 'https://admin.example');
    expect(w.invitation.tokenHash).not.toBe('old-hash');
    expect(w.invitation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * HOUR);
    expect(w.outbox[0]).toMatchObject({ state: 'FAILED', lastErrorCode: 'SUPERSEDED' });
    expect(w.outbox[1]!.eventKey).toMatch(new RegExp(`^employee-invitation/${INV}/\\d+$`));
    expect(w.outbox[1]!.text).toContain('https://admin.example/accept-invitation?token=');
    expect(w.audit[0].action).toBe('EMPLOYEE_INVITATION_RESENT');
  });

  it('works for an expired invitation but not within a minute of the last email', async () => {
    const expired = world({ invitation: { expiresAt: new Date(Date.now() - HOUR) } });
    await expect(expired.store.resendInvitation(admin, INV, 'https://admin.example')).resolves.toMatchObject({ id: INV });
    await expect(expired.store.resendInvitation(admin, INV, 'https://admin.example')).rejects.toThrow(/INVITATION_RESEND_TOO_SOON/);
    expect(INVITATION_RESEND_COOLDOWN_MS).toBe(60_000);
  });
});

describe('accept manually', () => {
  it('makes an employee of someone who has already signed in, using that account', async () => {
    const w = world({ users: [{ id: 'user-asha', firebaseUid: 'google-asha', email: 'Asha@vmotiv.in', status: 'ACTIVE' }] });
    const out = await w.store.acceptInvitationManually(admin, INV, reason);
    expect(out).toMatchObject({ status: 'ACCEPTED', employeeId: 'user-asha', signedInBefore: true });
    expect(w.employees[0]).toMatchObject({ userId: 'user-asha', role: 'SALES_EXECUTIVE', status: 'ACTIVE', mfaStatus: 'REQUIRED' });
    expect(w.users[0]!.firebaseUid).toBe('google-asha');
    expect(w.invitation.status).toBe('ACCEPTED');
    expect(w.outbox[0]).toMatchObject({ lastErrorCode: 'SUPERSEDED' });
    expect(w.audit[0]).toMatchObject({ actorId: 'admin-1', action: 'EMPLOYEE_INVITATION_ACCEPTED_MANUALLY', details: { reason } });
  });

  it('for someone who never signed in, waits for their first Google sign-in with that address', async () => {
    const w = world();
    const out = await w.store.acceptInvitationManually(admin, INV, reason);
    expect(out.signedInBefore).toBe(false);
    expect(w.users[0]!.firebaseUid).toBe(`${INVITED_UID_PREFIX}${INV}`);

    expect(await claimInvitedEmployee(w.db, { uid: 'google-other', email: 'someone@else.in' })).toBe(false);
    expect(w.users[0]!.firebaseUid.startsWith(INVITED_UID_PREFIX)).toBe(true);

    expect(await claimInvitedEmployee(w.db, { uid: 'google-asha', email: 'ASHA@vmotiv.in' })).toBe(true);
    expect(w.users[0]!.firebaseUid).toBe('google-asha');
    expect(w.audit.at(-1).action).toBe('EMPLOYEE_ACCOUNT_CLAIMED');
  });

  it('takes over a counter (walk-in) account for the same address instead of making a second one', async () => {
    const w = world({ users: [{ id: 'walk', firebaseUid: 'walkin_1', email: 'asha@vmotiv.in', status: 'ACTIVE' }] });
    await w.store.acceptInvitationManually(admin, INV, reason);
    expect(w.users).toHaveLength(1);
    expect(w.users[0]!.firebaseUid).toBe(`${INVITED_UID_PREFIX}${INV}`);
  });

  it.each([
    ['without the permission', {}, { ...admin, permissions: [] }, /PERMISSION_DENIED/],
    ['for another branch', { invitation: { branches: [{ branchId: B2 }] } }, admin, /BRANCH_SCOPE_DENIED/],
    ['for a privileged role without that authority', { privileged: true }, admin, /PERMISSION_DENIED/],
    ['when it has expired', { invitation: { expiresAt: new Date(Date.now() - HOUR) } }, admin, /INVITATION_EXPIRED/],
    ['when it is no longer pending', { invitation: { status: 'ACCEPTED' } }, admin, /INVITATION_NOT_ACTIVE/],
    ['for a suspended account', { users: [{ id: 'u', firebaseUid: 'g', email: 'asha@vmotiv.in', status: 'SUSPENDED' }] }, admin, /ACCOUNT_INACTIVE/],
    ['when two accounts share the address', { users: [{ id: 'u1', firebaseUid: 'g1', email: 'asha@vmotiv.in', status: 'ACTIVE' }, { id: 'u2', firebaseUid: 'g2', email: 'asha@vmotiv.in', status: 'ACTIVE' }] }, admin, /MULTIPLE_ACCOUNTS_FOR_EMAIL/],
    ['for someone who is already an employee', { users: [{ id: 'u', firebaseUid: 'g', email: 'asha@vmotiv.in', status: 'ACTIVE' }], employees: [{ userId: 'u' }] }, admin, /EMPLOYEE_ALREADY_EXISTS/],
  ])('is refused %s', async (_label, options, actor, error) => {
    const w = world(options as Any);
    const before = w.employees.length;
    await expect(w.store.acceptInvitationManually(actor as Any, INV, reason)).rejects.toThrow(error as RegExp);
    expect(w.employees).toHaveLength(before);
  });
});

describe('claiming at sign-in', () => {
  const token = (over: Any = {}) => ({ uid: 'google-asha', email: 'asha@vmotiv.in', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...over });
  const waiting = () => world({ users: [{ id: 'u', firebaseUid: `${INVITED_UID_PREFIX}${INV}`, email: 'asha@vmotiv.in', status: 'ACTIVE' }], employees: [{ userId: 'u' }] });

  it('claims only for a verified Google address', async () => {
    for (const bad of [{ email_verified: false }, { firebase: { sign_in_provider: 'password' } }]) {
      const w = waiting();
      await withInvitedEmployeeClaim(async () => token(bad) as Any, w.db)('t', true);
      expect(w.users[0]!.firebaseUid.startsWith(INVITED_UID_PREFIX)).toBe(true);
    }
    const w = waiting();
    await withInvitedEmployeeClaim(async () => token() as Any, w.db)('t', true);
    expect(w.users[0]!.firebaseUid).toBe('google-asha');
  });

  it('notices an acceptance made after the person first tried to sign in', async () => {
    const w = world();
    const verify = withInvitedEmployeeClaim(async () => token() as Any, w.db);
    await verify('t', true);
    await w.store.acceptInvitationManually(admin, INV, reason);
    await verify('t', true);
    expect(w.users[0]!.firebaseUid).toBe('google-asha');
  });

  it('asks the database only once for someone who has their own account, and never blocks sign-in if it fails', async () => {
    const w = world({ users: [{ id: 'u', firebaseUid: 'google-asha', email: 'asha@vmotiv.in', status: 'ACTIVE' }] });
    const verify = withInvitedEmployeeClaim(async () => token() as Any, w.db);
    await verify('t', true); await verify('t', true);
    expect(w.db.user.findUnique).toHaveBeenCalledTimes(1);
    const broken: Any = { user: { findUnique: vi.fn().mockRejectedValue(new Error('db down')) } };
    await expect(withInvitedEmployeeClaim(async () => token() as Any, broken)('t', true)).resolves.toMatchObject({ uid: 'google-asha' });
  });
});
