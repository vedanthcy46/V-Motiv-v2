import { describe, expect, it } from 'vitest';
import {
  SCRAP_PERMISSIONS as P,
  SCRAP_STATUSES,
  TERMINAL_STATUSES,
  availableTransitions,
  cancellationAllowed,
  emptyFacts,
  evaluateTransition,
  isLiveRequestStatus,
  reachableStatuses,
  type ScrapActor,
  type ScrapCaseFacts,
  type ScrapStatus,
} from '../src/scrap/scrap-workflow.js';

const customer: ScrapActor = { kind: 'CUSTOMER' };
const system: ScrapActor = { kind: 'SYSTEM' };
const partner: ScrapActor = { kind: 'PARTNER' };
const staff = (...permissions: string[]): ScrapActor => ({ kind: 'STAFF', permissions });
const allStaff = staff(...Object.values(P));

const activePartner = { status: 'ACTIVE' as const, coversCategory: true, coversArea: true, registrationValid: true };
const ok = (from: ScrapStatus, to: ScrapStatus, actor: ScrapActor, facts: Partial<ScrapCaseFacts> = {}, reason?: string) =>
  evaluateTransition({ from, to, actor, facts: emptyFacts(facts), reason });
const code = (result: ReturnType<typeof ok>) => (result.ok ? null : result.code);

describe('the scrapping state machine: structure', () => {
  it('closed cases cannot change, whoever asks', () => {
    for (const status of TERMINAL_STATUSES) {
      for (const to of SCRAP_STATUSES) expect(code(ok(status, to, allStaff, {}, 'x'))).toBe(status === to ? 'CASE_CLOSED' : 'CASE_CLOSED');
      expect(availableTransitions(status, allStaff, emptyFacts())).toEqual([]);
    }
  });

  it('every in-progress status can be reached from a new draft, and every case can end', () => {
    const reachable = reachableStatuses('DRAFT', emptyFacts());
    for (const status of SCRAP_STATUSES) if (status !== 'DRAFT') expect(reachable.has(status), `${status} is unreachable`).toBe(true);
  });

  it('there are no shortcuts: a status cannot be skipped', () => {
    expect(code(ok('SUBMITTED', 'COMPLETED', allStaff))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('SALES_REVIEW', 'COLLECTED', allStaff))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('COLLECTED', 'SCRAPPING_COMPLETED', allStaff))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('OPERATIONS_REVIEW', 'OFFER_ACCEPTED', allStaff))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('SCRAPPING_IN_PROGRESS', 'COMPLETED', allStaff))).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('a case that is already in a status cannot "move" to it', () => {
    expect(code(ok('SALES_REVIEW', 'SALES_REVIEW', allStaff))).toBe('NO_CHANGE');
  });

  it('only a live, submitted case counts for the one-request-per-vehicle rule', () => {
    expect(isLiveRequestStatus('DRAFT')).toBe(false);
    expect(isLiveRequestStatus('SALES_REVIEW')).toBe(true);
    expect(isLiveRequestStatus('ON_HOLD')).toBe(true);
    for (const status of TERMINAL_STATUSES) expect(isLiveRequestStatus(status)).toBe(false);
  });
});

