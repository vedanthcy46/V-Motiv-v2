import { describe, expect, it, vi } from 'vitest';
import { roleCatalog } from '../src/admin-catalog.js';
import { HttpError } from '../src/errors.js';
import { PrismaScrapStore, ScrapValidationError, type DraftPatch, type StaffContext } from '../src/scrap/scrap-store.js';
import { makeFakeScrapDb } from './helpers/fake-scrap-db.js';

type Any = any;

const CUSTOMER_1 = { id: '11111111-1111-4111-8111-111111111111', firebaseUid: 'uid-1', status: 'ACTIVE', displayName: 'Asha Rao', email: 'asha@example.test', phone: '+919999900001' };
const CUSTOMER_2 = { id: '22222222-2222-4222-8222-222222222222', firebaseUid: 'uid-2', status: 'ACTIVE', displayName: 'Ravi Kumar', email: 'ravi@example.test', phone: '+919999900002' };
const GARAGE_CAR = { id: '33333333-3333-4333-8333-333333333333', userId: CUSTOMER_1.id, isArchived: false, registrationNumber: 'KA01AB1234', make: 'Hyundai', model: 'i10', variant: 'Magna', year: 2010, fuelType: 'Petrol', odometerKm: 150000, vin: null };
const OTHERS_CAR = { ...GARAGE_CAR, id: '44444444-4444-4444-8444-444444444444', userId: CUSTOMER_2.id };

