// Pure logic for the vehicle-scrapping screens. No React, no network, so it can be tested alone.
//
// The questions, their order and the conditions that show or hide them come from the server (GET /customer/scrap/questionnaire), and the server
// validates every answer again. This file only *interprets* that data (it has no scrapping rules of its own), so the app and the website ask
// the same questions and a change to the questionnaire reaches both without a release.

export type AnswerValue = string | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

export interface VehicleDraft {
  registrationNumber?: string; make?: string; model?: string; variant?: string; manufacturingYear?: number; registrationYear?: number;
  fuelType?: string; vehicleCategory?: string; odometerKm?: number; vin?: string;
}
export interface OwnershipDraft {
  isRegisteredOwner?: boolean; ownerRelationship?: string; hasLoan?: boolean; lenderName?: string; hasPendingDues?: boolean; duesDetails?: string;
  hasLegalDispute?: boolean; disputeDetails?: string; declarationAccepted?: boolean;
}
export interface PickupAddressDraft { line1?: string; line2?: string; landmark?: string; city?: string; pincode?: string }

export interface DraftState {
  vehicle: VehicleDraft;
  answers: Answers;
  ownership: OwnershipDraft;
  pickupAddress: PickupAddressDraft;
}

export type Condition =
  | { answer: string; in: AnswerValue[] }
  | { answer: string; notIn: AnswerValue[] }
  | { vehicle: 'isElectric'; equals: boolean };

export interface QuestionDef {
  key: string;
  section: 'CONDITION' | 'DAMAGE' | 'COMPLETENESS' | 'ELECTRIC' | 'ACCESS';
  label: string;
  help?: string;
  type: 'choice' | 'boolean' | 'text';
  options?: Array<{ value: string; label: string }>;
  required: boolean;
  maxLength?: number;
  showIf?: Condition[];
}

export interface QuestionnaireDefinition {
  version: number;
  vehicleCategories: Array<{ value: string; label: string }>;
  fuelTypes: string[];
  questions: QuestionDef[];
}

export const emptyDraft = (): DraftState => ({ vehicle: {}, answers: {}, ownership: {}, pickupAddress: {} });

export const isElectric = (vehicle: VehicleDraft) => (vehicle.fuelType ?? '').toUpperCase() === 'ELECTRIC';

function holds(condition: Condition, answers: Answers, vehicle: VehicleDraft): boolean {
  if ('vehicle' in condition) return isElectric(vehicle) === condition.equals;
  const value = answers[condition.answer];
  if (value === undefined || value === null) return false;
  return 'in' in condition ? condition.in.includes(value) : !condition.notIn.includes(value);
}

/** The questions to show now, in the server's order. */
export function visibleQuestions(definition: QuestionnaireDefinition, answers: Answers, vehicle: VehicleDraft): QuestionDef[] {
  return definition.questions.filter(question => (question.showIf ?? []).every(condition => holds(condition, answers, vehicle)));
}

/** Answers with those that are no longer relevant removed (for example the accident details after "no accident"). */
export function pruneAnswers(definition: QuestionnaireDefinition, answers: Answers, vehicle: VehicleDraft): Answers {
  const shown = new Set(visibleQuestions(definition, answers, vehicle).map(question => question.key));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => shown.has(key)));
}

// ------------------------------------------------------------------------------------------------------------------------------------
// The wizard
// ------------------------------------------------------------------------------------------------------------------------------------

export type StepId = 'VEHICLE' | 'CONDITION' | 'DAMAGE' | 'PHOTOS' | 'OWNERSHIP' | 'PICKUP' | 'REVIEW';

export const STEPS: Array<{ id: StepId; title: string; subtitle: string }> = [
  { id: 'VEHICLE', title: 'Your vehicle', subtitle: 'Tell us which vehicle you want to scrap.' },
  { id: 'CONDITION', title: 'Condition', subtitle: 'How the vehicle is today.' },
  { id: 'DAMAGE', title: 'Damage and parts', subtitle: 'Damage, missing parts and safety.' },
  { id: 'PHOTOS', title: 'Photos and documents', subtitle: 'What we may ask you for.' },
  { id: 'OWNERSHIP', title: 'Ownership', subtitle: 'Your declaration about the vehicle.' },
  { id: 'PICKUP', title: 'Pickup location', subtitle: 'Where the vehicle is.' },
  { id: 'REVIEW', title: 'Review and submit', subtitle: 'Check everything before you submit.' },
];