describe('intake and sales', () => {
  it('a customer cannot submit without the ownership declaration', () => {
    expect(code(ok('DRAFT', 'SUBMITTED', customer))).toBe('OWNERSHIP_DECLARATION_REQUIRED');
    expect(ok('DRAFT', 'SUBMITTED', customer, { ownershipDeclared: true })).toEqual({ ok: true });
  });

  it('only the customer submits; staff and the system cannot submit for them', () => {
    expect(code(ok('DRAFT', 'SUBMITTED', allStaff, { ownershipDeclared: true }))).toBe('NOT_PERMITTED');
    expect(code(ok('DRAFT', 'SUBMITTED', system, { ownershipDeclared: true }))).toBe('NOT_PERMITTED');
  });

  it('a lead cannot go to assessment until it is qualified, declared, and nothing blocks it', () => {
    const sales = staff(P.qualifyLead);
    expect(code(ok('SALES_REVIEW', 'ASSESSMENT_PENDING', sales, { ownershipDeclared: true }))).toBe('LEAD_NOT_QUALIFIED');
    expect(code(ok('SALES_REVIEW', 'ASSESSMENT_PENDING', sales, { qualifiedBySales: true }))).toBe('OWNERSHIP_DECLARATION_REQUIRED');
    expect(code(ok('SALES_REVIEW', 'ASSESSMENT_PENDING', sales, { qualifiedBySales: true, ownershipDeclared: true, blockingFlags: ['STOLEN_VEHICLE_CONCERN'] }))).toBe('CASE_BLOCKED');
    expect(code(ok('SALES_REVIEW', 'ASSESSMENT_PENDING', sales, { qualifiedBySales: true, ownershipDeclared: true, openDocumentRequests: true }))).toBe('DOCUMENTS_OUTSTANDING');
    expect(ok('SALES_REVIEW', 'ASSESSMENT_PENDING', sales, { qualifiedBySales: true, ownershipDeclared: true })).toEqual({ ok: true });
  });

  it('asking for documents needs a document to be requested, and the loop returns to review only once they are in', () => {
    const reviewer = staff(P.reviewDocuments);
    expect(code(ok('SALES_REVIEW', 'DOCUMENTS_REQUIRED', reviewer))).toBe('NO_DOCUMENTS_REQUESTED');
    expect(ok('SALES_REVIEW', 'DOCUMENTS_REQUIRED', reviewer, { openDocumentRequests: true })).toEqual({ ok: true });
    // the system may move it back by itself, but only once the customer has actually submitted what was asked for
    expect(code(ok('DOCUMENTS_REQUIRED', 'SALES_REVIEW', system))).toBe('DOCUMENTS_NOT_SUBMITTED');
    expect(ok('DOCUMENTS_REQUIRED', 'SALES_REVIEW', system, { requiredDocumentsSubmitted: true })).toEqual({ ok: true });
  });
});