const fullDraft: DraftPatch = {
  vehicle: { registrationNumber: 'KA 01 AB 1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2010, fuelType: 'PETROL', vehicleCategory: 'PASSENGER_CAR', odometerKm: 180000 },
  answers: {
    overall_condition: 'POOR', running_condition: 'DRIVABLE', access_restricted: false, accident_history: false, flood_fire_damage: 'NONE', major_body_damage: false,
    engine_present: true, gearbox_present: true, battery_present: true, wheels_tyres_present: true, completeness: 'COMPLETE',
  },
  ownership: { isRegisteredOwner: true, hasLoan: false, hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true },
  pickupAddress: { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
};

/** An employee with the permissions the REAL role catalogue grants that role, so these tests also check the grants. */
function staffSeed(userId: string, firebaseUid: string, role: keyof typeof roleCatalog, extra: string[] = []) {
  return {
    employee: { userId, role, active: true, status: 'ACTIVE', permissions: extra, user: { email: `${firebaseUid}@staff.test`, firebaseUid, status: 'ACTIVE' }, roleAssignments: [] },
    role: { key: role, permissions: roleCatalog[role].permissions.map(key => ({ permission: { key } })) },
  };
}
const SALES = staffSeed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'sales-1', 'SALES_EXECUTIVE');
const SALES_2 = staffSeed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'sales-2', 'SALES_EXECUTIVE');
const OPS = staffSeed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'ops-1', 'OPERATIONS_MANAGER');
const NOT_SCRAP_STAFF = staffSeed('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'insp-1', 'INSPECTOR');

function setup(seed: Record<string, Any[]> = {}) {
  const db = makeFakeScrapDb({
    user: [CUSTOMER_1, CUSTOMER_2], customerVehicle: [GARAGE_CAR, OTHERS_CAR],
    employee: [SALES.employee, SALES_2.employee, OPS.employee, NOT_SCRAP_STAFF.employee], role: [SALES.role, SALES_2.role, OPS.role, NOT_SCRAP_STAFF.role],
    ...seed,
  });
  const store = new PrismaScrapStore(db);
  const rows = (name: string): Any[] => db.tables[name] ?? [];
  const staff = (uid: string) => store.staffContext(uid);
  /** A submitted case for CUSTOMER_1 (sitting in SALES_REVIEW), optionally with a different plate. */
  async function submitted(uid = 'uid-1', registrationNumber = 'KA 01 AB 1234', patch: Partial<DraftPatch> = {}) {
    const created: Any = await store.createDraft(uid, { draft: { ...fullDraft, ...patch, vehicle: { ...fullDraft.vehicle, registrationNumber } } });
    const result: Any = await store.submit(uid, created.request.id);
    return result.request as Any;
  }
  return { db, store, rows, staff, submitted };
}

const code = (promise: Promise<unknown>) => promise.then(() => null, (error: Any) => error.code ?? error.message);
const status = (db: Any, id: string) => db.tables.scrapRequest.find((row: Any) => row.id === id).status as string;

describe('drafts', () => {
  it('creates a draft the customer can continue on any device, with the questions currently shown and what is still missing', async () => {
    const { store } = setup();
    const { created, request }: Any = await store.createDraft('uid-1', { draft: { vehicle: { registrationNumber: 'KA01AB1234' }, answers: { running_condition: 'NOT_STARTING' } } });
    expect(created).toBe(true);
    expect(request).toMatchObject({ status: 'DRAFT', version: 1, requestNumber: expect.stringMatching(/^SCR-\d{8}-[A-Z2-9]{6}$/) });
    expect(request.visibleQuestions).toContain('towing_details');
    expect(request.missing.length).toBeGreaterThan(0);
    expect(request.draft.vehicle.registrationNumber).toBe('KA01AB1234');
  });

  it('is idempotent on the submission key: a retried create returns the same draft', async () => {
    const { store, rows } = setup();
    const first: Any = await store.createDraft('uid-1', { submissionKey: 'key-12345678' });
    const again: Any = await store.createDraft('uid-1', { submissionKey: 'key-12345678' });
    expect(again.created).toBe(false);
    expect(again.request.id).toBe(first.request.id);
    expect(rows('scrapRequest')).toHaveLength(1);
    // another customer using the same key is a different request
    expect((await store.createDraft('uid-2', { submissionKey: 'key-12345678' }) as Any).created).toBe(true);
  });

  it('limits unfinished drafts', async () => {
    const { store } = setup();
    for (let index = 0; index < 5; index += 1) await store.createDraft('uid-1', {});
    expect(await code(store.createDraft('uid-1', {}))).toBe('TOO_MANY_DRAFTS');
    expect(await code(store.createDraft('uid-2', {}))).toBeNull();
  });

  it('starts from one of the customer\'s own garage cars, and refuses someone else\'s', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', { customerVehicleId: GARAGE_CAR.id });
    expect(request.draft.vehicle).toMatchObject({ registrationNumber: 'KA01AB1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2010, fuelType: 'PETROL', odometerKm: 150000 });
    expect(await code(store.createDraft('uid-1', { customerVehicleId: OTHERS_CAR.id }))).toBe('GARAGE_VEHICLE_NOT_FOUND');
  });

  it('refuses invalid details with the field named, and keeps nothing', async () => {
    const { store, rows } = setup();
    const error: Any = await store.createDraft('uid-1', { draft: { vehicle: { odometerKm: -5 } } }).catch(caught => caught);
    expect(error).toBeInstanceOf(ScrapValidationError);
    expect(error.fields).toEqual([{ field: 'vehicle.odometerKm', message: expect.any(String) }]);
    expect(rows('scrapRequest')).toHaveLength(0);
  });

  it('updates merge into what is there, count versions, and a stale version is refused (another device wrote first)', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: { vehicle: { make: 'Hyundai' } } });
    const second: Any = await store.updateDraft('uid-1', request.id, 1, { vehicle: { model: 'i10' }, answers: { running_condition: 'DRIVABLE' } });
    expect(second.version).toBe(2);
    expect(second.draft.vehicle).toEqual({ make: 'Hyundai', model: 'i10' });
    expect(await code(store.updateDraft('uid-1', request.id, 1, { vehicle: { model: 'Other' } }))).toBe('SCRAP_VERSION_CONFLICT');
    expect(second.draft.answers).toEqual({ running_condition: 'DRIVABLE' });
  });

  it('drops answers that stop being relevant when an earlier answer changes', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: { answers: { accident_history: true, accident_details: 'hit from behind', airbags_deployed: true } } });
    const updated: Any = await store.updateDraft('uid-1', request.id, 1, { answers: { accident_history: false } });
    expect(updated.draft.answers).toEqual({ accident_history: false });
  });

  it('a vehicle, ownership or address field set to null is cleared, so a stale value cannot be submitted by accident', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: { vehicle: { make: 'Hyundai', model: 'i10' }, ownership: { hasLoan: true, lenderName: 'HDFC' }, pickupAddress: { line1: '12 MG Road', city: 'Bengaluru' } } });
    const updated: Any = await store.updateDraft('uid-1', request.id, 1, { vehicle: { model: null }, ownership: { lenderName: null }, pickupAddress: { line1: null } });
    expect(updated.draft.vehicle).toEqual({ make: 'Hyundai' });
    expect(updated.draft.ownership).toEqual({ hasLoan: true });
    expect(updated.draft.pickupAddress).toEqual({ city: 'Bengaluru' });
    expect(updated.missing.map((error: Any) => error.field)).toEqual(expect.arrayContaining(['vehicle.model', 'ownership.lenderName', 'pickupAddress.line1']));
  });

  it('an answer set to null is removed', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: { answers: { overall_condition: 'GOOD' } } });
    expect((await store.updateDraft('uid-1', request.id, 1, { answers: { overall_condition: null } }) as Any).draft.answers).toEqual({});
  });

  it('only the owner can read, edit or delete a draft; to anyone else it does not exist', async () => {
    const { store } = setup();
    const { request }: Any = await store.createDraft('uid-1', {});
    for (const attempt of [store.getForCustomer('uid-2', request.id), store.updateDraft('uid-2', request.id, 1, {}), store.deleteDraft('uid-2', request.id)]) expect(await code(attempt)).toBe('SCRAP_REQUEST_NOT_FOUND');
    expect(await code(store.getForCustomer('uid-1', 'not-a-uuid'))).toBe('SCRAP_REQUEST_NOT_FOUND');
    expect(await store.deleteDraft('uid-1', request.id)).toEqual({ deleted: true });
  });
});

