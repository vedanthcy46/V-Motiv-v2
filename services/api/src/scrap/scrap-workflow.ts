// The scrapping case state machine. Pure: it knows nothing about the database or HTTP. The store (a later phase) works out the "facts" below
// from real records and then asks `evaluateTransition` whether a move is allowed. A caller never says "the vehicle is now scrapped"; it
// can only ask for a move, and the move happens only if independent evidence (an approved assessment, a verified quotation, an accepted
// offer, a custody record, a verified official certificate) exists for it.
//
// V MOTIV coordinates the scrapping; it is not the RVSF and not a government service. So no step to SCRAPPING_COMPLETED or COMPLETED is
// possible without an official certificate or registration record that a person has verified, and a certificate is never generated here.
//
// Money, registration, pickup, certificates and the case status are separate things. The case status moves on the facts of each; none of
// them is read from the status.

export const SCRAP_STATUSES = [
  'DRAFT', 'SUBMITTED', 'SALES_REVIEW', 'DOCUMENTS_REQUIRED', 'ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW',
  'PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', 'COLLECTION_SCHEDULED', 'COLLECTED', 'FACILITY_RECEIVED',
  'DEPOSIT_CONFIRMED', 'SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', 'COMPLETED',
  'ON_HOLD', 'REJECTED', 'CANCELLED',
] as const;
export type ScrapStatus = (typeof SCRAP_STATUSES)[number];

/** Closed for good. Nothing leaves these. */
export const TERMINAL_STATUSES: readonly ScrapStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

/** Permission keys staff need. They are data in the existing role system (Permission / RolePermission), not a second permission system. */
export const SCRAP_PERMISSIONS = {
  /** See scrapping requests (sales: leads assigned to them or unassigned; operations and administrators: all). */
  readRequests: 'scrap.request.read',
  qualifyLead: 'scrap.lead.qualify',
  reviewDocuments: 'scrap.documents.review',
  assignAssessment: 'scrap.assessment.assign',
  reviewAssessment: 'scrap.assessment.review',
  assignPartner: 'scrap.partner.assign',
  verifyQuote: 'scrap.quote.verify',
  approveOffer: 'scrap.offer.approve',
  sendOffer: 'scrap.offer.send',
  schedulePickup: 'scrap.pickup.schedule',
  recordCustody: 'scrap.custody.record',
  verifyCertificate: 'scrap.certificate.verify',
  verifyRegistration: 'scrap.registration.verify',
  holdCase: 'scrap.case.hold',
  cancelCase: 'scrap.case.cancel',
  rejectCase: 'scrap.case.reject',
} as const;
export type ScrapPermission = (typeof SCRAP_PERMISSIONS)[keyof typeof SCRAP_PERMISSIONS];

export type ScrapActor =
  | { kind: 'CUSTOMER' }
  | { kind: 'SYSTEM' }
  /** A person at a facility, acting only on cases assigned to that facility (enforced where the actor is built). */
  | { kind: 'PARTNER' }
  | { kind: 'STAFF'; permissions: readonly string[] };

export type VerificationState = 'PENDING' | 'RECEIVED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'DISPUTED';
export type PartnerStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEREGISTERED';