describe('segregation of duties', () => {
  it('sales cannot do anything that belongs to operations, inspection review, custody, certificates or finance', () => {
    const sales = staff(P.qualifyLead);
    expect(code(ok('ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW', sales, { assessmentApproved: true }))).toBe('NOT_PERMITTED');
    expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', sales, { partner: activePartner }))).toBe('NOT_PERMITTED');
    expect(code(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', sales, { partner: activePartner, verifiedQuoteValid: true, offerApproved: true, offerSent: true }))).toBe('NOT_PERMITTED');
    expect(code(ok('COLLECTION_SCHEDULED', 'COLLECTED', sales, { collectionRecorded: true }))).toBe('NOT_PERMITTED');
    expect(code(ok('FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED', sales, { depositCertificate: 'VERIFIED' }))).toBe('NOT_PERMITTED');
    expect(code(ok('SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', sales, { depositCertificate: 'VERIFIED', scrappingCertificate: 'VERIFIED' }))).toBe('NOT_PERMITTED');
    expect(code(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', sales, { registrationStatus: 'VERIFIED', paymentState: 'PAID_VERIFIED' }))).toBe('NOT_PERMITTED');
  });

  it('an inspector-style actor with no scrap permissions can move nothing', () => {
    const nobody = staff();
    for (const from of SCRAP_STATUSES) {
      for (const to of SCRAP_STATUSES) {
        const result = ok(from, to, nobody, { ownershipDeclared: true }, 'x');
        if (result.ok) throw new Error(`${from} -> ${to} was allowed with no permissions`);
      }
    }
  });

  it('the customer can only submit, accept or reject an offer, and cancel before handover', () => {
    const facts = emptyFacts({ ownershipDeclared: true, offerSent: true, offerAcceptedByCustomer: true, offerRejectedByCustomer: true, partner: activePartner });
    const allowed: Array<[ScrapStatus, ScrapStatus]> = [];
    for (const from of SCRAP_STATUSES) for (const to of SCRAP_STATUSES) if (evaluateTransition({ from, to, actor: customer, facts, reason: 'x' }).ok) allowed.push([from, to]);
    expect(allowed.filter(([, to]) => to !== 'CANCELLED')).toEqual([['DRAFT', 'SUBMITTED'], ['OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED'], ['OFFER_PENDING_CUSTOMER', 'REJECTED']]);
    expect(allowed.filter(([, to]) => to === 'CANCELLED').every(([from]) => cancellationAllowed(from))).toBe(true);
  });
});

describe('assessment, partner, quotation and offer', () => {
  const ops = staff(P.reviewAssessment, P.assignPartner, P.sendOffer);

  it('an assessment moves the case only once it is submitted, then approved; a reinspection sends it back', () => {
    expect(code(ok('ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', system))).toBe('ASSESSMENT_NOT_SUBMITTED'); // the system moves it only on a submitted assessment
    expect(code(ok('ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', ops))).toBe('ASSESSMENT_NOT_SUBMITTED');
    expect(ok('ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', ops, { assessmentSubmitted: true })).toEqual({ ok: true });
    expect(code(ok('ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW', ops, { assessmentSubmitted: true }))).toBe('ASSESSMENT_NOT_APPROVED');
    expect(code(ok('ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW', ops, { assessmentApproved: true, reinspectionRequested: true }))).toBe('REINSPECTION_REQUESTED');
    expect(ok('ASSESSMENT_COMPLETED', 'ASSESSMENT_PENDING', ops, { reinspectionRequested: true })).toEqual({ ok: true });
    expect(code(ok('ASSESSMENT_COMPLETED', 'ASSESSMENT_PENDING', ops))).toBe('REINSPECTION_NOT_REQUESTED');
  });

  it('only an active, verified, registered partner that covers the vehicle can be given the case', () => {
    expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops))).toBe('PARTNER_NOT_ASSIGNED');
    for (const status of ['PENDING_VERIFICATION', 'SUSPENDED', 'DEREGISTERED'] as const) {
      expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops, { partner: { ...activePartner, status } }))).toBe('PARTNER_NOT_ACTIVE');
    }
    expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops, { partner: { ...activePartner, registrationValid: false } }))).toBe('PARTNER_REGISTRATION_NOT_VALID');
    expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops, { partner: { ...activePartner, coversCategory: false } }))).toBe('PARTNER_CATEGORY_NOT_APPROVED');
    expect(code(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops, { partner: { ...activePartner, coversArea: false } }))).toBe('PARTNER_AREA_NOT_COVERED');
    expect(ok('OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', ops, { partner: activePartner })).toEqual({ ok: true });
  });

  it('an offer reaches the customer only with a verified unexpired quotation, internal approval, and actually sent', () => {
    const base = { partner: activePartner };
    expect(code(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', ops, base))).toBe('QUOTATION_NOT_VERIFIED');
    expect(code(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', ops, { ...base, verifiedQuoteValid: true }))).toBe('OFFER_NOT_APPROVED');
    expect(code(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', ops, { ...base, verifiedQuoteValid: true, offerApproved: true }))).toBe('OFFER_NOT_SENT');
    expect(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', ops, { ...base, verifiedQuoteValid: true, offerApproved: true, offerSent: true })).toEqual({ ok: true });
    // a partner suspended while the quotation was pending stops the offer
    expect(code(ok('PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', ops, { partner: { ...activePartner, status: 'SUSPENDED' }, verifiedQuoteValid: true, offerApproved: true, offerSent: true }))).toBe('PARTNER_NOT_ACTIVE');
  });

  it('the customer accepts only an unexpired offer they actually accepted; an expired or rejected offer goes to requote or ends', () => {
    expect(code(ok('OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', customer))).toBe('OFFER_NOT_ACCEPTED');
    expect(code(ok('OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', customer, { offerAcceptedByCustomer: true, offerExpired: true }))).toBe('OFFER_EXPIRED');
    expect(ok('OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', customer, { offerAcceptedByCustomer: true })).toEqual({ ok: true });
    expect(ok('OFFER_PENDING_CUSTOMER', 'PARTNER_QUOTE_PENDING', system, { offerExpired: true })).toEqual({ ok: true }); // an expired offer goes back for a new quotation by itself
    expect(code(ok('OFFER_PENDING_CUSTOMER', 'PARTNER_QUOTE_PENDING', system))).toBe('REQUOTE_NOT_NEEDED');
    expect(ok('OFFER_PENDING_CUSTOMER', 'PARTNER_QUOTE_PENDING', ops, { offerExpired: true })).toEqual({ ok: true });
    expect(code(ok('OFFER_PENDING_CUSTOMER', 'PARTNER_QUOTE_PENDING', ops))).toBe('REQUOTE_NOT_NEEDED');
    expect(code(ok('OFFER_PENDING_CUSTOMER', 'REJECTED', customer))).toBe('OFFER_NOT_REJECTED');
    expect(ok('OFFER_PENDING_CUSTOMER', 'REJECTED', customer, { offerRejectedByCustomer: true })).toEqual({ ok: true });
  });
});

describe('collection guards', () => {
  const scheduler = staff(P.schedulePickup);
  const ready: Partial<ScrapCaseFacts> = { partner: activePartner, requiredDocumentsAccepted: true, paymentObligationRecorded: true, pickupScheduled: true, pickupCustomerConfirmed: true };

  it('collection cannot be scheduled until every approval is in place', () => {
    expect(ok('OFFER_ACCEPTED', 'COLLECTION_SCHEDULED', scheduler, ready)).toEqual({ ok: true });
    const missing: Array<[Partial<ScrapCaseFacts>, string]> = [
      [{ partner: null }, 'PARTNER_NOT_ASSIGNED'],
      [{ partner: { ...activePartner, status: 'SUSPENDED' } }, 'PARTNER_NOT_ACTIVE'],
      [{ requiredDocumentsAccepted: false }, 'DOCUMENTS_NOT_ACCEPTED'],
      [{ paymentObligationRecorded: false }, 'PAYMENT_OBLIGATION_MISSING'],
      [{ pickupScheduled: false }, 'PICKUP_NOT_SCHEDULED'],
      [{ pickupCustomerConfirmed: false }, 'PICKUP_NOT_CONFIRMED'],
      [{ blockingFlags: ['LEGAL_RESTRICTION'] }, 'CASE_BLOCKED'],
      [{ materialDiscrepancyOpen: true }, 'DISCREPANCY_OPEN'],
      [{ openDispute: true }, 'DISPUTE_OPEN'],
    ];
    for (const [change, expected] of missing) expect(code(ok('OFFER_ACCEPTED', 'COLLECTION_SCHEDULED', scheduler, { ...ready, ...change })), expected).toBe(expected);
  });

  it('collected needs a recorded, identity-matched collection; a failed pickup returns the case for rescheduling', () => {
    const custody = staff(P.recordCustody);
    expect(code(ok('COLLECTION_SCHEDULED', 'COLLECTED', custody))).toBe('COLLECTION_NOT_RECORDED');
    expect(ok('COLLECTION_SCHEDULED', 'COLLECTED', custody, { collectionRecorded: true })).toEqual({ ok: true });
    expect(code(ok('COLLECTION_SCHEDULED', 'OFFER_ACCEPTED', scheduler))).toBe('PICKUP_DID_NOT_FAIL');
    expect(ok('COLLECTION_SCHEDULED', 'OFFER_ACCEPTED', scheduler, { pickupFailed: true })).toEqual({ ok: true });
  });
});

describe('pickup is not receipt, and receipt is not scrapping', () => {
  const custody = staff(P.recordCustody);
  const certifier = staff(P.verifyCertificate);

  it('facility receipt needs the facility\'s own acknowledgement, which a facility or staff may record', () => {
    expect(code(ok('COLLECTED', 'FACILITY_RECEIVED', custody, { partner: activePartner }))).toBe('FACILITY_RECEIPT_MISSING');
    expect(ok('COLLECTED', 'FACILITY_RECEIVED', custody, { partner: activePartner, facilityReceiptRecorded: true })).toEqual({ ok: true });
    // a facility may record its own receipt (that it acts only on its own cases is enforced where the actor is built)
    expect(ok('COLLECTED', 'FACILITY_RECEIVED', partner, { partner: activePartner, facilityReceiptRecorded: true })).toEqual({ ok: true });
    expect(code(ok('COLLECTED', 'FACILITY_RECEIVED', partner, { partner: { ...activePartner, status: 'SUSPENDED' }, facilityReceiptRecorded: true }))).toBe('PARTNER_NOT_ACTIVE');
  });

  it('a deposit is confirmed only by a verified Certificate of Deposit, never by receipt alone', () => {
    for (const state of [null, 'PENDING', 'RECEIVED', 'UNDER_REVIEW', 'REJECTED', 'DISPUTED'] as const) {
      expect(code(ok('FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED', certifier, { depositCertificate: state }))).toBe('DEPOSIT_CERTIFICATE_NOT_VERIFIED');
    }
    expect(ok('FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED', certifier, { depositCertificate: 'VERIFIED' })).toEqual({ ok: true });
  });

  it('a vehicle is never "scrapped" without a verified Certificate of Vehicle Scrapping, whoever asks', () => {
    for (const state of [null, 'PENDING', 'RECEIVED', 'UNDER_REVIEW', 'REJECTED', 'DISPUTED'] as const) {
      expect(code(ok('SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', allStaff, { depositCertificate: 'VERIFIED', scrappingCertificate: state }))).toBe('SCRAPPING_CERTIFICATE_NOT_VERIFIED');
    }
    expect(code(ok('SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', allStaff, { depositCertificate: 'RECEIVED', scrappingCertificate: 'VERIFIED' }))).toBe('DEPOSIT_CERTIFICATE_NOT_VERIFIED');
    expect(ok('SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', certifier, { depositCertificate: 'VERIFIED', scrappingCertificate: 'VERIFIED' })).toEqual({ ok: true });
    expect(code(ok('SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', system, { depositCertificate: 'VERIFIED', scrappingCertificate: 'VERIFIED' }))).toBe('NOT_PERMITTED');
  });

  it('processing starts only when the facility confirms it', () => {
    expect(code(ok('DEPOSIT_CONFIRMED', 'SCRAPPING_IN_PROGRESS', custody))).toBe('PROCESSING_NOT_STARTED');
    expect(ok('DEPOSIT_CONFIRMED', 'SCRAPPING_IN_PROGRESS', custody, { processingStarted: true })).toEqual({ ok: true });
  });
});

describe('registration follow-up and completion', () => {
  const registrar = staff(P.verifyRegistration);

  it('scrapping completed leads to a registration follow-up, and completion needs verified registration evidence AND a verified payout', () => {
    expect(ok('SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', system)).toEqual({ ok: true });
    expect(ok('SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', registrar)).toEqual({ ok: true });
    expect(code(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { paymentState: 'PAID_VERIFIED' }))).toBe('REGISTRATION_NOT_VERIFIED');
    for (const registrationStatus of ['NOT_STARTED', 'PENDING', 'EVIDENCE_RECEIVED', 'FAILED'] as const) {
      expect(code(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { registrationStatus, paymentState: 'PAID_VERIFIED' }))).toBe('REGISTRATION_NOT_VERIFIED');
    }
    for (const paymentState of ['NOT_STARTED', 'OBLIGATION_RECORDED', 'PARTIALLY_PAID', 'FAILED', 'DISPUTED'] as const) {
      expect(code(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { registrationStatus: 'VERIFIED', paymentState }))).toBe('PAYMENT_NOT_SETTLED');
    }
    expect(code(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { registrationStatus: 'VERIFIED', paymentState: 'PAID_VERIFIED', openDispute: true }))).toBe('DISPUTE_OPEN');
    expect(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { registrationStatus: 'VERIFIED', paymentState: 'PAID_VERIFIED' })).toEqual({ ok: true });
    expect(ok('REGISTRATION_UPDATE_PENDING', 'COMPLETED', registrar, { registrationStatus: 'VERIFIED', paymentState: 'NOT_APPLICABLE' })).toEqual({ ok: true });
  });
});

