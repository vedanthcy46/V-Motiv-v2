import { describe, expect, it } from 'vitest';
import { permissionCatalog, roleCatalog } from '../src/admin-catalog.js';
import {
  QUESTIONS,
  deriveBlockingFlags,
  normalizeRegistration,
  questionnaireDefinition,
  validateAnswers,
  validateOwnership,
  validatePickupAddress,
  validateVehicle,
  visibleQuestions,
  type Answers,
  type VehicleInput,
} from '../src/scrap/scrap-questionnaire.js';
import { SCRAP_CALCULATION_VERSION, computeIndicativeEstimate, parsePricingPolicy, type ScrapPricingPolicy } from '../src/scrap/scrap-valuation.js';
import { CUSTOMER_STATUS_TEXT, CUSTODY_ACTIONS, EVENT_KINDS, factsFromRecords, type ScrapCaseRecords } from '../src/scrap/scrap-facts.js';
import { SCRAP_PERMISSIONS, SCRAP_STATUSES } from '../src/scrap/scrap-workflow.js';

const car: VehicleInput = { registrationNumber: 'KA 01 AB 1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2010, fuelType: 'PETROL', vehicleCategory: 'PASSENGER_CAR', odometerKm: 180000 };
const ev: VehicleInput = { ...car, fuelType: 'ELECTRIC' };

const baseAnswers: Answers = {
  overall_condition: 'POOR', running_condition: 'DRIVABLE', access_restricted: false, accident_history: false, flood_fire_damage: 'NONE', major_body_damage: false,
  engine_present: true, gearbox_present: true, battery_present: true, wheels_tyres_present: true, completeness: 'COMPLETE',
};

describe('questionnaire: what is asked depends on the answers', () => {
  const keys = (answers: Answers, vehicle = car) => visibleQuestions(answers, vehicle).map(question => question.key);

  it('asks for towing details only when the vehicle cannot be driven', () => {
    expect(keys({ running_condition: 'DRIVABLE' })).not.toContain('towing_details');
    expect(keys({ running_condition: 'NOT_STARTING' })).toContain('towing_details');
    expect(keys({ running_condition: 'STARTS_NOT_DRIVABLE' })).toContain('towing_details');
  });

  it('asks about access, accident, flood/fire and insurance only when relevant', () => {
    expect(keys({ access_restricted: true })).toContain('access_details');
    expect(keys({ access_restricted: false })).not.toContain('access_details');
    expect(keys({ accident_history: true })).toEqual(expect.arrayContaining(['accident_details', 'airbags_deployed', 'insurance_claim']));
    expect(keys({ accident_history: false })).not.toEqual(expect.arrayContaining(['accident_details']));
    expect(keys({ flood_fire_damage: 'FLOOD' })).toContain('flood_fire_safety_notes');
    expect(keys({ flood_fire_damage: 'NONE' })).not.toContain('flood_fire_safety_notes');
  });

  it('asks high-voltage safety questions for an electric vehicle, and the engine and gearbox questions only for the others', () => {
    expect(keys({}, ev)).toEqual(expect.arrayContaining(['hv_battery_present', 'hv_battery_damaged', 'hv_isolation_concern']));
    expect(keys({}, ev)).not.toEqual(expect.arrayContaining(['engine_present']));
    expect(keys({}, car)).toEqual(expect.arrayContaining(['engine_present', 'gearbox_present', 'battery_present']));
    expect(keys({}, car)).not.toContain('hv_battery_present');
  });

  it('never asks a customer to touch, open or dismantle anything', () => {
    for (const question of QUESTIONS) expect(`${question.label} ${question.help ?? ''}`).not.toMatch(/\b(open the|remove the|disconnect|dismantle|take apart)\b/i);
    expect(QUESTIONS.find(question => question.key === 'hv_battery_damaged')!.help).toMatch(/do not open or touch/i);
  });

  it('can be sent as JSON (no functions), so the app and the website draw the same questions', () => {
    const definition = JSON.parse(JSON.stringify(questionnaireDefinition()));
    expect(definition.questions).toHaveLength(QUESTIONS.length);
    expect(definition.vehicleCategories.length).toBeGreaterThan(0);
  });
});

describe('questionnaire: validating answers', () => {
  it('a draft only checks what has been answered; a submission needs every shown question', () => {
    expect(validateAnswers({ overall_condition: 'GOOD' }, car, { complete: false }).errors).toEqual([]);
    const missing = validateAnswers({ overall_condition: 'GOOD' }, car, { complete: true }).errors.map(error => error.field);
    expect(missing).toEqual(expect.arrayContaining(['answers.running_condition', 'answers.completeness', 'answers.engine_present']));
    expect(validateAnswers(baseAnswers, car, { complete: true }).errors).toEqual([]);
  });

  it('requires the details a conditional answer opens up', () => {
    const errors = validateAnswers({ ...baseAnswers, running_condition: 'NOT_STARTING', accident_history: true }, car, { complete: true }).errors.map(error => error.field);
    expect(errors).toEqual(expect.arrayContaining(['answers.towing_details', 'answers.accident_details', 'answers.airbags_deployed', 'answers.insurance_claim']));
  });

  it('refuses wrong types, unknown options and unknown questions', () => {
    const { errors } = validateAnswers({ overall_condition: 'AMAZING', engine_present: 'yes', not_a_question: true } as Answers, car, { complete: false });
    expect(errors.map(error => error.field).sort()).toEqual(['answers.engine_present', 'answers.not_a_question', 'answers.overall_condition']);
  });

  it('drops answers to questions that are no longer shown', () => {
    const { cleaned } = validateAnswers({ ...baseAnswers, accident_history: false, accident_details: 'stale', airbags_deployed: true }, car, { complete: true });
    expect(cleaned).not.toHaveProperty('accident_details');
    expect(cleaned).not.toHaveProperty('airbags_deployed');
  });
});

describe('questionnaire: vehicle, address and ownership', () => {
  it('validates the vehicle: plate shape, years, fuel, category, odometer', () => {
    expect(validateVehicle(car, { complete: true })).toEqual([]);
    const bad = validateVehicle({ ...car, registrationNumber: '12', manufacturingYear: 1900, fuelType: 'STEAM', vehicleCategory: 'SPACESHIP', odometerKm: -1 }, { complete: true }).map(error => error.field);
    expect(bad).toEqual(['vehicle.registrationNumber', 'vehicle.manufacturingYear', 'vehicle.fuelType', 'vehicle.vehicleCategory', 'vehicle.odometerKm']);
    expect(validateVehicle({}, { complete: true }).length).toBe(7);
    expect(validateVehicle({}, { complete: false })).toEqual([]);
    expect(validateVehicle({ ...car, registrationYear: 2000 }, { complete: true })[0]!.field).toBe('vehicle.registrationYear');
  });

  it('treats differently typed plates as one registration', () => {
    expect(normalizeRegistration('ka 01 ab-1234')).toBe('KA01AB1234');
  });

  it('needs a real pickup address with a 6-digit pincode', () => {
    expect(validatePickupAddress({ line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' }, { complete: true })).toEqual([]);
    expect(validatePickupAddress(undefined, { complete: true })).toHaveLength(1);
    expect(validatePickupAddress({ line1: '12 MG Road', city: 'Bengaluru', pincode: '5600' }, { complete: true })[0]!.field).toBe('pickupAddress.pincode');
  });

  it('needs the full ownership declaration, with details where a "yes" calls for them', () => {
    const full = { isRegisteredOwner: true, hasLoan: false, hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true };
    expect(validateOwnership(full, { complete: true })).toEqual([]);
    expect(validateOwnership(undefined, { complete: true })).toHaveLength(1);
    expect(validateOwnership({ ...full, declarationAccepted: false }, { complete: true })[0]!.field).toBe('ownership.declarationAccepted');
    const fields = validateOwnership({ ...full, isRegisteredOwner: false, hasLoan: true, hasPendingDues: true, hasLegalDispute: true }, { complete: true }).map(error => error.field);
    expect(fields).toEqual(['ownership.ownerRelationship', 'ownership.lenderName', 'ownership.duesDetails', 'ownership.disputeDetails']);
  });

  it('a "no" or a concern does not reject the request: it raises a concern for staff to resolve', () => {
    expect(deriveBlockingFlags({}, { isRegisteredOwner: true, hasLoan: false, hasPendingDues: false, hasLegalDispute: false })).toEqual([]);
    expect(deriveBlockingFlags({ insurance_claim: 'TOTAL_LOSS_PENDING' }, { isRegisteredOwner: false, hasLoan: true, hasPendingDues: true, hasLegalDispute: true }))
      .toEqual(['NOT_REGISTERED_OWNER', 'UNDER_FINANCE', 'PENDING_DUES', 'LEGAL_DISPUTE_DECLARED', 'INSURANCE_TOTAL_LOSS_PENDING']);
  });
});

const policy: ScrapPricingPolicy = {
  source: 'Test rate sheet', effectiveFrom: '2026-01-01', materialPricePerKgPaise: { PASSENGER_CAR: 2000, TWO_WHEELER: 1500 }, defaultWeightKg: { PASSENGER_CAR: 900 },
  completenessPermille: { COMPLETE: 1000, MOSTLY: 800, PARTIAL: 500 }, towingCostPaise: 50_000, processingCostPaise: 20_000, rangeSpreadPermille: 100, validDays: 7,
};
const now = new Date('2026-11-16T00:00:00Z');

describe('valuation: no data means "quotation required", never an invented figure', () => {
  const input = { vehicleCategory: 'PASSENGER_CAR', completeness: 'COMPLETE', towingRequired: false };

  it('says quotation required with no policy, no category price, no weight, no completeness or no towing cost', () => {
    expect(computeIndicativeEstimate(input, null, now)).toMatchObject({ status: 'QUOTATION_REQUIRED', reason: expect.stringMatching(/no approved scrap pricing/i) });
    expect(computeIndicativeEstimate({ ...input, vehicleCategory: 'COMMERCIAL_HEAVY' }, policy, now).reason).toMatch(/no approved price/i);
    expect(computeIndicativeEstimate({ ...input, vehicleCategory: 'TWO_WHEELER' }, policy, now).reason).toMatch(/weight is not known/i);
    expect(computeIndicativeEstimate({ ...input, completeness: null }, policy, now).reason).toMatch(/complete/i);
    expect(computeIndicativeEstimate({ ...input, towingRequired: true }, { ...policy, towingCostPaise: undefined }, now).reason).toMatch(/towing/i);
    for (const result of [computeIndicativeEstimate(input, null, now), computeIndicativeEstimate({ ...input, vehicleCategory: 'COMMERCIAL_HEAVY' }, policy, now)]) {
      expect(result.minPaise).toBeUndefined();
      expect(result.maxPaise).toBeUndefined();
    }
  });

  it('computes in whole paise from the policy, records its inputs, version and expiry', () => {
    const result = computeIndicativeEstimate({ ...input, estimatedWeightKg: 1000 }, policy, now);
    // 1000 kg x 2000 paise = 2,000,000; complete = 100%; processing 20,000 -> centre 1,980,000; range +/- 10%
    expect(result).toMatchObject({ status: 'ESTIMATED', calculationVersion: SCRAP_CALCULATION_VERSION, minPaise: 1_782_000n, maxPaise: 2_178_000n });
    expect(result.sourceData).toMatchObject({ weightKg: 1000, weightBasis: 'CUSTOMER_ESTIMATE', pricePerKgPaise: 2000, policy: { source: 'Test rate sheet', effectiveFrom: '2026-01-01' } });
    expect(result.expiresAt).toEqual(new Date('2026-11-23T00:00:00Z'));
    expect(result.adjustments.map(adjustment => adjustment.label)).toEqual([expect.stringMatching(/Material value/), expect.stringMatching(/Completeness/), 'Processing']);
  });

  it('prefers a measured weight over the customer estimate over the category default, and applies completeness and towing', () => {
    expect(computeIndicativeEstimate({ ...input, measuredWeightKg: 800, estimatedWeightKg: 1000 }, policy, now).sourceData).toMatchObject({ weightKg: 800, weightBasis: 'MEASURED' });
    expect(computeIndicativeEstimate(input, policy, now).sourceData).toMatchObject({ weightKg: 900, weightBasis: 'CATEGORY_DEFAULT' });
    // 900 kg x 2000 = 1,800,000; partial 50% = 900,000; towing 50,000 and processing 20,000 -> 830,000
    const partial = computeIndicativeEstimate({ ...input, completeness: 'PARTIAL', towingRequired: true }, policy, now);
    expect(partial.minPaise).toBe((830_000n * 900n) / 1000n);
    expect(partial.maxPaise).toBe((830_000n * 1100n) / 1000n);
  });

  it('never goes below zero when costs exceed the material value', () => {
    const cheap = { ...policy, materialPricePerKgPaise: { PASSENGER_CAR: 1 }, defaultWeightKg: { PASSENGER_CAR: 10 } };
    expect(computeIndicativeEstimate({ ...input, towingRequired: true }, cheap, now)).toMatchObject({ status: 'ESTIMATED', minPaise: 0n, maxPaise: 0n });
  });

  it('reads the stored policy defensively: anything malformed is "no policy"', () => {
    expect(parsePricingPolicy(policy)).toEqual(policy);
    for (const bad of [null, 'x', {}, { ...policy, materialPricePerKgPaise: {} }, { ...policy, materialPricePerKgPaise: { PASSENGER_CAR: 12.5 } }, { ...policy, completenessPermille: { COMPLETE: 1000 } }, { ...policy, rangeSpreadPermille: 5000 }, { ...policy, validDays: 0 }, { ...policy, towingCostPaise: -1 }]) {
      expect(parsePricingPolicy(bad)).toBeNull();
    }
  });
});

describe('facts are worked out from records, never from a status string', () => {
  const baseRecords = (): ScrapCaseRecords => ({
    request: { status: 'OFFER_ACCEPTED', holdFromStatus: null, blockingFlags: [], ownershipDeclaredAt: now, city: 'Bengaluru', paymentState: 'NOT_STARTED', registrationStatus: 'NOT_STARTED' },
    vehicleCategory: 'PASSENGER_CAR', partner: null, documents: [], assessment: null, quotes: [], offer: null, pickup: null, custodyEvents: [], certificates: [], obligations: [], disputes: [], events: [],
  });
  const partner = { status: 'ACTIVE' as const, approvedCategories: ['PASSENGER_CAR'], serviceAreas: ['bengaluru'], registrationValidUntil: new Date('2027-01-01') };

  it('a case far along has none of the evidence that status would suggest, unless it is really there', () => {
    const facts = factsFromRecords({ ...baseRecords(), request: { ...baseRecords().request, status: 'SCRAPPING_COMPLETED' } }, now);
    expect(facts.scrappingCertificate).toBeNull();
    expect(facts.depositCertificate).toBeNull();
    expect(facts.collectionRecorded).toBe(false);
    expect(facts.facilityReceiptRecorded).toBe(false);
  });

  it('documents: accepted only when at least one exists and every one is accepted; open requests are counted', () => {
    expect(factsFromRecords(baseRecords(), now).requiredDocumentsAccepted).toBe(false);
    const accepted = factsFromRecords({ ...baseRecords(), documents: [{ status: 'ACCEPTED' }, { status: 'ACCEPTED' }, { status: 'EXPIRED' }] }, now);
    expect(accepted).toMatchObject({ requiredDocumentsAccepted: true, openDocumentRequests: false, requiredDocumentsSubmitted: true });
    const open = factsFromRecords({ ...baseRecords(), documents: [{ status: 'ACCEPTED' }, { status: 'REQUESTED' }] }, now);
    expect(open).toMatchObject({ requiredDocumentsAccepted: false, openDocumentRequests: true, requiredDocumentsSubmitted: false });
    expect(factsFromRecords({ ...baseRecords(), documents: [{ status: 'REJECTED' }] }, now).openDocumentRequests).toBe(true);
  });

  it('partner: usable only when active, in the category and area, with a recorded registration that has not expired', () => {
    expect(factsFromRecords({ ...baseRecords(), partner }, now).partner).toEqual({ status: 'ACTIVE', coversCategory: true, coversArea: true, registrationValid: true });
    expect(factsFromRecords({ ...baseRecords(), partner: { ...partner, registrationValidUntil: null } }, now).partner!.registrationValid).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), partner: { ...partner, registrationValidUntil: new Date('2026-01-01') } }, now).partner!.registrationValid).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), partner: { ...partner, approvedCategories: ['TWO_WHEELER'] } }, now).partner!.coversCategory).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), partner: { ...partner, serviceAreas: [] } }, now).partner!.coversArea).toBe(false);
  });

  it('quotation and offer: an expired quotation does not count; an offer is "sent", "expired" or "decided" only by its own records', () => {
    expect(factsFromRecords({ ...baseRecords(), quotes: [{ status: 'VERIFIED', validUntil: new Date('2026-12-01') }] }, now).verifiedQuoteValid).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), quotes: [{ status: 'VERIFIED', validUntil: new Date('2026-11-01') }] }, now).verifiedQuoteValid).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), quotes: [{ status: 'RECEIVED', validUntil: new Date('2026-12-01') }] }, now).verifiedQuoteValid).toBe(false);

    const sent = { status: 'SENT_TO_CUSTOMER' as const, approvedAt: now, sentAt: now, expiresAt: new Date('2026-11-20'), decision: null };
    expect(factsFromRecords({ ...baseRecords(), offer: sent }, now)).toMatchObject({ offerApproved: true, offerSent: true, offerExpired: false, offerAcceptedByCustomer: false });
    expect(factsFromRecords({ ...baseRecords(), offer: { ...sent, expiresAt: new Date('2026-11-10') } }, now).offerExpired).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), offer: { ...sent, status: 'ACCEPTED', decision: 'ACCEPTED' } }, now).offerAcceptedByCustomer).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), offer: { ...sent, status: 'WITHDRAWN' } }, now).requoteRequested).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), offer: { ...sent, status: 'DRAFT', sentAt: null, approvedAt: null } }, now)).toMatchObject({ offerSent: false, offerApproved: false });
  });

  it('collection needs a custody record AND the vehicle matched; pickup status alone is not collection', () => {
    const pickup = { status: 'COLLECTED' as const, customerConfirmedAt: now, identityMatched: true };
    expect(factsFromRecords({ ...baseRecords(), pickup }, now).collectionRecorded).toBe(false);
    const event = { action: CUSTODY_ACTIONS.pickupCollected, toCustodianType: 'TRANSPORT' as const };
    expect(factsFromRecords({ ...baseRecords(), pickup, custodyEvents: [event] }, now).collectionRecorded).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), pickup: { ...pickup, identityMatched: false }, custodyEvents: [event] }, now).collectionRecorded).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), pickup: { ...pickup, identityMatched: null }, custodyEvents: [event] }, now).collectionRecorded).toBe(false);
  });

  it('facility receipt is its own record, by the facility, and is not implied by pickup', () => {
    expect(factsFromRecords({ ...baseRecords(), custodyEvents: [{ action: CUSTODY_ACTIONS.pickupCollected, toCustodianType: 'TRANSPORT' }] }, now).facilityReceiptRecorded).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), custodyEvents: [{ action: CUSTODY_ACTIONS.facilityReceived, toCustodianType: 'FACILITY' }] }, now).facilityReceiptRecorded).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), custodyEvents: [{ action: CUSTODY_ACTIONS.facilityReceived, toCustodianType: 'VMOTIV' }] }, now).facilityReceiptRecorded).toBe(false);
  });

  it('certificates: one verified record counts; otherwise the furthest honest state is reported', () => {
    const cert = (verificationState: any) => ({ type: 'CERTIFICATE_OF_DEPOSIT' as const, verificationState });
    expect(factsFromRecords({ ...baseRecords(), certificates: [cert('REJECTED'), cert('VERIFIED')] }, now).depositCertificate).toBe('VERIFIED');
    expect(factsFromRecords({ ...baseRecords(), certificates: [cert('RECEIVED'), cert('UNDER_REVIEW')] }, now).depositCertificate).toBe('UNDER_REVIEW');
    expect(factsFromRecords({ ...baseRecords(), certificates: [cert('RECEIVED')] }, now).scrappingCertificate).toBeNull();
  });

  it('a lead is qualified only while the latest qualification event says so', () => {
    const event = (evidenceKind: string | null) => ({ evidenceKind });
    expect(factsFromRecords({ ...baseRecords(), events: [] }, now).qualifiedBySales).toBe(false);
    expect(factsFromRecords({ ...baseRecords(), events: [event(EVENT_KINDS.leadQualified)] }, now).qualifiedBySales).toBe(true);
    expect(factsFromRecords({ ...baseRecords(), events: [event(EVENT_KINDS.leadQualified), event(null), event(EVENT_KINDS.leadQualificationRevoked)] }, now).qualifiedBySales).toBe(false);
  });

  it('disputes: any open dispute is open; only discrepancy categories are a material discrepancy', () => {
    expect(factsFromRecords({ ...baseRecords(), disputes: [{ status: 'OPEN', category: 'OTHER' }] }, now)).toMatchObject({ openDispute: true, materialDiscrepancyOpen: false });
    expect(factsFromRecords({ ...baseRecords(), disputes: [{ status: 'UNDER_REVIEW', category: 'OFFER_DISCREPANCY' }] }, now)).toMatchObject({ openDispute: true, materialDiscrepancyOpen: true });
    expect(factsFromRecords({ ...baseRecords(), disputes: [{ status: 'RESOLVED', category: 'OFFER_DISCREPANCY' }] }, now)).toMatchObject({ openDispute: false, materialDiscrepancyOpen: false });
  });

  it('customers read plain text for every status, and never a claim a case has not earned', () => {
    for (const status of SCRAP_STATUSES) expect(CUSTOMER_STATUS_TEXT[status].label.length).toBeGreaterThan(2);
    expect(CUSTOMER_STATUS_TEXT.FACILITY_RECEIVED.description).toMatch(/not complete yet/i);
    expect(CUSTOMER_STATUS_TEXT.COLLECTED.description).not.toMatch(/scrapped/i);
  });
});