describe('submitting', () => {
  it('names every missing field when the draft is incomplete, and submits nothing', async () => {
    const { store, rows } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: { vehicle: { make: 'Hyundai' } } });
    const error: Any = await store.submit('uid-1', request.id).catch(caught => caught);
    expect(error).toBeInstanceOf(ScrapValidationError);
    expect(error.fields.map((field: Any) => field.field)).toEqual(expect.arrayContaining(['vehicle.registrationNumber', 'answers.overall_condition', 'pickupAddress.line1', 'pickupAddress.pincode', 'ownership.isRegisteredOwner', 'ownership.declarationAccepted']));
    expect(rows('scrapVehicleSnapshot')).toHaveLength(0);
    expect(rows('scrapRequest')[0].status).toBe('DRAFT');
  });

  it('turns a complete draft into a request in sales review, with its records, history and no leftover draft', async () => {
    const { store, rows, db } = setup();
    const summary = await (async () => { const { request }: Any = await store.createDraft('uid-1', { draft: fullDraft }); return store.submit('uid-1', request.id) as Promise<Any>; })();
    expect(summary).toMatchObject({ alreadySubmitted: false, request: { status: 'SALES_REVIEW', statusLabel: 'Being reviewed' } });
    const request = rows('scrapRequest')[0];
    expect(request).toMatchObject({ status: 'SALES_REVIEW', draftData: null, registrationNormalized: 'KA01AB1234', city: 'Bengaluru', blockingFlags: [], customerId: CUSTOMER_1.id });
    expect(request.submittedAt).toBeInstanceOf(Date);
    expect(request.ownershipDeclaredAt).toBeInstanceOf(Date);
    expect(rows('scrapVehicleSnapshot')[0]).toMatchObject({ registrationNumber: 'KA01AB1234', identitySource: 'CUSTOMER_DECLARED', isElectric: false, vehicleCategory: 'PASSENGER_CAR' });
    expect(rows('scrapConditionAnswer')).toHaveLength(Object.keys(fullDraft.answers!).length);
    expect(rows('scrapStatusEvent').map(event => [event.fromStatus, event.toStatus, event.actorType])).toEqual([['DRAFT', 'SUBMITTED', 'CUSTOMER'], ['SUBMITTED', 'SALES_REVIEW', 'SYSTEM']]);
    expect(rows('auditEvent').filter(event => event.action === 'SCRAP_STATUS_CHANGED')).toHaveLength(2);
    expect(status(db, request.id)).toBe('SALES_REVIEW');
  });

  it('is safe to repeat: a second submit creates nothing and returns the same request', async () => {
    const { store, rows } = setup();
    const { request }: Any = await store.createDraft('uid-1', { draft: fullDraft });
    await store.submit('uid-1', request.id);
    const counts = { events: rows('scrapStatusEvent').length, snapshots: rows('scrapVehicleSnapshot').length, estimates: rows('scrapEstimate').length };
    const again: Any = await store.submit('uid-1', request.id);
    expect(again.alreadySubmitted).toBe(true);
    expect({ events: rows('scrapStatusEvent').length, snapshots: rows('scrapVehicleSnapshot').length, estimates: rows('scrapEstimate').length }).toEqual(counts);
    expect(await code(store.updateDraft('uid-1', request.id, 1, {}))).toBe('SCRAP_NOT_EDITABLE');
  });

  it('records "quotation required" when there is no approved pricing, and an estimate range when there is', async () => {
    const none = setup();
    await none.submitted();
    expect(none.rows('scrapEstimate')[0]).toMatchObject({ status: 'QUOTATION_REQUIRED', minPaise: null, maxPaise: null, version: 1 });
    expect(none.rows('scrapEstimate')[0].sourceData.reason).toMatch(/no approved scrap pricing/i);

    const priced = setup({
      scrapPolicy: [{ key: 'indicative_pricing', value: {
        source: 'Rate sheet', effectiveFrom: '2026-01-01', materialPricePerKgPaise: { PASSENGER_CAR: 2000 }, defaultWeightKg: { PASSENGER_CAR: 900 },
        completenessPermille: { COMPLETE: 1000, MOSTLY: 800, PARTIAL: 500 }, rangeSpreadPermille: 100, validDays: 7,
      } }],
    });
    const summary = await priced.submitted();
    expect(priced.rows('scrapEstimate')[0]).toMatchObject({ status: 'ESTIMATED', calculationVersion: 'scrap-indicative-v1', minPaise: 1_620_000n, maxPaise: 1_980_000n });
    expect(summary.estimate).toMatchObject({ status: 'ESTIMATED', minPaise: '1620000', maxPaise: '1980000', currency: 'INR' });
  });

  it('raises concerns from the customer\'s own declarations, without rejecting the request', async () => {
    const { submitted, rows } = setup();
    await submitted('uid-1', 'KA01AB1234', { ownership: { isRegisteredOwner: false, ownerRelationship: 'Son of the owner', hasLoan: true, lenderName: 'HDFC', hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true } });
    expect(rows('scrapRequest')[0]).toMatchObject({ status: 'SALES_REVIEW', blockingFlags: ['NOT_REGISTERED_OWNER', 'UNDER_FINANCE'] });
  });

  it('records an electric vehicle and asks its own questions', async () => {
    const { store, rows } = setup();
    const ownDraft: DraftPatch = {
      ...fullDraft, vehicle: { ...fullDraft.vehicle, registrationNumber: 'KA05EV0001', fuelType: 'ELECTRIC' },
      answers: { ...fullDraft.answers, engine_present: null, gearbox_present: null, battery_present: null, hv_battery_present: true, hv_battery_damaged: false, hv_isolation_concern: 'NONE' },
    };
    const { request }: Any = await store.createDraft('uid-1', { draft: ownDraft });
    await store.submit('uid-1', request.id);
    expect(rows('scrapVehicleSnapshot')[0].isElectric).toBe(true);
    expect(rows('scrapConditionAnswer').map(answer => answer.questionKey)).toContain('hv_battery_damaged');
    expect(rows('scrapConditionAnswer').map(answer => answer.questionKey)).not.toContain('engine_present');
  });

  it('requires the photographs the policy asks for', async () => {
    const { store } = setup({ scrapPolicy: [{ key: 'submission_requirements', value: { minVehiclePhotos: 3 } }] });
    const { request }: Any = await store.createDraft('uid-1', { draft: fullDraft });
    const error: Any = await store.submit('uid-1', request.id).catch(caught => caught);
    expect(error).toBeInstanceOf(ScrapValidationError);
    expect(error.fields[0].message).toMatch(/at least 3 photographs/);
  });
});

