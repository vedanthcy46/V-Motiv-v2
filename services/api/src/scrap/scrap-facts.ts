// Works out the "facts" the state machine reads, from a case's records. Pure: it takes plain records and a clock. Nothing here trusts a
// status string that a client sent, and nothing reads the case status to decide whether something else is true (for example "paid").

import { emptyFacts, type ScrapCaseFacts, type ScrapStatus, type VerificationState } from './scrap-workflow.js';

/** The shape of what is loaded for a case. Plain fields only, so it can be built in a test without a database. */
export interface ScrapCaseRecords {
  request: {
    status: ScrapStatus;
    holdFromStatus: ScrapStatus | null;
    blockingFlags: string[];
    ownershipDeclaredAt: Date | null;
    city: string | null;
    paymentState: ScrapCaseFacts['paymentState'];
    registrationStatus: ScrapCaseFacts['registrationStatus'];
  };
  vehicleCategory: string | null;
  partner: { status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEREGISTERED'; approvedCategories: string[]; serviceAreas: string[]; registrationValidUntil: Date | null } | null;
  documents: Array<{ status: 'REQUESTED' | 'UPLOADED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' }>;
  /** The newest assessment that has not been superseded. */
  assessment: { status: 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REINSPECTION_REQUIRED' | 'SUPERSEDED' } | null;
  quotes: Array<{ status: 'RECEIVED' | 'UNDER_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED'; validUntil: Date }>;
  /** The highest-numbered offer. */
  offer: {
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT_TO_CUSTOMER' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED' | 'WITHDRAWN';
    approvedAt: Date | null;
    sentAt: Date | null;
    expiresAt: Date;
    decision: 'ACCEPTED' | 'REJECTED' | null;
  } | null;
  /** The newest pickup that has not been cancelled. */
  pickup: { status: 'SCHEDULED' | 'CUSTOMER_CONFIRMED' | 'AGENT_ASSIGNED' | 'COLLECTED' | 'FAILED' | 'RESCHEDULED' | 'CANCELLED'; customerConfirmedAt: Date | null; identityMatched: boolean | null } | null;
  custodyEvents: Array<{ action: string; toCustodianType: 'CUSTOMER' | 'TRANSPORT' | 'FACILITY' | 'VMOTIV' }>;
  certificates: Array<{ type: 'CERTIFICATE_OF_DEPOSIT' | 'CERTIFICATE_OF_VEHICLE_SCRAPPING'; verificationState: VerificationState }>;
  obligations: Array<{ status: 'RECORDED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'FAILED' | 'DISPUTED' | 'CANCELLED' }>;
  disputes: Array<{ status: 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'REJECTED'; category: string }>;
  /** Case events in time order, oldest first. Used for facts with no table of their own (a lead being qualified). */
  events: Array<{ evidenceKind: string | null }>;
}

/** Custody actions the later phases record. Fixed here so the guards and the recording code agree. */
export const CUSTODY_ACTIONS = {
  pickupCollected: 'PICKUP_COLLECTED',
  facilityReceived: 'FACILITY_RECEIVED',
  processingStarted: 'PROCESSING_STARTED',
} as const;

/** Evidence markers on case events for things that are not a status change. */
export const EVENT_KINDS = {
  leadQualified: 'LEAD_QUALIFIED',
  leadQualificationRevoked: 'LEAD_QUALIFICATION_REVOKED',
} as const;

/** Dispute categories that mean "what was accepted no longer matches reality". They hold the case until resolved. */
export const DISCREPANCY_DISPUTE_CATEGORIES = ['OFFER_DISCREPANCY', 'VIN_MISMATCH', 'VEHICLE_CONDITION_MISMATCH'] as const;

const OPEN_DISPUTE: ReadonlyArray<string> = ['OPEN', 'UNDER_REVIEW', 'ESCALATED'];

/** The strongest state across a certificate type's records: one verified record counts, otherwise the furthest along that is not rejected. */
function certificateState(records: ScrapCaseRecords['certificates'], type: 'CERTIFICATE_OF_DEPOSIT' | 'CERTIFICATE_OF_VEHICLE_SCRAPPING'): VerificationState | null {
  const states = records.filter(record => record.type === type).map(record => record.verificationState);
  if (states.length === 0) return null;
  if (states.includes('VERIFIED')) return 'VERIFIED';
  for (const state of ['DISPUTED', 'UNDER_REVIEW', 'RECEIVED', 'PENDING', 'REJECTED'] as const) if (states.includes(state)) return state;
  return null;
}

export function factsFromRecords(records: ScrapCaseRecords, now = new Date()): ScrapCaseFacts {
  const { request, partner, offer, pickup } = records;
  const documents = records.documents.filter(document => document.status !== 'EXPIRED');

  const lastQualification = [...records.events].reverse().find(event => event.evidenceKind === EVENT_KINDS.leadQualified || event.evidenceKind === EVENT_KINDS.leadQualificationRevoked);
  const offerPastExpiry = offer ? offer.expiresAt.getTime() <= now.getTime() && ['SENT_TO_CUSTOMER', 'EXPIRED'].includes(offer.status) : false;
  const offerWasSent = offer ? offer.sentAt !== null && ['SENT_TO_CUSTOMER', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(offer.status) : false;

  const collectedEvent = records.custodyEvents.some(event => event.action === CUSTODY_ACTIONS.pickupCollected);

  return emptyFacts({
    ownershipDeclared: request.ownershipDeclaredAt !== null,
    blockingFlags: request.blockingFlags,
    qualifiedBySales: lastQualification?.evidenceKind === EVENT_KINDS.leadQualified,
    // Anything the customer was asked for and has not (yet, or acceptably) provided.
    openDocumentRequests: documents.some(document => document.status === 'REQUESTED' || document.status === 'REJECTED'),
    requiredDocumentsSubmitted: !documents.some(document => document.status === 'REQUESTED' || document.status === 'REJECTED'),
    // Nothing is "accepted" until at least one document exists and every one has been accepted by a person.
    requiredDocumentsAccepted: documents.length > 0 && documents.every(document => document.status === 'ACCEPTED'),
    assessmentSubmitted: records.assessment ? ['SUBMITTED', 'APPROVED'].includes(records.assessment.status) : false,
    assessmentApproved: records.assessment?.status === 'APPROVED',
    reinspectionRequested: records.assessment?.status === 'REINSPECTION_REQUIRED',
    partner: partner && {
      status: partner.status,
      coversCategory: records.vehicleCategory !== null && partner.approvedCategories.includes(records.vehicleCategory),
      coversArea: request.city !== null && partner.serviceAreas.some(area => area.trim().toLowerCase() === request.city!.trim().toLowerCase()),
      // Valid only if a validity date is recorded and it has not passed. An unknown validity is not treated as valid.
      registrationValid: partner.registrationValidUntil !== null && partner.registrationValidUntil.getTime() > now.getTime(),
    },
    verifiedQuoteValid: records.quotes.some(quote => quote.status === 'VERIFIED' && quote.validUntil.getTime() > now.getTime()),
    offerApproved: offer?.approvedAt != null,
    offerSent: offerWasSent,
    offerExpired: offerPastExpiry,
    offerAcceptedByCustomer: offer?.decision === 'ACCEPTED',
    offerRejectedByCustomer: offer?.decision === 'REJECTED',
    requoteRequested: offer?.status === 'WITHDRAWN',
    materialDiscrepancyOpen: records.disputes.some(dispute => OPEN_DISPUTE.includes(dispute.status) && (DISCREPANCY_DISPUTE_CATEGORIES as readonly string[]).includes(dispute.category)),
    pickupScheduled: pickup ? ['SCHEDULED', 'CUSTOMER_CONFIRMED', 'AGENT_ASSIGNED', 'COLLECTED'].includes(pickup.status) : false,
    pickupCustomerConfirmed: pickup?.customerConfirmedAt != null,
    pickupFailed: pickup?.status === 'FAILED',
    // Collection counts only with a custody record AND the vehicle matched to the request. A pickup status alone is not enough.
    collectionRecorded: collectedEvent && pickup?.identityMatched === true,
    facilityReceiptRecorded: records.custodyEvents.some(event => event.action === CUSTODY_ACTIONS.facilityReceived && event.toCustodianType === 'FACILITY'),
    processingStarted: records.custodyEvents.some(event => event.action === CUSTODY_ACTIONS.processingStarted),
    depositCertificate: certificateState(records.certificates, 'CERTIFICATE_OF_DEPOSIT'),
    scrappingCertificate: certificateState(records.certificates, 'CERTIFICATE_OF_VEHICLE_SCRAPPING'),
    paymentObligationRecorded: records.obligations.some(obligation => obligation.status !== 'CANCELLED'),
    paymentState: request.paymentState,
    registrationStatus: request.registrationStatus,
    openDispute: records.disputes.some(dispute => OPEN_DISPUTE.includes(dispute.status)),
    holdFromStatus: request.holdFromStatus,
  });
}

/** What a customer reads for each status. Plain language, no internal detail, and never a claim the case has not earned. */
export const CUSTOMER_STATUS_TEXT: Record<ScrapStatus, { label: string; description: string }> = {
  DRAFT: { label: 'Draft', description: 'You have not submitted this request yet.' },
  SUBMITTED: { label: 'Submitted', description: 'We have your request and will review it shortly.' },
  SALES_REVIEW: { label: 'Being reviewed', description: 'Our team is reviewing your request.' },
  DOCUMENTS_REQUIRED: { label: 'Documents needed', description: 'We need some documents from you to continue.' },
  ASSESSMENT_PENDING: { label: 'Inspection to be arranged', description: 'An inspector will assess the vehicle.' },
  ASSESSMENT_COMPLETED: { label: 'Inspection done', description: 'The inspection is complete and is being reviewed.' },
  OPERATIONS_REVIEW: { label: 'Preparing your offer', description: 'We are checking the inspection and choosing an authorised scrapping facility.' },
  PARTNER_QUOTE_PENDING: { label: 'Getting a quotation', description: 'We are getting a quotation from the authorised facility.' },
  OFFER_PENDING_CUSTOMER: { label: 'Offer ready', description: 'Your offer is ready. Please review it before it expires.' },
  OFFER_ACCEPTED: { label: 'Offer accepted', description: 'You accepted the offer. We are arranging collection.' },
  COLLECTION_SCHEDULED: { label: 'Collection scheduled', description: 'Your vehicle will be collected at the agreed time.' },
  COLLECTED: { label: 'Collected', description: 'The vehicle has been collected and is on its way to the facility.' },
  FACILITY_RECEIVED: { label: 'Received by the facility', description: 'The facility has received your vehicle. Scrapping is not complete yet.' },
  DEPOSIT_CONFIRMED: { label: 'Deposit confirmed', description: 'The facility has issued a Certificate of Deposit and we have checked it.' },
  SCRAPPING_IN_PROGRESS: { label: 'Being scrapped', description: 'The facility is processing your vehicle.' },
  SCRAPPING_COMPLETED: { label: 'Scrapping certified', description: 'The facility has issued the Certificate of Vehicle Scrapping and we have checked it.' },
  REGISTRATION_UPDATE_PENDING: { label: 'Registration update in progress', description: 'We are following up on the update to the vehicle\'s registration record.' },
  COMPLETED: { label: 'Completed', description: 'Your request is complete.' },
  ON_HOLD: { label: 'On hold', description: 'Your request is paused while we sort something out. We will tell you what we need.' },
  REJECTED: { label: 'Closed', description: 'We could not take this request forward.' },
  CANCELLED: { label: 'Cancelled', description: 'This request was cancelled.' },
};