describe('permissions are registered in the existing role system', () => {
  it('every scrapping permission key exists in the permission catalogue', () => {
    for (const key of Object.values(SCRAP_PERMISSIONS)) expect(Object.keys(permissionCatalog), key).toContain(key);
  });

  it('only existing roles are granted them, and sales holds none of the verification, custody, approval or payment keys', () => {
    const sales = roleCatalog.SALES_EXECUTIVE.permissions.filter(key => key.startsWith('scrap.'));
    expect(sales).toEqual(['scrap.request.read', 'scrap.lead.qualify', 'scrap.documents.review', 'scrap.case.cancel']);
    const forbidden = ['scrap.certificate.verify', 'scrap.registration.verify', 'scrap.custody.record', 'scrap.offer.approve', 'scrap.offer.send', 'scrap.quote.verify', 'scrap.partner.assign', 'scrap.pickup.schedule', 'scrap.assessment.review'];
    for (const key of forbidden) expect(sales).not.toContain(key);
  });

  it('administrators can only look; inspectors hold no scrapping keys yet', () => {
    expect(roleCatalog.ADMIN.permissions.filter(key => key.startsWith('scrap.'))).toEqual(['scrap.request.read']);
    expect(roleCatalog.INSPECTOR.permissions.filter(key => key.startsWith('scrap.'))).toEqual([]);
    expect(roleCatalog.PRICING_APPROVER.permissions).toContain('scrap.offer.approve');
    expect(roleCatalog.OPERATIONS_MANAGER.permissions).not.toContain('scrap.offer.approve');
  });
});