/** Which questionnaire sections each wizard step shows. */
export const STEP_SECTIONS: Partial<Record<StepId, QuestionDef['section'][]>> = {
  CONDITION: ['CONDITION', 'ACCESS'],
  DAMAGE: ['DAMAGE', 'COMPLETENESS', 'ELECTRIC'],
};

export const REQUIRED_VEHICLE_FIELDS: Array<keyof VehicleDraft> = ['registrationNumber', 'make', 'model', 'manufacturingYear', 'fuelType', 'vehicleCategory', 'odometerKm'];

export interface StepProblem { field: string; message: string }

const blank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * What is still missing on a step, so Continue can say so before anything is sent. This is only "has it been answered": whether an answer is
 * acceptable is the server's call, and its field errors are shown when they come back.
 */
export function stepProblems(step: StepId, draft: DraftState, definition: QuestionnaireDefinition | null): StepProblem[] {
  const problems: StepProblem[] = [];
  const need = (field: string, value: unknown, message = 'This is needed.') => { if (blank(value)) problems.push({ field, message }); };
  switch (step) {
    case 'VEHICLE':
      for (const field of REQUIRED_VEHICLE_FIELDS) need(`vehicle.${field}`, draft.vehicle[field]);
      break;
    case 'CONDITION':
    case 'DAMAGE': {
      if (!definition) return [{ field: 'questions', message: 'The questions have not loaded yet.' }];
      const sections = STEP_SECTIONS[step]!;
      for (const question of visibleQuestions(definition, draft.answers, draft.vehicle)) {
        if (question.required && sections.includes(question.section)) need(`answers.${question.key}`, draft.answers[question.key], 'Please answer this.');
      }
      break;
    }
    case 'OWNERSHIP': {
      const o = draft.ownership;
      for (const field of ['isRegisteredOwner', 'hasLoan', 'hasPendingDues', 'hasLegalDispute'] as const) need(`ownership.${field}`, o[field], 'Please answer yes or no.');
      if (o.isRegisteredOwner === false) need('ownership.ownerRelationship', o.ownerRelationship, 'Tell us how you are connected to the owner.');
      if (o.hasLoan === true) need('ownership.lenderName', o.lenderName, 'Tell us who the lender is.');
      if (o.hasPendingDues === true) need('ownership.duesDetails', o.duesDetails, 'Tell us what is pending.');
      if (o.hasLegalDispute === true) need('ownership.disputeDetails', o.disputeDetails, 'Tell us about the dispute.');
      if (o.declarationAccepted !== true) problems.push({ field: 'ownership.declarationAccepted', message: 'Please confirm the declaration to continue.' });
      break;
    }
    case 'PICKUP':
      for (const field of ['line1', 'city', 'pincode'] as const) need(`pickupAddress.${field}`, draft.pickupAddress[field]);
      break;
    default:
      break;
  }
  return problems;
}

/** The first step with something missing, or null when the whole request is ready to submit. */
export function firstIncompleteStep(draft: DraftState, definition: QuestionnaireDefinition | null): StepId | null {
  for (const step of STEPS) if (step.id !== 'REVIEW' && step.id !== 'PHOTOS' && stepProblems(step.id, draft, definition).length) return step.id;
  return null;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Saving a draft as the person types
// ------------------------------------------------------------------------------------------------------------------------------------

type Clearable<T> = { [K in keyof T]?: T[K] | null };
export interface DraftPatch { vehicle?: Clearable<VehicleDraft>; answers?: Answers; ownership?: Clearable<OwnershipDraft>; pickupAddress?: Clearable<PickupAddressDraft> }

const sameValue = (a: unknown, b: unknown) => a === b || (blank(a) && blank(b));

/** Only what changed since the last save, so a small edit is a small request. A removed answer is sent as null (the server removes it). */
export function diffDraft(saved: DraftState, current: DraftState): DraftPatch | null {
  const patch: DraftPatch = {};
  const diffObject = <T extends Record<string, unknown>>(before: T, after: T): Partial<T> | null => {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!sameValue(before[key], after[key])) out[key] = blank(after[key]) ? null : after[key];
    }
    return Object.keys(out).length ? (out as Partial<T>) : null;
  };
  const vehicle = diffObject(saved.vehicle as Record<string, unknown>, current.vehicle as Record<string, unknown>);
  const answers = diffObject(saved.answers as Record<string, unknown>, current.answers as Record<string, unknown>);
  const ownership = diffObject(saved.ownership as Record<string, unknown>, current.ownership as Record<string, unknown>);
  const pickupAddress = diffObject(saved.pickupAddress as Record<string, unknown>, current.pickupAddress as Record<string, unknown>);
  // A cleared field is sent as null, which the server treats as "remove it". Leaving it out would keep the old value.
  if (vehicle) patch.vehicle = vehicle as DraftPatch['vehicle'];
  if (answers) patch.answers = answers as Answers;
  if (ownership) patch.ownership = ownership as DraftPatch['ownership'];
  if (pickupAddress) patch.pickupAddress = pickupAddress as DraftPatch['pickupAddress'];
  return Object.keys(patch).length ? patch : null;
}

