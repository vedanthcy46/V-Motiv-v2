// The scrapping questionnaire, as data. The API sends this definition to the mobile app and the website so both ask the same questions in
// the same order and neither duplicates the rules; the server then validates the answers against the same definition.
//
// Questions are shown or hidden by simple declarative conditions (never code), so a client can evaluate them too. Nothing here is a legal
// rule: it decides what to ask, and which of the customer's declarations need a person at V MOTIV to look at before the case can go on.

export const QUESTIONNAIRE_VERSION = 1;

export type AnswerValue = string | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

export interface VehicleInput {
  registrationNumber?: string;
  make?: string;
  model?: string;
  variant?: string;
  manufacturingYear?: number;
  registrationYear?: number;
  fuelType?: string;
  vehicleCategory?: string;
  odometerKm?: number;
  vin?: string;
}

export interface PickupAddressInput {
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
}

export interface OwnershipInput {
  isRegisteredOwner?: boolean;
  ownerRelationship?: string;
  hasLoan?: boolean;
  lenderName?: string;
  hasPendingDues?: boolean;
  duesDetails?: string;
  hasLegalDispute?: boolean;
  disputeDetails?: string;
  declarationAccepted?: boolean;
}

/** When a question is shown. All listed parts must hold. */
export type Condition =
  | { answer: string; in: AnswerValue[] }
  | { answer: string; notIn: AnswerValue[] }
  | { vehicle: 'isElectric'; equals: boolean };

export interface Question {
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

export const VEHICLE_CATEGORIES = [
  { value: 'TWO_WHEELER', label: 'Two-wheeler' },
  { value: 'THREE_WHEELER', label: 'Three-wheeler' },
  { value: 'PASSENGER_CAR', label: 'Car' },
  { value: 'COMMERCIAL_LIGHT', label: 'Light commercial vehicle' },
  { value: 'COMMERCIAL_HEAVY', label: 'Heavy commercial vehicle' },
] as const;
export const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'LPG', 'ELECTRIC', 'HYBRID'] as const;

const yesNo = (key: string, label: string, section: Question['section'], extra: Partial<Question> = {}): Question =>
  ({ key, section, label, type: 'boolean', required: true, ...extra });