/** What is true of a case right now, worked out from its records. Every guard reads these; none reads a value a client supplied. */
export interface ScrapCaseFacts {
  // intake and sales
  ownershipDeclared: boolean;
  /** Reasons set by staff that stop the case moving past review (legal restriction, stolen-vehicle concern, and so on). */
  blockingFlags: readonly string[];
  qualifiedBySales: boolean;
  /** Documents the policy asks for that are still outstanding from the customer. */
  openDocumentRequests: boolean;
  requiredDocumentsSubmitted: boolean;
  requiredDocumentsAccepted: boolean;
  // assessment
  assessmentSubmitted: boolean;
  assessmentApproved: boolean;
  reinspectionRequested: boolean;
  // partner, quotation, offer
  partner: { status: PartnerStatus; coversCategory: boolean; coversArea: boolean; registrationValid: boolean } | null;
  verifiedQuoteValid: boolean;
  offerApproved: boolean;
  offerSent: boolean;
  offerExpired: boolean;
  offerAcceptedByCustomer: boolean;
  offerRejectedByCustomer: boolean;
  requoteRequested: boolean;
  /** A difference between the accepted offer and what was found later. It pauses the case until a customer-approved resolution exists. */
  materialDiscrepancyOpen: boolean;
  // pickup and custody
  pickupScheduled: boolean;
  pickupCustomerConfirmed: boolean;
  pickupFailed: boolean;
  /** The vehicle was collected and matched to the request (registration / chassis check), with evidence. */
  collectionRecorded: boolean;
  /** The facility acknowledged receipt. Pickup completion alone is not this. */
  facilityReceiptRecorded: boolean;
  processingStarted: boolean;
  // official evidence, each with its own verification state
  depositCertificate: VerificationState | null;
  scrappingCertificate: VerificationState | null;
  // separate dimensions
  paymentObligationRecorded: boolean;
  paymentState: 'NOT_APPLICABLE' | 'NOT_STARTED' | 'OBLIGATION_RECORDED' | 'PARTIALLY_PAID' | 'PAID_VERIFIED' | 'FAILED' | 'DISPUTED';
  registrationStatus: 'NOT_STARTED' | 'PENDING' | 'EVIDENCE_RECEIVED' | 'VERIFIED' | 'FAILED';
  openDispute: boolean;
  /** While ON_HOLD: the status the case was in. */
  holdFromStatus: ScrapStatus | null;
}

export interface Problem { code: string; message: string }
export type TransitionResult = { ok: true } | ({ ok: false } & Problem);

type ActorKind = ScrapActor['kind'];
interface Rule {
  to: ScrapStatus;
  actors: readonly ActorKind[];
  /** Staff must hold this permission (customers, partners and the system act under their own rules, not permissions). */
  permission?: ScrapPermission;
  reasonRequired?: boolean;
  guard?: (facts: ScrapCaseFacts) => Problem | null;
}

const problem = (code: string, message: string): Problem => ({ code, message });
const partnerUsable = (facts: ScrapCaseFacts): Problem | null => {
  const partner = facts.partner;
  if (!partner) return problem('PARTNER_NOT_ASSIGNED', 'A scrapping facility has not been assigned to this case.');
  if (partner.status !== 'ACTIVE') return problem('PARTNER_NOT_ACTIVE', 'The assigned facility is not an active, verified partner, so the case cannot move on until it is reassigned.');
  if (!partner.registrationValid) return problem('PARTNER_REGISTRATION_NOT_VALID', "The facility's registration is not recorded as currently valid.");
  return null;
};
const first = (...checks: Array<Problem | null>) => checks.find(check => check !== null) ?? null;

/** Statuses from which a case may still be cancelled: before the vehicle has left the customer. */
const BEFORE_HANDOVER: readonly ScrapStatus[] = [
  'DRAFT', 'SUBMITTED', 'SALES_REVIEW', 'DOCUMENTS_REQUIRED', 'ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW',
  'PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', 'COLLECTION_SCHEDULED',
];
/** Statuses a case can be put on hold from: anything still in progress. */
const IN_PROGRESS: readonly ScrapStatus[] = SCRAP_STATUSES.filter(status => !TERMINAL_STATUSES.includes(status) && status !== 'DRAFT' && status !== 'ON_HOLD');

