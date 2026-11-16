import { describe, expect, it } from 'vitest';
import {
  PROGRESS_STAGES, STEPS, customerAction, diffDraft, draftFromServer, emptyDraft, fieldErrorsFrom, firstIncompleteStep, formatPaise, formatPaiseRange, isRetryable,
  progressStage, pruneAnswers, scrapErrorMessage, statusTone, stepForField, stepProblems, verificationText, visibleQuestions,
  type DraftState, type QuestionnaireDefinition,
} from './scrap-form';
// The real server definition and evaluator: the app's interpreter must agree with them exactly.
import { questionnaireDefinition, visibleQuestions as serverVisible, type Answers as ServerAnswers, type VehicleInput } from '../../../../services/api/src/scrap/scrap-questionnaire';

const definition = JSON.parse(JSON.stringify(questionnaireDefinition())) as QuestionnaireDefinition;

const complete = (): DraftState => ({
  vehicle: { registrationNumber: 'KA01AB1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2010, fuelType: 'PETROL', vehicleCategory: 'PASSENGER_CAR', odometerKm: 180000 },
  answers: {
    overall_condition: 'POOR', running_condition: 'DRIVABLE', access_restricted: false, accident_history: false, flood_fire_damage: 'NONE', major_body_damage: false,
    engine_present: true, gearbox_present: true, battery_present: true, wheels_tyres_present: true, completeness: 'COMPLETE',
  },
  ownership: { isRegisteredOwner: true, hasLoan: false, hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true },
  pickupAddress: { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
});

describe('the app interprets the server questionnaire exactly as the server does', () => {
  it('shows the same questions for every combination of the answers that change what is asked', () => {
    const running = ['DRIVABLE', 'STARTS_NOT_DRIVABLE', 'NOT_STARTING', undefined];
    const booleans = [true, false, undefined];
    const flood = ['NONE', 'FLOOD', 'FIRE', 'BOTH', undefined];
    let compared = 0;
    for (const fuelType of ['PETROL', 'ELECTRIC', undefined]) for (const r of running) for (const access of booleans) for (const accident of booleans) for (const f of flood) {
      const answers = { running_condition: r, access_restricted: access, accident_history: accident, flood_fire_damage: f } as Record<string, string | boolean | undefined>;
      const clean = Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined)) as ServerAnswers;
      const vehicle: VehicleInput = fuelType ? { fuelType } : {};
      expect(visibleQuestions(definition, clean, vehicle).map(question => question.key)).toEqual(serverVisible(clean, vehicle).map(question => question.key));
      compared += 1;
    }
    expect(compared).toBe(3 * 4 * 3 * 3 * 5);
  });

  it('prunes the answers a changed answer makes irrelevant', () => {
    const answers = { accident_history: false, accident_details: 'old', airbags_deployed: true, insurance_claim: 'FILED' };
    expect(pruneAnswers(definition, answers, {})).toEqual({ accident_history: false });
  });
});