/** Turns the server's draft payload into the local editing state. */
export function draftFromServer(draft: Partial<DraftState> | undefined): DraftState {
  return { vehicle: { ...(draft?.vehicle ?? {}) }, answers: { ...(draft?.answers ?? {}) }, ownership: { ...(draft?.ownership ?? {}) }, pickupAddress: { ...(draft?.pickupAddress ?? {}) } };
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Errors from the server
// ------------------------------------------------------------------------------------------------------------------------------------

/** The per-input problems the server sent with a 400, keyed by field path (for example "vehicle.odometerKm"). */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const details = error && typeof error === 'object' && 'details' in error ? (error as { details?: unknown }).details : undefined;
  const fields = details && typeof details === 'object' ? (details as { fields?: unknown }).fields : undefined;
  const out: Record<string, string> = {};
  if (Array.isArray(fields)) for (const item of fields) if (item && typeof item.field === 'string' && typeof item.message === 'string' && !(item.field in out)) out[item.field] = item.message;
  return out;
}

/** The step a field path belongs to, so a rejected submit can take the person to the screen that needs fixing. */
export function stepForField(field: string, definition: QuestionnaireDefinition | null): StepId {
  if (field.startsWith('vehicle.')) return 'VEHICLE';
  if (field.startsWith('ownership')) return 'OWNERSHIP';
  if (field.startsWith('pickupAddress')) return 'PICKUP';
  if (field.startsWith('documents')) return 'PHOTOS';
  if (field.startsWith('answers.')) {
    const section = definition?.questions.find(question => question.key === field.slice('answers.'.length))?.section;
    return section === 'CONDITION' || section === 'ACCESS' ? 'CONDITION' : 'DAMAGE';
  }
  return 'REVIEW';
}

const FRIENDLY: Record<string, string> = {
  SCRAP_SCHEMA_NOT_READY: 'Vehicle scrapping is not available yet. Please try again soon.',
  SCRAP_REQUEST_NOT_FOUND: 'We could not find this request.',
  SCRAP_VERSION_CONFLICT: 'This request changed on another device. We have loaded the latest version.',
  SCRAP_NOT_EDITABLE: 'This request has been submitted and can no longer be edited.',
  SCRAP_REQUEST_ALREADY_ACTIVE: 'A request for this vehicle is already in progress.',
  TOO_MANY_DRAFTS: 'You have several unfinished requests. Please finish or delete one first.',
  GARAGE_VEHICLE_NOT_FOUND: 'That vehicle was not found in your garage.',
  OFFER_EXPIRED: 'This offer has expired. We will get a new quotation for you.',
  OFFER_SUPERSEDED: 'This offer has been replaced by a newer one. Please refresh.',
  OFFER_ALREADY_DECIDED: 'You have already responded to this offer.',
  OFFER_NOT_OPEN: 'This offer is not open for a response.',
  CANCELLATION_AFTER_HANDOVER: 'The vehicle has already been collected, so this request cannot simply be cancelled. Please raise a concern and our team will help.',
  CASE_CLOSED: 'This request is already closed.',
  TOO_MANY_OPEN_DISPUTES: 'You already have several open concerns on this request. Our team is working on them.',
  SCRAP_NOT_SUBMITTED: 'There is nothing to raise a concern about until the request is submitted.',
};