export const QUESTIONS: Question[] = [
  {
    key: 'overall_condition', section: 'CONDITION', label: 'How would you describe the vehicle overall?', type: 'choice', required: true,
    options: [{ value: 'GOOD', label: 'Good' }, { value: 'FAIR', label: 'Fair' }, { value: 'POOR', label: 'Poor' }, { value: 'NOT_REPAIRABLE', label: 'Not worth repairing' }],
  },
  {
    key: 'running_condition', section: 'CONDITION', label: 'Can the vehicle be driven?', type: 'choice', required: true,
    options: [{ value: 'DRIVABLE', label: 'Yes, it drives' }, { value: 'STARTS_NOT_DRIVABLE', label: 'It starts but cannot be driven' }, { value: 'NOT_STARTING', label: 'It does not start' }],
  },
  {
    key: 'towing_details', section: 'ACCESS', label: 'Tell us about getting the vehicle moved (for example flat tyres, locked wheels, tight space).', type: 'text', required: true, maxLength: 500,
    showIf: [{ answer: 'running_condition', in: ['STARTS_NOT_DRIVABLE', 'NOT_STARTING'] }],
  },
  yesNo('access_restricted', 'Is there any restriction in reaching the vehicle (basement, narrow lane, gated society, permission needed)?', 'ACCESS'),
  {
    key: 'access_details', section: 'ACCESS', label: 'What is the restriction?', type: 'text', required: true, maxLength: 500,
    showIf: [{ answer: 'access_restricted', in: [true] }],
  },
  yesNo('accident_history', 'Has the vehicle been in an accident?', 'DAMAGE'),
  {
    key: 'accident_details', section: 'DAMAGE', label: 'What happened, and which parts were damaged?', type: 'text', required: true, maxLength: 800,
    showIf: [{ answer: 'accident_history', in: [true] }],
  },
  yesNo('airbags_deployed', 'Did any airbag deploy?', 'DAMAGE', { showIf: [{ answer: 'accident_history', in: [true] }] }),
  {
    key: 'flood_fire_damage', section: 'DAMAGE', label: 'Has the vehicle ever been damaged by flood or fire?', type: 'choice', required: true,
    options: [{ value: 'NONE', label: 'No' }, { value: 'FLOOD', label: 'Flood' }, { value: 'FIRE', label: 'Fire' }, { value: 'BOTH', label: 'Both' }],
  },
  {
    key: 'flood_fire_safety_notes', section: 'DAMAGE', label: 'Is there anything unsafe about it now (fuel smell, exposed wiring, damaged battery)?', type: 'text', required: true, maxLength: 800,
    showIf: [{ answer: 'flood_fire_damage', in: ['FLOOD', 'FIRE', 'BOTH'] }],
  },
  {
    key: 'insurance_claim', section: 'DAMAGE', label: 'Is there an insurance claim for this damage?', type: 'choice', required: true,
    options: [{ value: 'NONE', label: 'No claim' }, { value: 'FILED', label: 'Claim filed' }, { value: 'SETTLED', label: 'Claim settled' }, { value: 'TOTAL_LOSS_PENDING', label: 'Declared a total loss, settlement pending' }],
    showIf: [{ answer: 'accident_history', in: [true] }],
  },
  yesNo('major_body_damage', 'Is there major body damage?', 'DAMAGE'),
  yesNo('engine_present', 'Is the engine still in the vehicle?', 'COMPLETENESS', { showIf: [{ vehicle: 'isElectric', equals: false }] }),
  yesNo('gearbox_present', 'Is the gearbox still in the vehicle?', 'COMPLETENESS', { showIf: [{ vehicle: 'isElectric', equals: false }] }),
  yesNo('battery_present', 'Is the battery still in the vehicle?', 'COMPLETENESS', { showIf: [{ vehicle: 'isElectric', equals: false }] }),
  yesNo('wheels_tyres_present', 'Are all wheels and tyres present?', 'COMPLETENESS'),
  {
    key: 'completeness', section: 'COMPLETENESS', label: 'How complete is the vehicle?', type: 'choice', required: true,
    help: 'Complete means no major part has been removed.',
    options: [{ value: 'COMPLETE', label: 'Complete' }, { value: 'MOSTLY', label: 'Mostly complete' }, { value: 'PARTIAL', label: 'Major parts are missing' }],
  },
  // Electric vehicles: high-voltage safety flags. The customer is only asked what they can see; nobody is asked to open the battery.
  yesNo('hv_battery_present', 'Is the high-voltage battery pack still fitted?', 'ELECTRIC', { showIf: [{ vehicle: 'isElectric', equals: true }] }),
  yesNo('hv_battery_damaged', 'Is the high-voltage battery pack or its casing damaged, swollen or leaking?', 'ELECTRIC', {
    help: 'Do not open or touch it. Just tell us what you can see from outside.', showIf: [{ vehicle: 'isElectric', equals: true }],
  }),
  {
    key: 'hv_isolation_concern', section: 'ELECTRIC', label: 'Have there been any warnings, burning smell or shocks that suggest an electrical fault?', type: 'choice', required: true,
    options: [{ value: 'NONE', label: 'None' }, { value: 'SUSPECTED', label: 'Possibly' }, { value: 'CONFIRMED', label: 'Yes' }],
    showIf: [{ vehicle: 'isElectric', equals: true }],
  },
];

const OWNERSHIP_FIELDS = ['isRegisteredOwner', 'ownerRelationship', 'hasLoan', 'lenderName', 'hasPendingDues', 'duesDetails', 'hasLegalDispute', 'disputeDetails', 'declarationAccepted'] as const;

export interface FieldError { field: string; message: string }

export const normalizeRegistration = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
const plausibleRegistration = (normalized: string) => normalized.length >= 6 && normalized.length <= 12 && /[A-Z]/.test(normalized) && /\d/.test(normalized);

export function vehicleIsElectric(vehicle: VehicleInput): boolean {
  return (vehicle.fuelType ?? '').toUpperCase() === 'ELECTRIC';
}

function conditionHolds(condition: Condition, answers: Answers, vehicle: VehicleInput): boolean {
  if ('vehicle' in condition) return vehicleIsElectric(vehicle) === condition.equals;
  const value = answers[condition.answer];
  if (value === undefined || value === null) return false;
  return 'in' in condition ? condition.in.includes(value) : !condition.notIn.includes(value);
}