describe('what is missing on each step', () => {
  it('a new request is missing everything, and a complete one nothing', () => {
    expect(stepProblems('VEHICLE', emptyDraft(), definition).map(problem => problem.field)).toEqual([
      'vehicle.registrationNumber', 'vehicle.make', 'vehicle.model', 'vehicle.manufacturingYear', 'vehicle.fuelType', 'vehicle.vehicleCategory', 'vehicle.odometerKm',
    ]);
    for (const step of STEPS) expect(stepProblems(step.id, complete(), definition), step.id).toEqual([]);
    expect(firstIncompleteStep(complete(), definition)).toBeNull();
    expect(firstIncompleteStep(emptyDraft(), definition)).toBe('VEHICLE');
  });

  it('asks only for the questions that are shown, and for the details a conditional answer opens up', () => {
    const draft = complete();
    draft.answers = { ...draft.answers, running_condition: 'NOT_STARTING', accident_history: true };
    const condition = stepProblems('CONDITION', draft, definition).map(problem => problem.field);
    expect(condition).toEqual(['answers.towing_details']);
    const damage = stepProblems('DAMAGE', draft, definition).map(problem => problem.field);
    expect(damage).toEqual(expect.arrayContaining(['answers.accident_details', 'answers.airbags_deployed', 'answers.insurance_claim']));
    expect(damage).not.toContain('answers.flood_fire_safety_notes');
  });

  it('does not ask the engine questions of an electric vehicle, and does ask the high-voltage ones', () => {
    const draft = complete();
    draft.vehicle.fuelType = 'ELECTRIC';
    draft.answers = { ...draft.answers };
    const damage = stepProblems('DAMAGE', draft, definition).map(problem => problem.field);
    expect(damage).toEqual(expect.arrayContaining(['answers.hv_battery_present', 'answers.hv_battery_damaged', 'answers.hv_isolation_concern']));
    expect(damage).not.toContain('answers.engine_present');
  });

  it('waits for the questions to load before judging', () => {
    expect(stepProblems('CONDITION', emptyDraft(), null)).toEqual([{ field: 'questions', message: expect.any(String) }]);
  });

  it('ownership needs every yes/no, the details a yes opens up, and the confirmation', () => {
    const draft = complete();
    draft.ownership = { isRegisteredOwner: false, hasLoan: true, hasPendingDues: true, hasLegalDispute: true, declarationAccepted: false };
    expect(stepProblems('OWNERSHIP', draft, definition).map(problem => problem.field)).toEqual([
      'ownership.ownerRelationship', 'ownership.lenderName', 'ownership.duesDetails', 'ownership.disputeDetails', 'ownership.declarationAccepted',
    ]);
    expect(stepProblems('OWNERSHIP', { ...draft, ownership: {} }, definition)).toHaveLength(5); // four yes/no + the confirmation
  });

  it('pickup needs address, city and pincode', () => {
    expect(stepProblems('PICKUP', emptyDraft(), definition).map(problem => problem.field)).toEqual(['pickupAddress.line1', 'pickupAddress.city', 'pickupAddress.pincode']);
    expect(stepProblems('PICKUP', { ...emptyDraft(), pickupAddress: { line1: '  ', city: 'x', pincode: '1' } }, definition)[0]!.field).toBe('pickupAddress.line1'); // blank is not an answer
  });
});

describe('saving a draft sends only what changed', () => {
  it('sends nothing when nothing changed, and only the changed fields otherwise', () => {
    const saved = complete();
    expect(diffDraft(saved, structuredClone(saved))).toBeNull();
    const next = structuredClone(saved);
    next.vehicle.model = 'Grand i10';
    next.answers.overall_condition = 'FAIR';
    expect(diffDraft(saved, next)).toEqual({ vehicle: { model: 'Grand i10' }, answers: { overall_condition: 'FAIR' } });
  });

  it('sends a cleared field as null, so the server removes it instead of keeping the old value', () => {
    const saved = complete();
    const next = structuredClone(saved);
    next.vehicle.model = '';
    delete next.answers.completeness;
    next.pickupAddress.line1 = '   ';
    delete next.ownership.declarationAccepted;
    expect(diffDraft(saved, next)).toEqual({ vehicle: { model: null }, answers: { completeness: null }, ownership: { declarationAccepted: null }, pickupAddress: { line1: null } });
  });

  it('treats "empty" the same whether it is blank, missing or undefined, so typing and deleting does not look like a change', () => {
    const saved = emptyDraft();
    const next = emptyDraft();
    next.vehicle.make = '';
    expect(diffDraft(saved, next)).toBeNull();
  });

  it('builds the editing state from the server draft without sharing its objects', () => {
    const server = { vehicle: { make: 'Hyundai' }, answers: { a: true } };
    const local = draftFromServer(server as Partial<DraftState>);
    local.vehicle.make = 'Changed';
    expect(server.vehicle.make).toBe('Hyundai');
    expect(draftFromServer(undefined)).toEqual(emptyDraft());
  });
});