/** What to tell the person. Known scrapping errors get plain wording; anything else falls back to the server's own message. */
export function scrapErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (FRIENDLY[code]) return FRIENDLY[code]!;
  if (code === 'NETWORK_UNREACHABLE' || code === 'REQUEST_TIMEOUT') return 'We could not reach V MOTIV. Check your connection and try again. Your answers are kept on this phone.';
  const message = error instanceof Error ? error.message : '';
  return message && message !== code ? message : fallback;
}

/** An error that means "try again later or reconnect" (the answers are still on this phone), as opposed to "the server refused this". */
export function isRetryable(error: unknown): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return status === 0 || status >= 500 || code === 'NETWORK_UNREACHABLE' || code === 'REQUEST_TIMEOUT' || code === 'SERVICE_UNAVAILABLE';
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Showing a request
// ------------------------------------------------------------------------------------------------------------------------------------

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/** The colour family of a status indicator. Meaning is never carried by colour alone: the label always says it too. */
export function statusTone(status: string): Tone {
  if (status === 'COMPLETED') return 'success';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'neutral';
  if (['ON_HOLD', 'DOCUMENTS_REQUIRED'].includes(status)) return 'warning';
  if (status === 'OFFER_PENDING_CUSTOMER') return 'info';
  if (status === 'DRAFT') return 'neutral';
  return 'info';
}

/** What the customer should do now, if anything. */
export function customerAction(status: string): 'FINISH_DRAFT' | 'PROVIDE_DOCUMENTS' | 'RESPOND_TO_OFFER' | null {
  if (status === 'DRAFT') return 'FINISH_DRAFT';
  if (status === 'DOCUMENTS_REQUIRED') return 'PROVIDE_DOCUMENTS';
  if (status === 'OFFER_PENDING_CUSTOMER') return 'RESPOND_TO_OFFER';
  return null;
}

/** The stages shown as a progress track, in order. A status maps to the stage it is part of; closed cases map to none. */
export const PROGRESS_STAGES = ['Submitted', 'In review', 'Inspection', 'Offer', 'Collection', 'Facility', 'Certified', 'Complete'] as const;

export function progressStage(status: string): number | null {
  const map: Record<string, number> = {
    SUBMITTED: 0, SALES_REVIEW: 1, DOCUMENTS_REQUIRED: 1, ASSESSMENT_PENDING: 2, ASSESSMENT_COMPLETED: 2, OPERATIONS_REVIEW: 3, PARTNER_QUOTE_PENDING: 3,
    OFFER_PENDING_CUSTOMER: 3, OFFER_ACCEPTED: 4, COLLECTION_SCHEDULED: 4, COLLECTED: 4, FACILITY_RECEIVED: 5, DEPOSIT_CONFIRMED: 5, SCRAPPING_IN_PROGRESS: 5,
    SCRAPPING_COMPLETED: 6, REGISTRATION_UPDATE_PENDING: 6, COMPLETED: 7,
  };
  return status in map ? map[status]! : null;
}

/** "₹16,200 to ₹19,800", or null when there is no figure (the screen then says a quotation is required). Paise arrive as strings. */
export function formatPaiseRange(minPaise: string | null | undefined, maxPaise: string | null | undefined): string | null {
  if (minPaise === null || minPaise === undefined || maxPaise === null || maxPaise === undefined) return null;
  const rupees = (paise: string) => {
    try { return `₹${(BigInt(paise) / 100n).toLocaleString('en-IN')}`; } catch { return null; }
  };
  const low = rupees(minPaise);
  const high = rupees(maxPaise);
  if (!low || !high) return null;
  return low === high ? low : `${low} to ${high}`;
}

export function formatPaise(paise: string | null | undefined): string | null {
  if (paise === null || paise === undefined) return null;
  try { return `₹${(BigInt(paise) / 100n).toLocaleString('en-IN')}`; } catch { return null; }
}

/** Plain names for the certificates and their true verification state. A manual check is never called a government check. */
export const CERTIFICATE_NAMES: Record<string, string> = {
  CERTIFICATE_OF_DEPOSIT: 'Certificate of Deposit',
  CERTIFICATE_OF_VEHICLE_SCRAPPING: 'Certificate of Vehicle Scrapping',
};

