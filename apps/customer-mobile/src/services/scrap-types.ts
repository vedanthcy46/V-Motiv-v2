import type { Answers, DraftState } from './scrap-form';

// The shapes the vehicle-scrapping API sends. Pure types with no imports from the app or the browser, so the mobile app and the website
// describe the same responses the same way. Money arrives as strings of paise (never numbers), so no amount is ever rounded on the way.

export interface ScrapEstimate {
  status: 'ESTIMATED' | 'QUOTATION_REQUIRED' | 'EXPIRED';
  minPaise: string | null;
  maxPaise: string | null;
  currency: string;
  expiresAt: string | null;
  calculationVersion: string;
}

export interface ScrapDraftView {
  id: string;
  requestNumber: string;
  version: number;
  status: 'DRAFT';
  statusLabel: string;
  statusDescription: string;
  customerVehicleId: string | null;
  draft: DraftState;
  visibleQuestions: string[];
  missing: Array<{ field: string; message: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapSummary {
  id: string;
  requestNumber: string;
  version: number;
  status: string;
  statusLabel: string;
  statusDescription: string;
  vehicle: { registrationNumber?: string; make?: string; model?: string; manufacturingYear?: number } | null;
  estimate?: ScrapEstimate | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row in the list: a full summary, or the lighter row the server sends for a draft. */
export type ScrapListRow = Partial<ScrapSummary> & { id: string; requestNumber: string; status: string };

export interface ScrapDetails {
  id: string;
  requestNumber: string;
  version: number;
  status: string;
  statusLabel: string;
  statusDescription: string;
  holdNotice: string | null;
  vehicle: { registrationNumber: string; make: string; model: string; variant?: string | null; manufacturingYear: number; fuelType: string; vehicleCategory: string; odometerKm?: number | null; identityStatus: string } | null;
  answers: Answers;
  pickupAddress: { line1?: string; city?: string; pincode?: string } | null;
  estimate: ScrapEstimate | null;
  documents: Array<{ id: string; documentType: string; status: string; rejectionReason: string | null }>;
  offer: { id: string; version: number; status: string; customerPayoutPaise: string; currency: string; payerType: 'RVSF' | 'VMOTIV'; facilityName: string | null; expiresAt: string; terms: unknown; decision: 'ACCEPTED' | 'REJECTED' | null } | null;
  pickup: { status: string; windowStart: string; windowEnd: string; address: unknown; customerConfirmedAt: string | null; agentName: string | null; transportProvider: string | null } | null;
  certificates: Array<{ type: string; officialReference: string; issuedAt: string; verificationState: string; verificationMethod: string | null }>;
  registrationStatus: string;
  payment: { state: string; obligations: Array<{ payerType: string; amountPaise: string; currency: string; status: string }> };
  disputes: Array<{ id: string; category: string; status: string; createdAt: string }>;
  timeline: Array<{ at: string; status: string; label: string; note: string | null }>;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

export interface ScrapPage<T> { items: T[]; nextCursor: string | null }

export const isDraftView = (value: ScrapDetails | ScrapDraftView): value is ScrapDraftView => value.status === 'DRAFT';