/** The questions this person should see, given what they have told us so far. Hidden questions are never required and never kept. */
export function visibleQuestions(answers: Answers, vehicle: VehicleInput): Question[] {
  return QUESTIONS.filter(question => (question.showIf ?? []).every(condition => conditionHolds(condition, answers, vehicle)));
}

function checkAnswer(question: Question, value: AnswerValue): string | null {
  if (question.type === 'boolean') return typeof value === 'boolean' ? null : 'Answer yes or no.';
  if (question.type === 'choice') return typeof value === 'string' && question.options!.some(option => option.value === value) ? null : 'Choose one of the options.';
  if (typeof value !== 'string' || !value.trim()) return 'This cannot be empty.';
  if (value.length > (question.maxLength ?? 500)) return `Keep this under ${question.maxLength ?? 500} characters.`;
  return null;
}

/**
 * Checks answers against the questionnaire.
 *  - A draft (`complete: false`): only the answers given are checked, and unknown questions are refused.
 *  - A submission (`complete: true`): every visible required question must be answered.
 * Returns the cleaned answers (hidden questions dropped) and the problems, field by field.
 */
export function validateAnswers(answers: Answers, vehicle: VehicleInput, opts: { complete: boolean }): { cleaned: Answers; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const byKey = new Map(QUESTIONS.map(question => [question.key, question]));
  for (const key of Object.keys(answers)) {
    if (!byKey.has(key)) errors.push({ field: `answers.${key}`, message: 'This is not a question we ask.' });
  }
  const visible = visibleQuestions(answers, vehicle);
  const cleaned: Answers = {};
  for (const question of visible) {
    const value = answers[question.key];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim() && question.type === 'text')) {
      if (opts.complete && question.required) errors.push({ field: `answers.${question.key}`, message: 'This question needs an answer.' });
      continue;
    }
    const problem = checkAnswer(question, value);
    if (problem) errors.push({ field: `answers.${question.key}`, message: problem });
    else cleaned[question.key] = typeof value === 'string' ? value.trim() : value;
  }
  return { cleaned, errors };
}

export function validateVehicle(vehicle: VehicleInput, opts: { complete: boolean }, now = new Date()): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: keyof VehicleInput, ok: boolean, message: string) => {
    const present = vehicle[field] !== undefined && vehicle[field] !== null && vehicle[field] !== '';
    if (!present) { if (opts.complete) errors.push({ field: `vehicle.${field}`, message: 'This is required.' }); return; }
    if (!ok) errors.push({ field: `vehicle.${field}`, message });
  };
  const year = now.getFullYear();
  need('registrationNumber', plausibleRegistration(normalizeRegistration(vehicle.registrationNumber ?? '')), 'Enter the registration number as it is on the plate.');
  need('make', (vehicle.make ?? '').trim().length > 0 && (vehicle.make ?? '').length <= 60, 'Enter the make.');
  need('model', (vehicle.model ?? '').trim().length > 0 && (vehicle.model ?? '').length <= 80, 'Enter the model.');
  need('manufacturingYear', Number.isInteger(vehicle.manufacturingYear) && vehicle.manufacturingYear! >= 1950 && vehicle.manufacturingYear! <= year, `Year must be between 1950 and ${year}.`);
  need('fuelType', (FUEL_TYPES as readonly string[]).includes((vehicle.fuelType ?? '').toUpperCase()), `Fuel must be one of ${FUEL_TYPES.join(', ')}.`);
  need('vehicleCategory', VEHICLE_CATEGORIES.some(category => category.value === vehicle.vehicleCategory), 'Choose the vehicle category.');
  need('odometerKm', Number.isInteger(vehicle.odometerKm) && vehicle.odometerKm! >= 0 && vehicle.odometerKm! <= 3_000_000, 'Enter the odometer reading in km.');
  if (vehicle.registrationYear !== undefined && vehicle.registrationYear !== null) {
    if (!Number.isInteger(vehicle.registrationYear) || vehicle.registrationYear < 1950 || vehicle.registrationYear > year) errors.push({ field: 'vehicle.registrationYear', message: `Year must be between 1950 and ${year}.` });
    else if (vehicle.manufacturingYear && vehicle.registrationYear < vehicle.manufacturingYear - 1) errors.push({ field: 'vehicle.registrationYear', message: 'The registration year cannot be long before the manufacturing year.' });
  }
  return errors;
}