describe('one live request per vehicle', () => {
  it('refuses a second request for the same vehicle, however the plate is typed, telling the owner which one', async () => {
    const { store, submitted } = setup();
    const first = await submitted('uid-1', 'KA 01 AB 1234');
    const { request }: Any = await store.createDraft('uid-1', { draft: { ...fullDraft, vehicle: { ...fullDraft.vehicle, registrationNumber: 'ka-01-ab-1234' } } });
    const error: Any = await store.submit('uid-1', request.id).catch(caught => caught);
    expect(error).toMatchObject({ status: 409, code: 'SCRAP_REQUEST_ALREADY_ACTIVE' });
    expect(error.message).toContain(first.requestNumber);
  });

  it('does not tell a different customer about someone else\'s request', async () => {
    const { store, submitted } = setup();
    const first = await submitted('uid-1');
    const { request }: Any = await store.createDraft('uid-2', { draft: fullDraft });
    const error: Any = await store.submit('uid-2', request.id).catch(caught => caught);
    expect(error.code).toBe('SCRAP_REQUEST_ALREADY_ACTIVE');
    expect(error.message).not.toContain(first.requestNumber);
  });

  it('is enforced by the database too: two submissions at the same moment cannot both succeed', async () => {
    const { store, db, submitted } = setup();
    await submitted('uid-1');
    const { request }: Any = await store.createDraft('uid-2', { draft: fullDraft });
    // The application's own check misses (as it would in a race); the unique index still refuses.
    const original = db.scrapRequest.findFirst;
    db.scrapRequest.findFirst = async (args: Any) => (args?.where?.registrationNormalized ? null : original(args));
    expect(await code(store.submit('uid-2', request.id))).toBe('SCRAP_REQUEST_ALREADY_ACTIVE');
    db.scrapRequest.findFirst = original;
  });

  it('allows a new request once the earlier one is closed, and drafts never block anyone', async () => {
    const { store, submitted, db } = setup();
    const first = await submitted('uid-1');
    await store.cancel('uid-1', first.id, { reason: 'Changed my mind' });
    expect(status(db, first.id)).toBe('CANCELLED');
    expect(await code(submitted('uid-2'))).toBeNull();
    // an abandoned draft for the same plate is no obstacle
    const { store: other } = setup();
    await other.createDraft('uid-1', { draft: fullDraft });
    expect(await code(other.createDraft('uid-2', { draft: fullDraft }))).toBeNull();
  });
});

