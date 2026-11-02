import type { User } from 'firebase/auth';
import type {
  AcquisitionCase,
  AcquisitionOfferItem,
  Branch,
  DashboardMetrics,
  InspectionRequest,
  InspectorEmployee,
  RentalBookingItem,
  RentalFleetItem,
  RentalOperationsSummary,
  SellerLeadValuation,
  ServiceJobItem,
  ServiceQueueResponse,
  TestDrive,
  VehicleStockUnit,
} from './types';

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE || '').trim();
  const raw = (env || 'http://localhost:4100/api/v2')
    .replace('https://vmotiv.in', 'https://api.vmotiv.in')
    .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
    .replace(/\/$/, '');
  if (raw.endsWith('/api/v2') || raw.endsWith('/api/v1')) {
    return raw;
  }
  return `${raw}/api/v2`;
}
const base = resolveApiBase();

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

async function call<T>(user: User, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await user.getIdToken(!retry);
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  };

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, requestInit);
  } catch (err: any) {
    // If a browser extension (e.g. 200.js / M_ID) monkey-patched fetch and threw an error
    if (
      err instanceof TypeError &&
      (String(err?.message).includes('M_ID') || String(err?.stack).includes('200.js'))
    ) {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const cleanFetch = iframe.contentWindow?.fetch;
      if (cleanFetch) {
        response = await cleanFetch(`${base}${path}`, requestInit);
        setTimeout(() => {
          try { iframe.remove(); } catch { /* ignore */ }
        }, 1000);
      } else {
        iframe.remove();
        throw err;
      }
    } else {
      throw err;
    }
  }

  if (response.status === 401 && retry) {
    await user.getIdToken(true);
    return call<T>(user, path, init, false);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ code: 'REQUEST_FAILED' }))) as { code?: string; message?: string };
    throw new ApiError(response.status, body.code || body.message || 'REQUEST_FAILED');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  // --- Dashboard ---
  dashboard: (u: User) => call<DashboardMetrics>(u, '/operations/dashboard'),

  // --- Inspection Dispatch ---
  inspectionRequests: (u: User) => call<InspectionRequest[]>(u, '/operations/inspection-requests'),
  inspectors: (u: User, branchId?: string) =>
    call<InspectorEmployee[]>(u, `/operations/inspectors${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
  assignInspection: (
    u: User,
    requestId: string,
    body: { inspectorId: string; scheduledAt?: string; locationType: 'HUB' | 'HOME'; address?: string; instructions?: string }
  ) => call<unknown>(u, `/operations/inspection-requests/${requestId}/assign`, { method: 'POST', body: JSON.stringify(body) }),
  rescheduleInspection: (
    u: User,
    requestId: string,
    body: { scheduledAt: string; locationType: 'HUB' | 'HOME'; address?: string; instructions?: string; reason: string }
  ) => call<unknown>(u, `/operations/inspection-requests/${requestId}/reschedule`, { method: 'POST', body: JSON.stringify(body) }),
  cancelInspection: (u: User, requestId: string, reason: string) =>
    call<unknown>(u, `/operations/inspection-requests/${requestId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // --- Valuations & Offers (Separation of duties: PRICING_APPROVER verifies) ---
  valuations: (u: User, leadId: string) => call<SellerLeadValuation[]>(u, `/sales/seller-leads/${leadId}/valuations`),
  createValuation: (
    u: User,
    leadId: string,
    body: {
      inspectionReportId: string;
      expectedResalePaise: string | number;
      refurbishmentPaise?: string | number;
      otherCostsPaise?: string | number;
      requiredMarginPaise?: string | number;
      recommendedPurchasePaise: string | number;
      notes?: string;
    }
  ) => call<SellerLeadValuation>(u, `/sales/seller-leads/${leadId}/valuations`, { method: 'POST', body: JSON.stringify(body) }),
  decideValuation: (
    u: User,
    leadId: string,
    valuationId: string,
    body: { version: number; decision: 'APPROVE' | 'REJECT'; reason?: string }
  ) => call<SellerLeadValuation>(u, `/sales/seller-leads/${leadId}/valuations/${valuationId}/decision`, { method: 'POST', body: JSON.stringify(body) }),
  acquisitionOffers: (u: User, leadId: string) => call<AcquisitionOfferItem[]>(u, `/sales/seller-leads/${leadId}/offers`),
  proposeOffer: (
    u: User,
    leadId: string,
    body: { valuationId: string; offerAmountPaise: string | number; validUntil: string; terms?: string }
  ) => call<AcquisitionOfferItem>(u, `/sales/seller-leads/${leadId}/offers`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Acquisitions & Documents ---
  acquisitions: (u: User) => call<AcquisitionCase[]>(u, '/operations/acquisitions'),
  updateDocument: (
    u: User,
    caseId: string,
    body: {
      documentType: string;
      status: string;
      notes?: string;
      expectedVersion?: number;
    }
  ) => call<unknown>(u, `/operations/acquisitions/${caseId}/documents`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Settlement (Finance Role) ---
  updateSettlement: (
    u: User,
    caseId: string,
    body: {
      status: string;
      transactionReference?: string;
      notes?: string;
      expectedVersion?: number;
    }
  ) => call<unknown>(u, `/finance/acquisitions/${caseId}/settlement`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Vehicle Handover & Custody ---
  recordHandover: (
    u: User,
    caseId: string,
    body: {
      branchId?: string;
      status: 'SCHEDULED' | 'RECEIVED' | 'DISPUTED' | 'REJECTED';
      location: string;
      observedAt: string;
      registrationNumber?: string;
      odometerKm?: number;
      mainKeysReceived?: number;
      spareKeysReceived?: number;
      documentsReceived?: boolean;
      accessoriesNotes?: string;
      conditionNotes?: string;
      exceptionNotes?: string;
      expectedVersion?: number;
    }
  ) => call<unknown>(u, `/operations/acquisitions/${caseId}/handover`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Complete Acquisition Gate ---
  completeAcquisition: (
    u: User,
    caseId: string,
    body: { expectedVersion: number; completionNotes?: string }
  ) => call<unknown>(u, `/operations/acquisitions/${caseId}/complete`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Stock Inward ---
  stockInward: (
    u: User,
    caseId: string,
    body: { branchId: string; physicalLocation: string; notes?: string }
  ) => call<VehicleStockUnit>(u, `/operations/acquisitions/${caseId}/stock-inward`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Inventory & Stock Units ---
  inventory: (u: User) => call<VehicleStockUnit[]>(u, '/operations/inventory'),
  updateStockVehicleSpecs: (
    u: User,
    stockId: string,
    body: { registrationNumber?: string; variant?: string; color?: string; odometerKm?: number }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/vehicle-specs`, { method: 'PATCH', body: JSON.stringify(body) }),

  // --- Refurbishment Work Orders & Cost Approvals ---
  createWorkOrder: (
    u: User,
    stockId: string,
    body: {
      category: string;
      requiredAction: string;
      assignedProvider?: string;
      estimatedCostPaise?: number;
      notes?: string;
    }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/work-orders`, { method: 'POST', body: JSON.stringify(body) }),

  submitWorkOrderCost: (
    u: User,
    workOrderId: string,
    body: { expectedVersion: number; estimatedCostPaise: number; reason: string }
  ) => call<unknown>(u, `/operations/work-orders/${workOrderId}/cost-approval`, { method: 'POST', body: JSON.stringify(body) }),

  decideWorkOrderCost: (
    u: User,
    workOrderId: string,
    body: { expectedVersion: number; decision: 'APPROVE' | 'REJECT'; reason: string }
  ) => call<unknown>(u, `/operations/work-orders/${workOrderId}/cost-decision`, { method: 'POST', body: JSON.stringify(body) }),

  startWorkOrder: (u: User, workOrderId: string, expectedVersion: number) =>
    call<unknown>(u, `/operations/work-orders/${workOrderId}/start`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }),

  completeWorkOrder: (
    u: User,
    workOrderId: string,
    body: { expectedVersion: number; actualCostPaise?: number; notes?: string }
  ) => call<unknown>(u, `/operations/work-orders/${workOrderId}/complete`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Quality Control ---
  startQualityControl: (
    u: User,
    stockId: string,
    body: { workOrderId?: string; findings?: string; evidenceNotes?: string }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/qc`, { method: 'POST', body: JSON.stringify(body) }),

  decideQualityControl: (
    u: User,
    reportId: string,
    body: { expectedVersion: number; decision: 'PASS' | 'REWORK_REQUIRED' | 'FAIL'; findings?: string; evidenceNotes?: string }
  ) => call<unknown>(u, `/operations/quality-control/${reportId}/decision`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Branches & Showrooms ---
  branches: (u: User) => call<Branch[]>(u, '/operations/branches'),

  uploadListingPhoto: (u: User, body: { base64Data: string; mimeType: string; filename: string; folder: string }) =>
    call<{ secureUrl?: string; url?: string }>(u, '/media/upload', { method: 'POST', body: JSON.stringify(body) }),

  // --- Listing Studio & Publication Readiness ---
  prepareListing: (
    u: User,
    stockId: string,
    body: {
      title: string;
      color?: string;
      features?: string[];
      conditionSummary?: string;
      inspectionSummary?: string;
      verifiedTags?: string[];
      mediaUrls?: string[];
      branchId?: string;
      expectedVersion: number;
    }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/prepare-listing`, { method: 'POST', body: JSON.stringify(body) }),

  publishListing: (
    u: User,
    stockId: string,
    body: { retailPricePaise: string | number; branchId?: string; expectedVersion: number; title?: string }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/publish-listing`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Buyer Delivery ---
  deliverVehicle: (
    u: User,
    stockId: string,
    body: { buyerName: string; buyerPhone: string; odometerKm?: number; deliveryNotes?: string; expectedVersion: number }
  ) => call<unknown>(u, `/operations/inventory/${stockId}/deliver`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Test Drives ---
  testDrives: (u: User) => call<{ items: TestDrive[] } | TestDrive[]>(u, '/sales/test-drives?limit=50'),
  updateTestDriveStatus: (u: User, id: string, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') =>
    call<unknown>(u, `/sales/test-drives/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // --- Valuation & Acquisition Pricing Engine ---
  recommendValuation: (u: User, reportId: string) =>
    call<unknown>(u, `/valuations/inspection/${reportId}/recommend`, { method: 'POST' }),
  internalValuation: (u: User, valuationId: string) =>
    call<unknown>(u, `/valuations/${valuationId}/internal`),
  marketDataQuality: (u: User) =>
    call<unknown>(u, '/valuations/data/quality'),
  importMarketData: (u: User, body: unknown) =>
    call<unknown>(u, '/valuations/data/imports', { method: 'POST', body: JSON.stringify(body) }),
  pricingPolicy: (u: User) =>
    call<unknown>(u, '/valuations/policies'),
  updatePricingPolicy: (u: User, body: unknown) =>
    call<unknown>(u, '/valuations/policies/changes', { method: 'POST', body: JSON.stringify(body) }),

  // --- Car Service Operations ---
  serviceQueue: (u: User, query?: { hubId?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (query?.hubId) params.set('hubId', query.hubId);
    if (query?.status && query.status !== 'ALL') params.set('status', query.status);
    if (query?.search) params.set('search', query.search);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return call<ServiceQueueResponse>(u, `/operations/service/queue${qs}`);
  },
  serviceJobDetails: (u: User, id: string) =>
    call<ServiceJobItem>(u, `/operations/service/jobs/${id}`),
  scheduleServiceJob: (u: User, id: string, body: { advisorId?: string; scheduledDate: string; scheduledTimeSlot: string }) =>
    call<unknown>(u, `/operations/service/jobs/${id}/schedule`, { method: 'POST', body: JSON.stringify(body) }),
  dispatchServiceJob: (u: User, id: string, body: { driverId?: string; type: 'PICKUP' | 'RETURN'; scheduledTime?: string }) =>
    call<unknown>(u, `/operations/service/jobs/${id}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
  recordServiceCustody: (u: User, id: string, body: Record<string, any>) =>
    call<unknown>(u, `/operations/service/jobs/${id}/custody`, { method: 'POST', body: JSON.stringify(body) }),
  recordServiceDiagnosis: (u: User, id: string, body: Record<string, any>) =>
    call<unknown>(u, `/operations/service/jobs/${id}/diagnosis`, { method: 'POST', body: JSON.stringify(body) }),
  createServiceEstimate: (u: User, id: string, body: Record<string, any>) =>
    call<unknown>(u, `/operations/service/jobs/${id}/estimates`, { method: 'POST', body: JSON.stringify(body) }),
  recordServiceQc: (u: User, id: string, body: Record<string, any>) =>
    call<unknown>(u, `/operations/service/jobs/${id}/qc`, { method: 'POST', body: JSON.stringify(body) }),
  recordServiceReturn: (u: User, id: string, body: Record<string, any>) =>
    call<unknown>(u, `/operations/service/jobs/${id}/return`, { method: 'POST', body: JSON.stringify(body) }),
  recordServicePayment: (u: User, id: string, body: { amountPaise: string | number; paymentMethod: string; transactionReference?: string; notes?: string }) =>
    call<unknown>(u, `/operations/service/jobs/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Car Rental Operations ---
  rentalHubs: (u: User) =>
    call<Array<{ id: string; name: string; city: string; address: string; code: string; isActive: boolean }>>(u, '/rentals/hubs'),
  rentalSummary: (u: User) =>
    call<RentalOperationsSummary>(u, '/operations/rentals/summary'),
  rentalFleet: (u: User, query?: { hubId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (query?.hubId) params.set('hubId', query.hubId);
    if (query?.status) params.set('status', query.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return call<RentalFleetItem[]>(u, `/operations/rentals/fleet${qs}`);
  },
  createRentalFleetVehicle: (u: User, body: {
    fleetNumber?: string;
    registrationNumber: string;
    vin?: string;
    make: string;
    model: string;
    variant?: string;
    year: number;
    hubId: string;
    transmission: string;
    fuelType: string;
    seats: number;
    color: string;
    images?: string[];
    commercialPermitNumber?: string;
    commercialPermitExpiry?: string;
    insurancePolicyNumber?: string;
    insuranceExpiry?: string;
    fitnessCertExpiry?: string;
    baseDailyRatePaise: string | number;
    baseHourlyRatePaise?: string | number;
    securityDepositPaise?: string | number;
    includedKmPerDay?: number;
    includedDailyKm?: number;
    extraKmRatePaise?: string | number;
  }) => call<RentalFleetItem>(u, '/operations/rentals/fleet', { method: 'POST', body: JSON.stringify(body) }),
  updateRentalFleetVehicle: (u: User, id: string, body: {
    isEligibleForRental?: boolean;
    status?: string;
    baseDailyRatePaise?: string | number;
    securityDepositPaise?: string | number;
    includedKmPerDay?: number;
    hubId?: string;
  }) => call<RentalFleetItem>(u, `/operations/rentals/fleet/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createRentalBlock: (u: User, vehicleId: string, body: { startTime: string; endTime: string; reason: string; notes?: string }) =>
    call<unknown>(u, `/operations/rentals/fleet/${vehicleId}/blocks`, { method: 'POST', body: JSON.stringify(body) }),
  releaseRentalMaintenance: (u: User, vehicleId: string, notes?: string) =>
    call<RentalFleetItem>(u, `/operations/rentals/fleet/${vehicleId}/release-maintenance`, { method: 'POST', body: JSON.stringify({ notes }) }),
  releaseRentalBlock: (u: User, vehicleId: string, blockId: string) =>
    call<{ released: boolean; blockId: string }>(u, `/operations/rentals/fleet/${vehicleId}/blocks/${blockId}/release`, { method: 'POST' }),
  deleteRentalBlock: (u: User, vehicleId: string, blockId: string) =>
    call<{ deleted: boolean; blockId: string }>(u, `/operations/rentals/fleet/${vehicleId}/blocks/${blockId}`, { method: 'DELETE' }),
  rentalBookings: (u: User, query?: { hubId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (query?.hubId) params.set('hubId', query.hubId);
    if (query?.status) params.set('status', query.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return call<RentalBookingItem[]>(u, `/operations/rentals/bookings${qs}`);
  },
  rentalBookingDetails: (u: User, id: string) =>
    call<RentalBookingItem>(u, `/operations/rentals/bookings/${id}`),
  reviewRentalKyc: (u: User, bookingId: string, body: { status: 'VERIFIED' | 'REJECTED'; rejectionReason?: string }) =>
    call<unknown>(u, `/operations/rentals/bookings/${bookingId}/kyc/review`, { method: 'POST', body: JSON.stringify(body) }),
  recordRentalHandover: (u: User, bookingId: string, body: { odometerKm: number; fuelPercent: number; keyReleased: boolean; conditionNotes?: string; photos?: string[] }) =>
    call<unknown>(u, `/operations/rentals/bookings/${bookingId}/handover`, { method: 'POST', body: JSON.stringify(body) }),
  recordRentalReturn: (u: User, bookingId: string, body: {
    odometerKm: number;
    fuelPercent: number;
    keyReceived: boolean;
    conditionNotes?: string;
    photos?: string[];
    excessKm?: number;
    excessKmChargePaise?: string | number;
    damageChargePaise?: string | number;
    fuelRefillChargePaise?: string | number;
    lateReturnChargePaise?: string | number;
  }) => call<unknown>(u, `/operations/rentals/bookings/${bookingId}/return`, { method: 'POST', body: JSON.stringify(body) }),
  approveRentalExtension: (u: User, extensionId: string, body: { approved: boolean; reason?: string }) =>
    call<unknown>(u, `/operations/rentals/extensions/${extensionId}/approve`, { method: 'POST', body: JSON.stringify(body) }),
};
