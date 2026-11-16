// Plain wording for what a scrapping request can show: pickups, payments, registration, documents and concerns. Every state the server can send has
// wording here, so no screen ever shows a raw code. Presentation only: none of it decides anything.

export const PICKUP_STATUS_TEXT: Record<string, string> = {
  SCHEDULED: 'Scheduled. Please confirm the time',
  CUSTOMER_CONFIRMED: 'Confirmed by you',
  AGENT_ASSIGNED: 'A driver has been assigned',
  COLLECTED: 'Collected',
  FAILED: 'The pickup could not be completed. We will arrange another time',
  RESCHEDULED: 'Rescheduled',
  CANCELLED: 'Cancelled',
};

export const OBLIGATION_STATUS_TEXT: Record<string, string> = {
  RECORDED: 'Payment arranged',
  PARTIALLY_SETTLED: 'Partly paid',
  SETTLED: 'Paid',
  FAILED: 'The payment did not go through. We are looking into it',
  DISPUTED: 'Under review',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_STATE_TEXT: Record<string, string> = {
  NOT_APPLICABLE: 'No payment is due',
  NOT_STARTED: 'Not started',
  OBLIGATION_RECORDED: 'Payment arranged',
  PARTIALLY_PAID: 'Partly paid',
  PAID_VERIFIED: 'Payment confirmed',
  FAILED: 'The payment did not go through',
  DISPUTED: 'Under review',
};

export const REGISTRATION_TEXT: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'In progress',
  EVIDENCE_RECEIVED: 'We have evidence and are checking it',
  VERIFIED: 'Confirmed by evidence',
  FAILED: 'We could not confirm it yet. Our team is following up',
};

export const DOCUMENT_STATUS_TEXT: Record<string, string> = {
  REQUESTED: 'Needed from you',
  UPLOADED: 'Received',
  UNDER_REVIEW: 'Being checked',
  ACCEPTED: 'Accepted',
  REJECTED: 'Not accepted. Please send it again',
  EXPIRED: 'Expired',
};

export const DISPUTE_STATUS_TEXT: Record<string, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Being looked at',
  ESCALATED: 'Escalated to a senior team member',
  RESOLVED: 'Resolved',
  REJECTED: 'Closed without change',
};

export const DOCUMENT_TYPE_NAMES: Record<string, string> = {
  RC: 'Registration certificate (RC)',
  ID_PROOF: 'Identity proof',
  ADDRESS_PROOF: 'Address proof',
  LOAN_NOC: 'Loan clearance letter (NOC)',
  INSURANCE: 'Insurance policy',
  VEHICLE_PHOTO: 'Vehicle photograph',
  OWNER_AUTHORISATION: 'Authorisation from the owner',
};

/** A document type's name, or a tidy version of it when it is one we have no special name for. */
export function documentName(type: string): string {
  return DOCUMENT_TYPE_NAMES[type] ?? type.toLowerCase().replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

/** Who pays the customer. V MOTIV is never described as holding the money unless the offer says it pays. */
export function payerText(payerType: 'RVSF' | 'VMOTIV' | string, facilityName?: string | null): string {
  if (payerType === 'VMOTIV') return 'Paid to you by V MOTIV';
  return facilityName ? `Paid to you directly by ${facilityName}` : 'Paid to you directly by the authorised scrapping facility';
}

/** How long an offer stays open, in words. Never negative. */
export function timeLeftText(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `Expires in ${Math.max(1, Math.ceil(ms / 60_000))} minutes`;
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `Expires in ${Math.floor(hours / 24)} days`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Closed requests belong in history; everything else (including drafts) is "in progress". Presentation only. */
export const isClosedStatus = (status: string) => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status);