export function verificationText(state: string, method: string | null | undefined): string {
  switch (state) {
    case 'VERIFIED': return method === 'MANUAL_DOCUMENT_REVIEW' ? 'Checked by V MOTIV from the document the facility issued' : 'Verified';
    case 'RECEIVED': return 'Received from the facility, not checked yet';
    case 'UNDER_REVIEW': return 'Being checked by V MOTIV';
    case 'REJECTED': return 'Could not be accepted. We will contact you';
    case 'DISPUTED': return 'Under review because something does not match';
    default: return 'Waiting for the facility to issue it';
  }
}

export const DISPUTE_CATEGORY_LABELS: Array<{ value: string; label: string }> = [
  { value: 'OFFER_DISCREPANCY', label: 'The offer or price is not what I was told' },
  { value: 'VEHICLE_CONDITION_MISMATCH', label: 'The vehicle condition was recorded wrongly' },
  { value: 'VIN_MISMATCH', label: 'My vehicle details were recorded wrongly' },
  { value: 'WRONG_BENEFICIARY', label: 'Payment is for the wrong person or account' },
  { value: 'CERTIFICATE_MISMATCH', label: 'A certificate does not match my vehicle' },
  { value: 'PICKUP_DAMAGE', label: 'Something went wrong at pickup' },
  { value: 'OTHER', label: 'Something else' },
];

/**
 * A patch without the fields the server refused. One invalid answer must not stop the rest of an autosave from being kept, so when a save
 * is rejected the refused fields are taken out, the rest is saved, and the refused ones are shown to the person to fix.
 */
export function patchWithout(patch: DraftPatch, refusedFields: string[]): DraftPatch | null {
  const refused = new Set(refusedFields);
  const out: DraftPatch = {};
  const keep = <T extends Record<string, unknown>>(part: string, values: T | undefined) => {
    if (!values) return undefined;
    const kept = Object.fromEntries(Object.entries(values).filter(([key]) => !refused.has(`${part}.${key}`)));
    return Object.keys(kept).length ? (kept as T) : undefined;
  };
  const vehicle = keep('vehicle', patch.vehicle as Record<string, unknown> | undefined);
  const answers = keep('answers', patch.answers as Record<string, unknown> | undefined);
  const ownership = keep('ownership', patch.ownership as Record<string, unknown> | undefined);
  const pickupAddress = keep('pickupAddress', patch.pickupAddress as Record<string, unknown> | undefined);
  if (vehicle) out.vehicle = vehicle as DraftPatch['vehicle'];
  if (answers) out.answers = answers as Answers;
  if (ownership) out.ownership = ownership as DraftPatch['ownership'];
  if (pickupAddress) out.pickupAddress = pickupAddress as DraftPatch['pickupAddress'];
  return Object.keys(out).length ? out : null;
}

/** A key that makes creating a draft safe to repeat: the same key always returns the same draft. */
export function newSubmissionKey(random: () => number = Math.random, now: number = Date.now()): string {
  const part = () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0');
  return `d${now.toString(36)}-${part()}${part()}`;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Keeping track of what the server has and what it refused
// ------------------------------------------------------------------------------------------------------------------------------------

/** The value at a field path such as "vehicle.make" or "answers.towing_details". */
export function valueAt(draft: DraftState, path: string): unknown {
  const dot = path.indexOf('.');
  if (dot < 0) return undefined;
  const part = path.slice(0, dot) as keyof DraftState;
  const key = path.slice(dot + 1);
  const bag = draft[part] as Record<string, unknown> | undefined;
  return bag ? bag[key] : undefined;
}

/** Every field path a patch sets or clears. */
export function fieldsOfPatch(patch: DraftPatch): string[] {
  const out: string[] = [];
  for (const part of ['vehicle', 'answers', 'ownership', 'pickupAddress'] as const) {
    for (const key of Object.keys(patch[part] ?? {})) out.push(`${part}.${key}`);
  }
  return out;
}

/** What the server's draft becomes after it accepts a patch (a null removes the field), so the app can track what the server holds. */
export function applyDraftPatch(draft: DraftState, patch: DraftPatch): DraftState {
  const next = draftFromServer(draft);
  for (const part of ['vehicle', 'answers', 'ownership', 'pickupAddress'] as const) {
    const bag = next[part] as Record<string, unknown>;
    for (const [key, value] of Object.entries((patch[part] ?? {}) as Record<string, unknown>)) {
      if (value === null) delete bag[key];
      else if (value !== undefined) bag[key] = value;
    }
  }
  return next;
}