describe('cancellation, holds and rejection', () => {
  it('a customer or staff may cancel before the vehicle leaves the customer, with a reason', () => {
    for (const from of ['DRAFT', 'SUBMITTED', 'SALES_REVIEW', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', 'COLLECTION_SCHEDULED'] as const) {
      expect(ok(from, 'CANCELLED', customer, {}, 'changed my mind')).toEqual({ ok: true });
      expect(code(ok(from, 'CANCELLED', customer))).toBe('REASON_REQUIRED');
    }
    expect(ok('SALES_REVIEW', 'CANCELLED', staff(P.cancelCase), {}, 'customer unreachable')).toEqual({ ok: true });
  });

  it('after handover a case cannot be cancelled: it needs a dispute or a hold, with a record', () => {
    for (const from of ['COLLECTED', 'FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED', 'SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING'] as const) {
      expect(code(ok(from, 'CANCELLED', allStaff, {}, 'x'))).toBe('CANCELLATION_AFTER_HANDOVER');
      expect(code(ok(from, 'CANCELLED', customer, {}, 'x'))).toBe('CANCELLATION_AFTER_HANDOVER');
      expect(ok(from, 'ON_HOLD', staff(P.holdCase), {}, 'facility refused the vehicle')).toEqual({ ok: true });
    }
  });

  it('a case on hold resumes only to where it was, and not while a dispute or discrepancy is open', () => {
    const holder = staff(P.holdCase);
    const held = { holdFromStatus: 'COLLECTED' as const };
    expect(ok('ON_HOLD', 'COLLECTED', holder, held)).toEqual({ ok: true });
    expect(code(ok('ON_HOLD', 'SALES_REVIEW', holder, held))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('ON_HOLD', 'COLLECTED', holder, { ...held, openDispute: true }))).toBe('DISPUTE_OPEN');
    expect(code(ok('ON_HOLD', 'COLLECTED', holder, { ...held, materialDiscrepancyOpen: true }))).toBe('DISCREPANCY_OPEN');
    expect(code(ok('ON_HOLD', 'COLLECTED', holder, { holdFromStatus: null }))).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('putting a case on hold needs a reason, and a draft or held case cannot be held again', () => {
    expect(code(ok('SALES_REVIEW', 'ON_HOLD', staff(P.holdCase)))).toBe('REASON_REQUIRED');
    expect(code(ok('DRAFT', 'ON_HOLD', allStaff, {}, 'x'))).toBe('TRANSITION_NOT_ALLOWED');
    expect(code(ok('ON_HOLD', 'ON_HOLD', allStaff, {}, 'x'))).toBe('NO_CHANGE');
  });

  it('staff can reject a lead or a case under review only with a reason; the customer cannot reject their own request that way', () => {
    expect(code(ok('SALES_REVIEW', 'REJECTED', staff(P.rejectCase)))).toBe('REASON_REQUIRED');
    expect(ok('OPERATIONS_REVIEW', 'REJECTED', staff(P.rejectCase), {}, 'vehicle not eligible')).toEqual({ ok: true });
    expect(code(ok('SALES_REVIEW', 'REJECTED', customer, {}, 'x'))).toBe('NOT_PERMITTED');
  });
});

describe('what a facility and the system may do', () => {
  const everything = emptyFacts({
    ownershipDeclared: true, qualifiedBySales: true, requiredDocumentsSubmitted: true, requiredDocumentsAccepted: true, assessmentSubmitted: true,
    assessmentApproved: true, partner: activePartner, verifiedQuoteValid: true, offerApproved: true, offerSent: true, offerExpired: true,
    offerAcceptedByCustomer: true, pickupScheduled: true, pickupCustomerConfirmed: true, pickupFailed: true, collectionRecorded: true,
    facilityReceiptRecorded: true, processingStarted: true, depositCertificate: 'VERIFIED', scrappingCertificate: 'VERIFIED',
    paymentObligationRecorded: true, paymentState: 'PAID_VERIFIED', registrationStatus: 'VERIFIED',
  });
  const pairs = (actor: ScrapActor, facts: ScrapCaseFacts) => {
    const allowed: string[] = [];
    for (const from of SCRAP_STATUSES) for (const to of SCRAP_STATUSES) if (evaluateTransition({ from, to, actor, facts, reason: 'x' }).ok) allowed.push(`${from}>${to}`);
    return allowed;
  };

  it('a facility can only confirm that it received the vehicle and started processing, never approve, verify or complete anything', () => {
    expect(pairs(partner, everything)).toEqual(['COLLECTED>FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED>SCRAPPING_IN_PROGRESS']);
  });

  it('the system acts only where evidence settles the move; it cannot approve, verify certificates, send offers or complete a case', () => {
    expect(pairs(system, { ...everything, holdFromStatus: null })).toEqual([
      'SUBMITTED>SALES_REVIEW', 'DOCUMENTS_REQUIRED>SALES_REVIEW', 'ASSESSMENT_PENDING>ASSESSMENT_COMPLETED', 'OFFER_PENDING_CUSTOMER>PARTNER_QUOTE_PENDING',
      'SCRAPPING_COMPLETED>REGISTRATION_UPDATE_PENDING',
      ...SCRAP_STATUSES.filter(status => !TERMINAL_STATUSES.includes(status) && status !== 'DRAFT' && status !== 'ON_HOLD').map(status => `${status}>ON_HOLD`),
    ].sort((a, b) => SCRAP_STATUSES.indexOf(a.split('>')[0] as ScrapStatus) - SCRAP_STATUSES.indexOf(b.split('>')[0] as ScrapStatus) || SCRAP_STATUSES.indexOf(a.split('>')[1] as ScrapStatus) - SCRAP_STATUSES.indexOf(b.split('>')[1] as ScrapStatus)));
  });
});

describe('screens can show what is missing', () => {
  it('lists the moves available to a person and, for each blocked move, what is still missing', () => {
    const moves = availableTransitions('OFFER_ACCEPTED', staff(P.schedulePickup, P.holdCase), emptyFacts({ partner: activePartner, pickupScheduled: true }));
    const collection = moves.find(move => move.to === 'COLLECTION_SCHEDULED');
    expect(collection).toMatchObject({ allowed: false, blockedBy: { code: 'DOCUMENTS_NOT_ACCEPTED' } });
    expect(moves.find(move => move.to === 'ON_HOLD')).toMatchObject({ allowed: true });
    expect(availableTransitions('OFFER_ACCEPTED', staff(), emptyFacts())).toEqual([]);
  });
});