const RULES: Partial<Record<ScrapStatus, readonly Rule[]>> = {
  DRAFT: [
    {
      to: 'SUBMITTED', actors: ['CUSTOMER'],
      guard: facts => (facts.ownershipDeclared ? null : problem('OWNERSHIP_DECLARATION_REQUIRED', 'The ownership declaration must be completed before the request is submitted.')),
    },
  ],
  SUBMITTED: [{ to: 'SALES_REVIEW', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.qualifyLead }],
  SALES_REVIEW: [
    {
      to: 'DOCUMENTS_REQUIRED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.reviewDocuments,
      guard: facts => (facts.openDocumentRequests ? null : problem('NO_DOCUMENTS_REQUESTED', 'Request at least one document before asking the customer for documents.')),
    },
    {
      to: 'ASSESSMENT_PENDING', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.qualifyLead,
      guard: facts => first(
        facts.blockingFlags.length ? problem('CASE_BLOCKED', `This case has a blocking concern (${facts.blockingFlags.join(', ')}) and cannot be assessed until it is resolved.`) : null,
        facts.ownershipDeclared ? null : problem('OWNERSHIP_DECLARATION_REQUIRED', 'The customer has not made the ownership declaration.'),
        facts.qualifiedBySales ? null : problem('LEAD_NOT_QUALIFIED', 'The lead has not been qualified.'),
        facts.openDocumentRequests ? problem('DOCUMENTS_OUTSTANDING', 'Documents the customer was asked for are still outstanding.') : null,
      ),
    },
    { to: 'REJECTED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.rejectCase, reasonRequired: true },
  ],
  DOCUMENTS_REQUIRED: [
    {
      to: 'SALES_REVIEW', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.reviewDocuments,
      guard: facts => (facts.requiredDocumentsSubmitted ? null : problem('DOCUMENTS_NOT_SUBMITTED', 'The customer has not submitted the documents that were requested.')),
    },
  ],
  ASSESSMENT_PENDING: [
    {
      to: 'ASSESSMENT_COMPLETED', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.reviewAssessment,
      guard: facts => (facts.assessmentSubmitted ? null : problem('ASSESSMENT_NOT_SUBMITTED', 'The inspector has not submitted the assessment.')),
    },
  ],
  ASSESSMENT_COMPLETED: [
    {
      to: 'OPERATIONS_REVIEW', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.reviewAssessment,
      guard: facts => first(
        facts.assessmentApproved ? null : problem('ASSESSMENT_NOT_APPROVED', 'The assessment has not been reviewed and approved.'),
        facts.reinspectionRequested ? problem('REINSPECTION_REQUESTED', 'A reinspection was requested, so this assessment cannot go forward.') : null,
      ),
    },
    {
      to: 'ASSESSMENT_PENDING', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.reviewAssessment,
      guard: facts => (facts.reinspectionRequested ? null : problem('REINSPECTION_NOT_REQUESTED', 'A reinspection has not been requested.')),
    },
  ],
  OPERATIONS_REVIEW: [
    {
      to: 'PARTNER_QUOTE_PENDING', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.assignPartner,
      guard: facts => first(
        partnerUsable(facts),
        facts.partner && !facts.partner.coversCategory ? problem('PARTNER_CATEGORY_NOT_APPROVED', "The facility is not approved for this vehicle's category.") : null,
        facts.partner && !facts.partner.coversArea ? problem('PARTNER_AREA_NOT_COVERED', 'The facility does not serve the vehicle\'s location.') : null,
      ),
    },
    { to: 'REJECTED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.rejectCase, reasonRequired: true },
  ],
  PARTNER_QUOTE_PENDING: [
    {
      to: 'OFFER_PENDING_CUSTOMER', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.sendOffer,
      guard: facts => first(
        partnerUsable(facts),
        facts.verifiedQuoteValid ? null : problem('QUOTATION_NOT_VERIFIED', 'There is no verified, unexpired quotation from the facility.'),
        facts.offerApproved ? null : problem('OFFER_NOT_APPROVED', 'The offer has not been approved under the approval policy.'),
        facts.offerSent ? null : problem('OFFER_NOT_SENT', 'The offer has not been sent to the customer.'),
      ),
    },
  ],
  OFFER_PENDING_CUSTOMER: [
    {
      to: 'OFFER_ACCEPTED', actors: ['CUSTOMER'],
      guard: facts => first(
        facts.offerExpired ? problem('OFFER_EXPIRED', 'This offer has expired. A new quotation is needed.') : null,
        facts.offerAcceptedByCustomer ? null : problem('OFFER_NOT_ACCEPTED', 'The customer has not accepted the current offer.'),
      ),
    },
    {
      to: 'PARTNER_QUOTE_PENDING', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.assignPartner,
      guard: facts => (facts.offerExpired || facts.requoteRequested ? null : problem('REQUOTE_NOT_NEEDED', 'The offer has not expired and a new quotation was not requested.')),
    },
    {
      to: 'REJECTED', actors: ['CUSTOMER'],
      guard: facts => (facts.offerRejectedByCustomer ? null : problem('OFFER_NOT_REJECTED', 'The customer has not rejected the offer.')),
    },
  ],
  OFFER_ACCEPTED: [
    {
      to: 'COLLECTION_SCHEDULED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.schedulePickup,
      guard: facts => first(
        facts.blockingFlags.length ? problem('CASE_BLOCKED', `This case has a blocking concern (${facts.blockingFlags.join(', ')}).`) : null,
        facts.materialDiscrepancyOpen ? problem('DISCREPANCY_OPEN', 'A discrepancy with the accepted offer is open. It needs a documented, customer-approved resolution first.') : null,
        facts.openDispute ? problem('DISPUTE_OPEN', 'A dispute is open on this case.') : null,
        partnerUsable(facts),
        facts.requiredDocumentsAccepted ? null : problem('DOCUMENTS_NOT_ACCEPTED', 'The required ownership and identity documents have not all been accepted.'),
        facts.paymentObligationRecorded ? null : problem('PAYMENT_OBLIGATION_MISSING', 'Who pays the customer, and how much, has not been recorded.'),
        facts.pickupScheduled ? null : problem('PICKUP_NOT_SCHEDULED', 'A pickup has not been scheduled.'),
        facts.pickupCustomerConfirmed ? null : problem('PICKUP_NOT_CONFIRMED', 'The customer has not confirmed the pickup.'),
      ),
    },
  ],
  COLLECTION_SCHEDULED: [
    {
      to: 'COLLECTED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.recordCustody,
      guard: facts => first(
        facts.collectionRecorded ? null : problem('COLLECTION_NOT_RECORDED', 'The collection, with the vehicle matched to the request and its evidence, has not been recorded.'),
        facts.materialDiscrepancyOpen ? problem('DISCREPANCY_OPEN', 'A discrepancy with the accepted offer is open.') : null,
      ),
    },
    {
      to: 'OFFER_ACCEPTED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.schedulePickup,
      guard: facts => (facts.pickupFailed ? null : problem('PICKUP_DID_NOT_FAIL', 'The pickup has not failed, so it does not need to be rescheduled.')),
    },
  ],
  COLLECTED: [
    {
      to: 'FACILITY_RECEIVED', actors: ['STAFF', 'PARTNER'], permission: SCRAP_PERMISSIONS.recordCustody,
      guard: facts => first(
        facts.facilityReceiptRecorded ? null : problem('FACILITY_RECEIPT_MISSING', "The facility's acknowledgement of receipt has not been recorded. Pickup is not receipt."),
        partnerUsable(facts),
      ),
    },
  ],
  FACILITY_RECEIVED: [
    {
      to: 'DEPOSIT_CONFIRMED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.verifyCertificate,
      guard: facts => (facts.depositCertificate === 'VERIFIED'
        ? null
        : problem('DEPOSIT_CERTIFICATE_NOT_VERIFIED', 'The Certificate of Deposit has not been received and verified. Receipt at the facility is not the same as a verified deposit.')),
    },
  ],
  DEPOSIT_CONFIRMED: [
    {
      to: 'SCRAPPING_IN_PROGRESS', actors: ['STAFF', 'PARTNER'], permission: SCRAP_PERMISSIONS.recordCustody,
      guard: facts => (facts.processingStarted ? null : problem('PROCESSING_NOT_STARTED', 'The facility has not confirmed that processing has started.')),
    },
  ],
  SCRAPPING_IN_PROGRESS: [
    {
      to: 'SCRAPPING_COMPLETED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.verifyCertificate,
      guard: facts => first(
        facts.depositCertificate === 'VERIFIED' ? null : problem('DEPOSIT_CERTIFICATE_NOT_VERIFIED', 'The Certificate of Deposit is not verified.'),
        facts.scrappingCertificate === 'VERIFIED'
          ? null
          : problem('SCRAPPING_CERTIFICATE_NOT_VERIFIED', 'The Certificate of Vehicle Scrapping has not been received and verified. A vehicle is not scrapped until the facility has issued it and it has been verified.'),
      ),
    },
  ],
  SCRAPPING_COMPLETED: [{ to: 'REGISTRATION_UPDATE_PENDING', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.verifyRegistration }],
  REGISTRATION_UPDATE_PENDING: [
    {
      to: 'COMPLETED', actors: ['STAFF'], permission: SCRAP_PERMISSIONS.verifyRegistration,
      guard: facts => first(
        facts.registrationStatus === 'VERIFIED'
          ? null
          : problem('REGISTRATION_NOT_VERIFIED', "The vehicle's registration update has not been confirmed by evidence. Do not mark the registration cancelled without it."),
        facts.paymentState === 'PAID_VERIFIED' || facts.paymentState === 'NOT_APPLICABLE'
          ? null
          : problem('PAYMENT_NOT_SETTLED', 'The customer payout has not been verified as paid.'),
        facts.openDispute ? problem('DISPUTE_OPEN', 'A dispute is open on this case.') : null,
      ),
    },
  ],
};

/** Every rule for a status, including the ones that apply to many statuses at once (cancel, hold, resume). */
function rulesFrom(from: ScrapStatus, facts: ScrapCaseFacts): Rule[] {
  const rules = [...(RULES[from] ?? [])];
  if (BEFORE_HANDOVER.includes(from)) rules.push({ to: 'CANCELLED', actors: ['CUSTOMER', 'STAFF'], permission: SCRAP_PERMISSIONS.cancelCase, reasonRequired: true });
  if (IN_PROGRESS.includes(from)) rules.push({ to: 'ON_HOLD', actors: ['SYSTEM', 'STAFF'], permission: SCRAP_PERMISSIONS.holdCase, reasonRequired: true });
  if (from === 'ON_HOLD' && facts.holdFromStatus) {
    // A held case resumes only where it was, and only when nothing that caused the hold is still open.
    rules.push({
      to: facts.holdFromStatus, actors: ['STAFF'], permission: SCRAP_PERMISSIONS.holdCase,
      guard: current => first(
        current.openDispute ? problem('DISPUTE_OPEN', 'A dispute is open on this case.') : null,
        current.materialDiscrepancyOpen ? problem('DISCREPANCY_OPEN', 'A discrepancy with the accepted offer is open.') : null,
      ),
    });
  }
  return rules;
}

const actorAllowed = (rule: Rule, actor: ScrapActor): boolean => {
  if (!rule.actors.includes(actor.kind)) return false;
  if (actor.kind === 'STAFF') return !rule.permission || actor.permissions.includes(rule.permission);
  return true;
};

export function isTerminalStatus(status: ScrapStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** A request that counts as live for the "one request per vehicle" rule: submitted and not yet closed. A draft does not count. */
export function isLiveRequestStatus(status: ScrapStatus): boolean {
  return status !== 'DRAFT' && !isTerminalStatus(status);
}

/** Cancellation is only a status change before the vehicle leaves the customer. After handover it needs a dispute or a hold. */
export function cancellationAllowed(status: ScrapStatus): boolean {
  return BEFORE_HANDOVER.includes(status);
}

/** Decides whether `actor` may move a case from `from` to `to` given what is true of it. The answer says why not. */
export function evaluateTransition(input: { from: ScrapStatus; to: ScrapStatus; actor: ScrapActor; facts: ScrapCaseFacts; reason?: string }): TransitionResult {
  const { from, to, actor, facts } = input;
  if (isTerminalStatus(from)) return { ok: false, ...problem('CASE_CLOSED', `This case is ${from.toLowerCase()} and cannot change.`) };
  if (from === to) return { ok: false, ...problem('NO_CHANGE', 'The case is already in that status.') };

  if (to === 'CANCELLED' && !cancellationAllowed(from)) {
    return { ok: false, ...problem('CANCELLATION_AFTER_HANDOVER', 'The vehicle has already left the customer, so the case cannot simply be cancelled. Raise a dispute or put the case on hold so the facility, the customer and V MOTIV can resolve it with a record.') };
  }

  const candidates = rulesFrom(from, facts).filter(rule => rule.to === to);
  if (candidates.length === 0) return { ok: false, ...problem('TRANSITION_NOT_ALLOWED', `A case cannot move from ${from} to ${to}.`) };

  const permitted = candidates.filter(rule => actorAllowed(rule, actor));
  if (permitted.length === 0) return { ok: false, ...problem('NOT_PERMITTED', 'This person or system is not allowed to make that change.') };

  const rule = permitted[0]!;
  if (rule.reasonRequired && !input.reason?.trim()) return { ok: false, ...problem('REASON_REQUIRED', 'A reason is required for this change.') };
  const blocked = rule.guard?.(facts) ?? null;
  if (blocked) return { ok: false, ...blocked };
  return { ok: true };
}

/** For a screen: every status this case could move to for this actor, and for those that are not possible yet, what is missing. */
export function availableTransitions(from: ScrapStatus, actor: ScrapActor, facts: ScrapCaseFacts): Array<{ to: ScrapStatus; allowed: boolean; blockedBy?: Problem }> {
  if (isTerminalStatus(from)) return [];
  const targets = [...new Set(rulesFrom(from, facts).filter(rule => actorAllowed(rule, actor)).map(rule => rule.to))];
  return targets.map(to => {
    const result = evaluateTransition({ from, to, actor, facts, reason: 'preview' });
    return result.ok ? { to, allowed: true } : { to, allowed: false, blockedBy: { code: result.code, message: result.message } };
  });
}

/** Every status a case can ever reach from `from`, ignoring who or what is true. For tests and documentation. */
export function reachableStatuses(from: ScrapStatus, facts: ScrapCaseFacts): Set<ScrapStatus> {
  const seen = new Set<ScrapStatus>();
  const queue: ScrapStatus[] = [from];
  const visit = (status: ScrapStatus) => { if (!seen.has(status)) { seen.add(status); queue.push(status); } };
  while (queue.length) {
    const current = queue.shift()!;
    if (current === 'ON_HOLD') {
      // A held case resumes only where it was, so it can go back to any in-progress status that was reached on the way here.
      for (const status of [from, ...seen]) if (IN_PROGRESS.includes(status)) visit(status);
      continue;
    }
    for (const rule of rulesFrom(current, { ...facts, holdFromStatus: null })) visit(rule.to);
  }
  return seen;
}

/** A case with nothing recorded yet. Tests start from this and set only what a step needs. */
export function emptyFacts(overrides: Partial<ScrapCaseFacts> = {}): ScrapCaseFacts {
  return {
    ownershipDeclared: false, blockingFlags: [], qualifiedBySales: false, openDocumentRequests: false, requiredDocumentsSubmitted: false,
    requiredDocumentsAccepted: false, assessmentSubmitted: false, assessmentApproved: false, reinspectionRequested: false, partner: null,
    verifiedQuoteValid: false, offerApproved: false, offerSent: false, offerExpired: false, offerAcceptedByCustomer: false,
    offerRejectedByCustomer: false, requoteRequested: false, materialDiscrepancyOpen: false, pickupScheduled: false,
    pickupCustomerConfirmed: false, pickupFailed: false, collectionRecorded: false, facilityReceiptRecorded: false, processingStarted: false,
    depositCertificate: null, scrappingCertificate: null, paymentObligationRecorded: false, paymentState: 'NOT_STARTED',
    registrationStatus: 'NOT_STARTED', openDispute: false, holdFromStatus: null,
    ...overrides,
  };
}