describe('tracking', () => {
  it('lists only the customer\'s own requests, newest first, in pages', async () => {
    const { store, submitted } = setup();
    for (const plate of ['KA01AB0001', 'KA01AB0002', 'KA01AB0003']) await submitted('uid-1', plate);
    await submitted('uid-2', 'KA01AB0009');
    const first: Any = await store.listForCustomer('uid-1', { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second: Any = await store.listForCustomer('uid-1', { limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map(item => item.vehicle.registrationNumber);
    expect(new Set(all).size).toBe(3);
    expect(all).not.toContain('KA01AB0009');
    expect(first.items[0]).toMatchObject({ status: 'SALES_REVIEW', statusLabel: expect.any(String) });
  });

  it('shows drafts in the list too, so an unfinished request is not lost', async () => {
    const { store } = setup();
    await store.createDraft('uid-1', { draft: { vehicle: { make: 'Hyundai' } } });
    expect(((await store.listForCustomer('uid-1', {})) as Any).items[0]).toMatchObject({ status: 'DRAFT', statusLabel: 'Draft' });
  });

  it('shows a request\'s details to its owner, and to no one else', async () => {
    const { store, submitted } = setup();
    const request = await submitted('uid-1');
    const detail: Any = await store.getForCustomer('uid-1', request.id);
    expect(detail).toMatchObject({ requestNumber: request.requestNumber, status: 'SALES_REVIEW', vehicle: { registrationNumber: 'KA01AB1234', identityStatus: 'AS_DECLARED_BY_YOU' } });
    expect(detail.timeline.map((entry: Any) => entry.status)).toEqual(['SUBMITTED', 'SALES_REVIEW']);
    expect(await code(store.getForCustomer('uid-2', request.id))).toBe('SCRAP_REQUEST_NOT_FOUND');
  });

  it('never shows staff names, internal notes, storage keys, an unsent offer, or an unverified certificate as verified', async () => {
    const { store, submitted, rows, db } = setup();
    const request = await submitted('uid-1');
    const id = request.id;
    rows('scrapStatusEvent').push({ id: 'e1', requestId: id, fromStatus: 'SALES_REVIEW', toStatus: 'DOCUMENTS_REQUIRED', actorType: 'STAFF', actorId: 'staff-1', reason: 'INTERNAL: looks like a duplicate of a fraud case', createdAt: new Date() });
    rows('scrapDocument').push({ id: 'd1', requestId: id, documentType: 'RC', status: 'REJECTED', rejectionReason: 'Photo is blurry', storageKey: 'private/secret-key', reviewedById: 'staff-1', createdAt: new Date() });
    rows('scrapOffer').push({ id: 'o1', requestId: id, quoteId: 'q1', version: 1, status: 'PENDING_APPROVAL', customerPayoutPaise: 500000n, currency: 'INR', payerType: 'RVSF', expiresAt: new Date(Date.now() + 1e9), createdAt: new Date() });
    rows('scrapCertificate').push({ id: 'c1', requestId: id, type: 'CERTIFICATE_OF_DEPOSIT', officialReference: 'COD-1', issuedAt: new Date(), verificationState: 'RECEIVED', verificationMethod: 'MANUAL_DOCUMENT_REVIEW', storageKey: 'private/cert', createdAt: new Date() });
    db.tables.scrapRequest[0].status = 'DOCUMENTS_REQUIRED';
    const detail: Any = await store.getForCustomer('uid-1', id);
    const text = JSON.stringify(detail);
    expect(text).not.toMatch(/INTERNAL|fraud|staff-1|private\/|secret-key/);
    expect(detail.offer).toBeNull(); // an offer still waiting for internal approval is not shown
    expect(detail.documents).toEqual([{ id: 'd1', documentType: 'RC', status: 'REJECTED', rejectionReason: 'Photo is blurry' }]); // what the customer must fix is shown
    expect(detail.certificates).toEqual([expect.objectContaining({ verificationState: 'RECEIVED', verificationMethod: null })]);
  });
});

describe('cancelling and concerns', () => {
  it('lets the customer cancel with a reason before the vehicle leaves them, and checks the version', async () => {
    const { store, submitted, db } = setup();
    const request = await submitted('uid-1');
    expect(await code(store.cancel('uid-1', request.id, { reason: 'x', expectedVersion: 1 }))).toBe('SCRAP_VERSION_CONFLICT');
    const cancelled: Any = await store.cancel('uid-1', request.id, { reason: 'I sold it elsewhere' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(db.tables.scrapRequest[0]).toMatchObject({ cancelReason: 'I sold it elsewhere', cancelledAt: expect.any(Date) });
    expect(await code(store.cancel('uid-1', request.id, { reason: 'again' }))).toBe('CASE_CLOSED');
    expect(await code(store.cancel('uid-2', request.id, { reason: 'not mine' }))).toBe('SCRAP_REQUEST_NOT_FOUND');
  });

  it('refuses to cancel once the vehicle has been collected', async () => {
    const { store, submitted, db } = setup();
    const request = await submitted('uid-1');
    db.tables.scrapRequest[0].status = 'COLLECTED';
    expect(await code(store.cancel('uid-1', request.id, { reason: 'too late' }))).toBe('CANCELLATION_AFTER_HANDOVER');
    expect(status(db, request.id)).toBe('COLLECTED');
  });

  it('records a concern and pauses a case that is still moving', async () => {
    const { store, submitted, rows, db } = setup();
    const request = await submitted('uid-1');
    const dispute: Any = await store.raiseDispute('uid-1', request.id, { category: 'WRONG_BENEFICIARY', description: 'The payout was meant for a different account.' });
    expect(dispute).toMatchObject({ category: 'WRONG_BENEFICIARY', status: 'OPEN' });
    expect(db.tables.scrapRequest[0]).toMatchObject({ status: 'ON_HOLD', holdFromStatus: 'SALES_REVIEW' });
    expect(rows('scrapStatusEvent').at(-1)).toMatchObject({ toStatus: 'ON_HOLD', actorType: 'SYSTEM' });
    expect(rows('auditEvent').some(event => event.action === 'SCRAP_DISPUTE_RAISED')).toBe(true);
  });

  it('refuses a concern that is not described, is of an unknown kind, or is on a draft; it does not pause a closed case', async () => {
    const { store, submitted, db } = setup();
    const draft: Any = await store.createDraft('uid-2', {});
    expect(await code(store.raiseDispute('uid-2', draft.request.id, { category: 'OTHER', description: 'Something is wrong here.' }))).toBe('SCRAP_NOT_SUBMITTED');
    const request = await submitted('uid-1');
    expect(await code(store.raiseDispute('uid-1', request.id, { category: 'NONSENSE', description: 'Something is wrong here.' }))).toBe('INVALID_INPUT');
    expect(await code(store.raiseDispute('uid-1', request.id, { category: 'OTHER', description: 'short' }))).toBe('INVALID_INPUT');
    db.tables.scrapRequest.find((row: Any) => row.id === request.id).status = 'COMPLETED';
    await store.raiseDispute('uid-1', request.id, { category: 'CERTIFICATE_MISMATCH', description: 'The certificate shows another chassis number.' });
    expect(status(db, request.id)).toBe('COMPLETED');
  });
});

describe('responding to an offer', () => {
  /** A case whose offer has been sent: the offer, its quote and a partner are inserted as the later phases will. */
  async function withOffer(overrides: Record<string, unknown> = {}) {
    const ctx = setup();
    const request = await ctx.submitted('uid-1');
    ctx.db.tables.scrapRequest[0].status = 'OFFER_PENDING_CUSTOMER';
    ctx.rows('scrapOffer').push({ id: '55555555-5555-4555-8555-555555555555', requestId: request.id, quoteId: '66666666-6666-4666-8666-666666666666', version: 1, status: 'SENT_TO_CUSTOMER', customerPayoutPaise: 1_500_000n, currency: 'INR', payerType: 'RVSF', approvedAt: new Date(), sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), termsVersion: 'terms-1', createdAt: new Date(), ...overrides });
    return { ...ctx, request, offerId: '55555555-5555-4555-8555-555555555555' };
  }

  it('accepting records the decision, marks the offer, and moves the case on; the network address is only kept hashed', async () => {
    const { store, rows, db, request, offerId } = await withOffer();
    const result: Any = await store.respondToOffer('uid-1', request.id, { offerId, decision: 'ACCEPTED', note: 'Please collect on Saturday', networkAddress: '203.0.113.9' });
    expect(result).toMatchObject({ repeated: false, request: { status: 'OFFER_ACCEPTED' } });
    expect(rows('scrapOffer')[0].status).toBe('ACCEPTED');
    expect(rows('scrapOfferAcceptance')[0]).toMatchObject({ offerId, customerId: CUSTOMER_1.id, decision: 'ACCEPTED', termsVersion: 'terms-1', networkHash: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(JSON.stringify(rows('scrapOfferAcceptance'))).not.toContain('203.0.113.9');
    expect(status(db, request.id)).toBe('OFFER_ACCEPTED');
  });

  it('is safe to repeat, and the opposite decision afterwards is refused', async () => {
    const { store, rows, request, offerId } = await withOffer();
    await store.respondToOffer('uid-1', request.id, { offerId, decision: 'ACCEPTED' });
    const again: Any = await store.respondToOffer('uid-1', request.id, { offerId, decision: 'ACCEPTED' });
    expect(again.repeated).toBe(true);
    expect(rows('scrapOfferAcceptance')).toHaveLength(1);
    expect(await code(store.respondToOffer('uid-1', request.id, { offerId, decision: 'REJECTED' }))).toBe('OFFER_ALREADY_DECIDED');
  });

  it('rejecting closes the case', async () => {
    const { store, db, request, offerId } = await withOffer();
    await store.respondToOffer('uid-1', request.id, { offerId, decision: 'REJECTED', note: 'Too low' });
    expect(status(db, request.id)).toBe('REJECTED');
  });

  it('refuses an expired offer, marks it expired, and leaves the case waiting for a new quotation', async () => {
    const { store, rows, db, request, offerId } = await withOffer({ expiresAt: new Date(Date.now() - 1000) });
    expect(await code(store.respondToOffer('uid-1', request.id, { offerId, decision: 'ACCEPTED' }))).toBe('OFFER_EXPIRED');
    expect(rows('scrapOffer')[0].status).toBe('EXPIRED');
    expect(rows('scrapOfferAcceptance')).toHaveLength(0);
    expect(status(db, request.id)).toBe('OFFER_PENDING_CUSTOMER');
  });

  it('refuses an old offer once a newer version exists, an offer that was never sent, and someone else\'s case', async () => {
    const { store, rows, request, offerId } = await withOffer();
    rows('scrapOffer').push({ id: '77777777-7777-4777-8777-777777777777', requestId: request.id, quoteId: 'q', version: 2, status: 'SENT_TO_CUSTOMER', customerPayoutPaise: 1_700_000n, expiresAt: new Date(Date.now() + 1e9), createdAt: new Date() });
    expect(await code(store.respondToOffer('uid-1', request.id, { offerId, decision: 'ACCEPTED' }))).toBe('OFFER_SUPERSEDED');
    expect(await code(store.respondToOffer('uid-2', request.id, { offerId, decision: 'ACCEPTED' }))).toBe('SCRAP_REQUEST_NOT_FOUND');
    const unsent = await withOffer({ status: 'PENDING_APPROVAL', sentAt: null });
    expect(await code(unsent.store.respondToOffer('uid-1', unsent.request.id, { offerId: unsent.offerId, decision: 'ACCEPTED' }))).toBe('OFFER_NOT_OPEN');
    expect(await code(unsent.store.respondToOffer('uid-1', unsent.request.id, { offerId: 'not-a-uuid', decision: 'ACCEPTED' }))).toBe('SCRAP_OFFER_NOT_FOUND');
  });

  it('shows the customer the offer once it is sent, with who pays and until when', async () => {
    const { store, request } = await withOffer();
    const detail: Any = await store.getForCustomer('uid-1', request.id);
    expect(detail.offer).toMatchObject({ version: 1, status: 'SENT_TO_CUSTOMER', customerPayoutPaise: '1500000', payerType: 'RVSF', currency: 'INR' });
  });
});

describe('staff', () => {
  it('knows staff from the database and the permissions their roles grant, and refuses everyone else', async () => {
    const { store, staff } = setup();
    const sales = await staff('sales-1');
    expect(sales.permissions).toEqual(expect.arrayContaining(['scrap.request.read', 'scrap.lead.qualify']));
    expect(sales.permissions).not.toContain('scrap.certificate.verify');
    expect(await code(staff('uid-1'))).toBe('SCRAP_ACCESS_DENIED'); // a customer
    expect(await code(staff('insp-1'))).toBe('SCRAP_ACCESS_DENIED'); // staff with no scrapping permission
    expect(await code(staff('nobody'))).toBe('SCRAP_ACCESS_DENIED');
    expect(store).toBeDefined();
  });

  it('sales sees leads assigned to them or unassigned, up to assessment; operations sees every case; nobody sees drafts', async () => {
    const { store, staff, submitted, db } = setup();
    const a = await submitted('uid-1', 'KA01AB0001');
    const b = await submitted('uid-1', 'KA01AB0002');
    const c = await submitted('uid-2', 'KA01AB0003');
    await store.createDraft('uid-2', {});
    db.tables.scrapRequest.find((row: Any) => row.id === b.id).salesAssigneeId = SALES_2.employee.userId; // someone else's lead
    db.tables.scrapRequest.find((row: Any) => row.id === c.id).status = 'COLLECTION_SCHEDULED'; // past sales' stage
    const sales: Any = await store.listForStaff(await staff('sales-1'), {});
    expect(sales.items.map((item: Any) => item.id)).toEqual([a.id]);
    const ops: Any = await store.listForStaff(await staff('ops-1'), {});
    expect(ops.items.map((item: Any) => item.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(ops.items[0].customer).toMatchObject({ name: expect.any(String), email: expect.any(String) });
    expect(await code(store.getForStaff(await staff('sales-1'), b.id))).toBe('SCRAP_REQUEST_NOT_FOUND');
  });

  it('searches by request number or plate, filters by status, and pages', async () => {
    const { store, staff, submitted } = setup();
    const a = await submitted('uid-1', 'KA01AB0001');
    await submitted('uid-2', 'MH12CD9999');
    const ops = await staff('ops-1');
    expect(((await store.listForStaff(ops, { search: 'mh 12 cd' })) as Any).items.map((item: Any) => item.vehicle.registrationNumber)).toEqual(['MH12CD9999']);
    expect(((await store.listForStaff(ops, { search: a.requestNumber })) as Any).items).toHaveLength(1);
    expect(((await store.listForStaff(ops, { status: 'COMPLETED' })) as Any).items).toEqual([]);
    const first: Any = await store.listForStaff(ops, { limit: 1 });
    expect(first.nextCursor).toBeTruthy();
  });

  it('qualifies a lead only in sales review, with a note, taking ownership, and records it on the timeline', async () => {
    const { store, staff, submitted, rows } = setup();
    const request = await submitted('uid-1');
    const sales = await staff('sales-1');
    expect(await code(store.qualifyLead(sales, request.id, { qualified: true, note: ' ' }))).toBe('NOTE_REQUIRED');
    const detail: Any = await store.qualifyLead(sales, request.id, { qualified: true, note: 'Spoke to the owner; details match.' });
    expect(detail.facts.qualifiedBySales).toBe(true);
    expect(rows('scrapRequest')[0].salesAssigneeId).toBe(SALES.employee.userId);
    expect(rows('scrapStatusEvent').at(-1)).toMatchObject({ actorType: 'STAFF', evidence: { kind: 'LEAD_QUALIFIED' }, fromStatus: 'SALES_REVIEW', toStatus: 'SALES_REVIEW' });
    expect(await code(store.qualifyLead(await staff('ops-1'), request.id, { qualified: true, note: 'ops cannot qualify' }))).toBe('PERMISSION_DENIED');
  });

  it('moves a qualified, unblocked lead to assessment and refuses it while a concern is open or it is not qualified', async () => {
    const { store, staff, submitted } = setup();
    const request = await submitted('uid-1', 'KA01AB1234', { ownership: { isRegisteredOwner: true, hasLoan: true, lenderName: 'HDFC', hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true } });
    const sales = await staff('sales-1');
    const version = (await store.getForStaff(sales, request.id) as Any).version;
    expect(await code(store.transition(sales, request.id, { to: 'ASSESSMENT_PENDING', expectedVersion: version }))).toBe('CASE_BLOCKED'); // finance concern from the declaration
    const cleared: Any = await store.setBlockingFlag(sales, request.id, { flag: 'UNDER_FINANCE', action: 'CLEAR', note: 'Lender NOC seen.' });
    expect(cleared.blockingFlags).toEqual([]);
    expect(await code(store.transition(sales, request.id, { to: 'ASSESSMENT_PENDING', expectedVersion: cleared.version }))).toBe('LEAD_NOT_QUALIFIED');
    const qualified: Any = await store.qualifyLead(sales, request.id, { qualified: true, note: 'Checked.' });
    const moved: Any = await store.transition(sales, request.id, { to: 'ASSESSMENT_PENDING', expectedVersion: qualified.version });
    expect(moved).toMatchObject({ status: 'ASSESSMENT_PENDING' });
    expect(moved.timeline.at(-1)).toMatchObject({ from: 'SALES_REVIEW', to: 'ASSESSMENT_PENDING', actorType: 'STAFF' });
  });

  it('refuses a status change that skips the work, and one the person has no permission for', async () => {
    const { store, staff, submitted, db } = setup();
    const request = await submitted('uid-1');
    const sales = await staff('sales-1');
    const version = (await store.getForStaff(sales, request.id) as Any).version;
    expect(await code(store.transition(sales, request.id, { to: 'COMPLETED', expectedVersion: version }))).toBe('TRANSITION_NOT_ALLOWED');
    expect(await code(store.transition(sales, request.id, { to: 'SCRAPPING_COMPLETED', expectedVersion: version }))).toBe('TRANSITION_NOT_ALLOWED');
    db.tables.scrapRequest[0].status = 'SCRAPPING_IN_PROGRESS';
    expect(await code(store.getForStaff(sales, request.id))).toBe('SCRAP_REQUEST_NOT_FOUND'); // outside sales' scope
    const ops = await staff('ops-1');
    const opsVersion = (await store.getForStaff(ops, request.id) as Any).version;
    expect(await code(store.transition(ops, request.id, { to: 'SCRAPPING_COMPLETED', expectedVersion: opsVersion }))).toBe('DEPOSIT_CERTIFICATE_NOT_VERIFIED'); // even with the permission: no verified certificate
    expect(status(db, request.id)).toBe('SCRAPPING_IN_PROGRESS');
  });

  it('refuses a stale version, so two people editing at once cannot both win', async () => {
    const { store, staff, submitted } = setup();
    const request = await submitted('uid-1');
    const ops = await staff('ops-1');
    const version = (await store.getForStaff(ops, request.id) as Any).version;
    await store.transition(ops, request.id, { to: 'ON_HOLD', expectedVersion: version, reason: 'Checking something' });
    expect(await code(store.transition(ops, request.id, { to: 'CANCELLED', expectedVersion: version, reason: 'stale' }))).toBe('SCRAP_VERSION_CONFLICT');
  });

  it('holds with a reason and resumes only to where it was', async () => {
    const { store, staff, submitted } = setup();
    const request = await submitted('uid-1');
    const ops = await staff('ops-1');
    let detail: Any = await store.getForStaff(ops, request.id);
    expect(await code(store.transition(ops, request.id, { to: 'ON_HOLD', expectedVersion: detail.version }))).toBe('REASON_REQUIRED');
    detail = await store.transition(ops, request.id, { to: 'ON_HOLD', expectedVersion: detail.version, reason: 'Waiting for the owner' });
    expect(detail).toMatchObject({ status: 'ON_HOLD', holdFromStatus: 'SALES_REVIEW', holdReason: 'Waiting for the owner' });
    expect(await code(store.transition(ops, request.id, { to: 'OPERATIONS_REVIEW', expectedVersion: detail.version }))).toBe('TRANSITION_NOT_ALLOWED');
    detail = await store.transition(ops, request.id, { to: 'SALES_REVIEW', expectedVersion: detail.version });
    expect(detail).toMatchObject({ status: 'SALES_REVIEW', holdFromStatus: null });
  });

  it('asks the customer for documents, and the case waits until they are provided and accepted', async () => {
    const { store, staff, submitted, rows } = setup();
    const request = await submitted('uid-1');
    const sales = await staff('sales-1');
    expect(await code(store.requestDocuments(sales, request.id, { documentTypes: [] }))).toBe('DOCUMENT_TYPES_REQUIRED');
    const detail: Any = await store.requestDocuments(sales, request.id, { documentTypes: ['rc', 'ID_PROOF', 'RC'] });
    expect(detail.status).toBe('DOCUMENTS_REQUIRED');
    expect(rows('scrapDocument').map(document => [document.documentType, document.status])).toEqual([['RC', 'REQUESTED'], ['ID_PROOF', 'REQUESTED']]);
    // the customer sees what is wanted
    expect(((await store.getForCustomer('uid-1', request.id)) as Any).documents.map((document: Any) => document.documentType)).toEqual(['RC', 'ID_PROOF']);
    // a document that has not been provided cannot be reviewed
    expect(await code(store.reviewDocument(sales, rows('scrapDocument')[0].id, { decision: 'ACCEPT' }))).toBe('DOCUMENT_NOT_REVIEWABLE');
    rows('scrapDocument')[0].status = 'UPLOADED';
    expect(await code(store.reviewDocument(sales, rows('scrapDocument')[0].id, { decision: 'REJECT' }))).toBe('REASON_REQUIRED');
    expect(await store.reviewDocument(sales, rows('scrapDocument')[0].id, { decision: 'REJECT', reason: 'Photo is blurry' })).toEqual({ id: rows('scrapDocument')[0].id, status: 'REJECTED' });
    expect(rows('scrapDocument')[0]).toMatchObject({ status: 'REJECTED', reviewedById: SALES.employee.userId, rejectionReason: 'Photo is blurry' });
    expect(await code(store.reviewDocument(sales, rows('scrapDocument')[0].id, { decision: 'ACCEPT' }))).toBe('DOCUMENT_NOT_REVIEWABLE'); // already reviewed
  });

  it('sets a staff-raised concern, but customer-declared concerns can only be cleared, never invented', async () => {
    const { store, staff, submitted } = setup();
    const request = await submitted('uid-1');
    const sales = await staff('sales-1');
    const set: Any = await store.setBlockingFlag(sales, request.id, { flag: 'LEGAL_RESTRICTION', action: 'SET', note: 'Police hold noted on the RC.' });
    expect(set.blockingFlags).toEqual(['LEGAL_RESTRICTION']);
    expect(await code(store.setBlockingFlag(sales, request.id, { flag: 'UNDER_FINANCE', action: 'SET', note: 'made up' }))).toBe('INVALID_INPUT');
    expect(await code(store.setBlockingFlag(sales, request.id, { flag: 'NOT_A_FLAG', action: 'SET', note: 'whatever' }))).toBe('INVALID_INPUT');
    expect(await code(store.setBlockingFlag(sales, request.id, { flag: 'LEGAL_RESTRICTION', action: 'CLEAR', note: ' ' }))).toBe('NOTE_REQUIRED');
    expect(((await store.setBlockingFlag(sales, request.id, { flag: 'LEGAL_RESTRICTION', action: 'CLEAR', note: 'Hold lifted, letter seen.' })) as Any).blockingFlags).toEqual([]);
  });

  it('shows staff what they could do next, and what is missing for what they cannot', async () => {
    const { store, staff, submitted } = setup();
    const request = await submitted('uid-1');
    const detail: Any = await store.getForStaff(await staff('sales-1'), request.id);
    const toAssessment = detail.nextSteps.find((step: Any) => step.to === 'ASSESSMENT_PENDING');
    expect(toAssessment).toMatchObject({ allowed: false, blockedBy: { code: 'LEAD_NOT_QUALIFIED' } });
    expect(detail.nextSteps.map((step: Any) => step.to)).not.toContain('COLLECTION_SCHEDULED');
  });
});

describe('the database update', () => {
  it('says plainly that scrapping is not available until the migration has been applied, and remembers once it is', async () => {
    const { store, db } = setup();
    db.$queryRaw = vi.fn().mockResolvedValueOnce([{ ready: false }]).mockResolvedValue([{ ready: true }]);
    await expect(store.assertSchemaReady()).rejects.toMatchObject({ status: 503, code: 'SCRAP_SCHEMA_NOT_READY' });
    await expect(store.assertSchemaReady()).resolves.toBeUndefined();
    await expect(store.assertSchemaReady()).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2); // the second positive answer was cached
    expect(new HttpError(503, 'X')).toBeInstanceOf(Error);
  });
});

// keep the type import used even when assertions above are narrowed
export type _Ctx = StaffContext;