export function validatePickupAddress(address: PickupAddressInput | undefined, opts: { complete: boolean }): FieldError[] {
  const errors: FieldError[] = [];
  if (!address) return opts.complete ? [{ field: 'pickupAddress', message: 'Tell us where the vehicle is.' }] : [];
  const need = (field: keyof PickupAddressInput, ok: boolean, message: string) => {
    const present = typeof address[field] === 'string' && address[field]!.trim() !== '';
    if (!present) { if (opts.complete && field !== 'line2' && field !== 'landmark') errors.push({ field: `pickupAddress.${field}`, message: 'This is required.' }); return; }
    if (!ok) errors.push({ field: `pickupAddress.${field}`, message });
  };
  need('line1', (address.line1 ?? '').trim().length >= 3 && (address.line1 ?? '').length <= 200, 'Enter the address.');
  need('city', (address.city ?? '').trim().length >= 2 && (address.city ?? '').length <= 80, 'Enter the city.');
  need('pincode', /^\d{6}$/.test((address.pincode ?? '').trim()), 'Enter a 6-digit pincode.');
  return errors;
}

/** The ownership declaration. A declaration is what the customer says; it is not proof, and "no" answers are looked at by staff, not refused. */
export function validateOwnership(ownership: OwnershipInput | undefined, opts: { complete: boolean }): FieldError[] {
  const errors: FieldError[] = [];
  if (!ownership) return opts.complete ? [{ field: 'ownership', message: 'The ownership declaration is required.' }] : [];
  for (const key of Object.keys(ownership)) if (!(OWNERSHIP_FIELDS as readonly string[]).includes(key)) errors.push({ field: `ownership.${key}`, message: 'Unknown field.' });
  const requireBool = (field: keyof OwnershipInput) => {
    if (typeof ownership[field] !== 'boolean' && opts.complete) errors.push({ field: `ownership.${field}`, message: 'Answer yes or no.' });
  };
  const requireText = (field: keyof OwnershipInput, when: boolean) => {
    const value = ownership[field];
    if (when && opts.complete && (typeof value !== 'string' || !value.trim())) errors.push({ field: `ownership.${field}`, message: 'Please give details.' });
    if (typeof value === 'string' && value.length > 500) errors.push({ field: `ownership.${field}`, message: 'Keep this under 500 characters.' });
  };
  requireBool('isRegisteredOwner'); requireBool('hasLoan'); requireBool('hasPendingDues'); requireBool('hasLegalDispute');
  requireText('ownerRelationship', ownership.isRegisteredOwner === false);
  requireText('lenderName', ownership.hasLoan === true);
  requireText('duesDetails', ownership.hasPendingDues === true);
  requireText('disputeDetails', ownership.hasLegalDispute === true);
  if (opts.complete && ownership.declarationAccepted !== true) errors.push({ field: 'ownership.declarationAccepted', message: 'You need to confirm the declaration to continue.' });
  return errors;
}

/**
 * Concerns raised by what the customer declared. They do not reject the request: they stop it moving to assessment until a person at V MOTIV
 * has looked at it and recorded how it was resolved. Only a staff member can clear one.
 */
export function deriveBlockingFlags(answers: Answers, ownership: OwnershipInput): string[] {
  const flags: string[] = [];
  if (ownership.isRegisteredOwner === false) flags.push('NOT_REGISTERED_OWNER');
  if (ownership.hasLoan === true) flags.push('UNDER_FINANCE');
  if (ownership.hasPendingDues === true) flags.push('PENDING_DUES');
  if (ownership.hasLegalDispute === true) flags.push('LEGAL_DISPUTE_DECLARED');
  if (answers.insurance_claim === 'TOTAL_LOSS_PENDING') flags.push('INSURANCE_TOTAL_LOSS_PENDING');
  return flags;
}

/** Everything needed to draw the questionnaire, with no functions in it, so it can be sent as JSON. */
export function questionnaireDefinition() {
  return {
    version: QUESTIONNAIRE_VERSION,
    vehicleCategories: VEHICLE_CATEGORIES,
    fuelTypes: FUEL_TYPES,
    questions: QUESTIONS,
    ownershipFields: OWNERSHIP_FIELDS,
  };
}