describe('errors from the server', () => {
  const rejected = Object.assign(new Error('Enter the odometer reading in km.'), {
    status: 400, code: 'INVALID_INPUT', details: { code: 'INVALID_INPUT', fields: [{ field: 'vehicle.odometerKm', message: 'Enter the odometer reading in km.' }, { field: 'answers.accident_details', message: 'This question needs an answer.' }, { field: 'vehicle.odometerKm', message: 'second' }] },
  });

  it('reads the field problems, keeping the first for each field', () => {
    expect(fieldErrorsFrom(rejected)).toEqual({ 'vehicle.odometerKm': 'Enter the odometer reading in km.', 'answers.accident_details': 'This question needs an answer.' });
    expect(fieldErrorsFrom(new Error('x'))).toEqual({});
    expect(fieldErrorsFrom({ details: { fields: 'nope' } })).toEqual({});
    expect(fieldErrorsFrom(null)).toEqual({});
  });

  it('takes the person to the step a rejected field belongs to', () => {
    expect(stepForField('vehicle.odometerKm', definition)).toBe('VEHICLE');
    expect(stepForField('ownership.declarationAccepted', definition)).toBe('OWNERSHIP');
    expect(stepForField('pickupAddress.pincode', definition)).toBe('PICKUP');
    expect(stepForField('documents', definition)).toBe('PHOTOS');
    expect(stepForField('answers.overall_condition', definition)).toBe('CONDITION');
    expect(stepForField('answers.towing_details', definition)).toBe('CONDITION'); // an ACCESS question
    expect(stepForField('answers.accident_details', definition)).toBe('DAMAGE');
    expect(stepForField('answers.hv_battery_damaged', definition)).toBe('DAMAGE');
    expect(stepForField('something', definition)).toBe('REVIEW');
  });

  it('uses plain wording for known problems, and the server\'s own words for the rest', () => {
    expect(scrapErrorMessage({ code: 'SCRAP_REQUEST_ALREADY_ACTIVE' })).toMatch(/already in progress/);
    expect(scrapErrorMessage({ code: 'CANCELLATION_AFTER_HANDOVER' })).toMatch(/already been collected/);
    expect(scrapErrorMessage({ code: 'NETWORK_UNREACHABLE' })).toMatch(/kept on this phone/);
    expect(scrapErrorMessage(Object.assign(new Error('Your own message'), { code: 'SOMETHING_NEW' }))).toBe('Your own message');
    expect(scrapErrorMessage(Object.assign(new Error('SOMETHING_NEW'), { code: 'SOMETHING_NEW' }))).toBe('Something went wrong. Please try again.');
    expect(scrapErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });

  it('tells "try again, your answers are safe" from "the server said no"', () => {
    expect(isRetryable({ status: 0, code: 'NETWORK_UNREACHABLE' })).toBe(true);
    expect(isRetryable({ status: 503, code: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isRetryable({ status: 0, code: 'REQUEST_TIMEOUT' })).toBe(true);
    expect(isRetryable({ status: 400, code: 'INVALID_INPUT' })).toBe(false);
    expect(isRetryable({ status: 409, code: 'SCRAP_VERSION_CONFLICT' })).toBe(false);
    expect(isRetryable(undefined)).toBe(true); // an unknown failure: keep the answers and let them retry
  });
});

describe('showing a request', () => {
  it('marks what needs the customer\'s attention, and never relies on colour alone', () => {
    expect(customerAction('DRAFT')).toBe('FINISH_DRAFT');
    expect(customerAction('DOCUMENTS_REQUIRED')).toBe('PROVIDE_DOCUMENTS');
    expect(customerAction('OFFER_PENDING_CUSTOMER')).toBe('RESPOND_TO_OFFER');
    expect(customerAction('COLLECTED')).toBeNull();
    expect(statusTone('COMPLETED')).toBe('success');
    expect(statusTone('ON_HOLD')).toBe('warning');
    expect(statusTone('OFFER_PENDING_CUSTOMER')).toBe('info');
    expect(statusTone('CANCELLED')).toBe('neutral');
    expect(statusTone('SALES_REVIEW')).toBe('info');
  });

  it('places every open status on the progress track in order, and closed ones on none', () => {
    const order = ['SUBMITTED', 'SALES_REVIEW', 'ASSESSMENT_PENDING', 'OPERATIONS_REVIEW', 'OFFER_ACCEPTED', 'FACILITY_RECEIVED', 'SCRAPPING_COMPLETED', 'COMPLETED'];
    const stages = order.map(status => progressStage(status));
    expect(stages).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stages.every(stage => stage! < PROGRESS_STAGES.length)).toBe(true);
    for (const closed of ['DRAFT', 'ON_HOLD', 'REJECTED', 'CANCELLED']) expect(progressStage(closed)).toBeNull();
  });

  it('formats money from whole paise without rounding, and says nothing when there is no figure', () => {
    expect(formatPaiseRange('1620000', '1980000')).toBe('₹16,200 to ₹19,800');
    expect(formatPaiseRange('500000', '500000')).toBe('₹5,000');
    expect(formatPaiseRange(null, null)).toBeNull();
    expect(formatPaiseRange('1620000', null)).toBeNull();
    expect(formatPaiseRange('abc', 'def')).toBeNull();
    expect(formatPaise('1500000')).toBe('₹15,000');
    // far beyond what a number can hold exactly: nothing is lost because paise stay as text and BigInt
    expect(formatPaise('99999999999999999999')).toBe('₹9,99,99,99,99,99,99,99,999');
    expect(formatPaise(undefined)).toBeNull();
  });

  it('describes a certificate\'s true state, and never calls a manual check a government verification', () => {
    expect(verificationText('RECEIVED', null)).toMatch(/not checked yet/);
    expect(verificationText('UNDER_REVIEW', null)).toMatch(/Being checked/);
    expect(verificationText('VERIFIED', 'MANUAL_DOCUMENT_REVIEW')).toMatch(/Checked by V MOTIV/);
    for (const state of ['PENDING', 'RECEIVED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DISPUTED']) expect(verificationText(state, 'MANUAL_DOCUMENT_REVIEW')).not.toMatch(/government|official portal|authority/i);
  });
});

describe('autosave with a refused field', () => {
  it('keeps everything the server did not refuse', async () => {
    const { patchWithout } = await import('./scrap-form');
    const patch = { vehicle: { make: 'Hyundai', odometerKm: -5 }, answers: { overall_condition: 'FAIR', accident_details: null }, pickupAddress: { pincode: '12' } };
    expect(patchWithout(patch as never, ['vehicle.odometerKm', 'pickupAddress.pincode'])).toEqual({ vehicle: { make: 'Hyundai' }, answers: { overall_condition: 'FAIR', accident_details: null } });
    expect(patchWithout(patch as never, ['vehicle.odometerKm', 'vehicle.make', 'answers.overall_condition', 'answers.accident_details', 'pickupAddress.pincode'])).toBeNull();
    expect(patchWithout({}, [])).toBeNull();
  });

  it('makes a creation key that is long, different each time, and the same shape', async () => {
    const { newSubmissionKey } = await import('./scrap-form');
    const a = newSubmissionKey();
    const b = newSubmissionKey();
    expect(a).toMatch(/^d[0-9a-z]+-[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8); // the server needs at least 8
    expect(newSubmissionKey(() => 0, 0)).toBe('d0-0000000000000000');
  });
});

describe('tracking what the server holds', () => {
  it('reads a field by its path', async () => {
    const { valueAt } = await import('./scrap-form');
    const draft = complete();
    expect(valueAt(draft, 'vehicle.make')).toBe('Hyundai');
    expect(valueAt(draft, 'answers.overall_condition')).toBe('POOR');
    expect(valueAt(draft, 'pickupAddress.city')).toBe('Bengaluru');
    expect(valueAt(draft, 'vehicle.nothing')).toBeUndefined();
    expect(valueAt(draft, 'nonsense')).toBeUndefined();
  });

  it('lists the fields a patch touches', async () => {
    const { fieldsOfPatch } = await import('./scrap-form');
    expect(fieldsOfPatch({ vehicle: { make: 'x', model: null }, answers: { a: true }, pickupAddress: {} })).toEqual(['vehicle.make', 'vehicle.model', 'answers.a']);
    expect(fieldsOfPatch({})).toEqual([]);
  });

  it('applies a patch the way the server does, without changing the original, and then there is nothing left to send', async () => {
    const { applyDraftPatch } = await import('./scrap-form');
    const before = complete();
    const patch = { vehicle: { model: null, make: 'Tata' }, answers: { completeness: null, overall_condition: 'GOOD' }, ownership: { hasLoan: true } };
    const after = applyDraftPatch(before, patch as never);
    expect(after.vehicle.make).toBe('Tata');
    expect(after.vehicle).not.toHaveProperty('model');
    expect(after.answers).not.toHaveProperty('completeness');
    expect(after.answers.overall_condition).toBe('GOOD');
    expect(after.ownership.hasLoan).toBe(true);
    expect(before.vehicle.make).toBe('Hyundai'); // the original is untouched
    // what the screen holds after those edits equals what the server now holds
    const screen = structuredClone(before);
    screen.vehicle.make = 'Tata'; delete screen.vehicle.model; delete screen.answers.completeness; screen.answers.overall_condition = 'GOOD'; screen.ownership.hasLoan = true;
    expect(diffDraft(after, screen)).toBeNull();
  });
});
