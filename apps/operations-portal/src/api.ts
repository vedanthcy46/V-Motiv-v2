import type { User } from 'firebase/auth';
import type {
  AcquisitionCase,
  AcquisitionOfferItem,
  Branch,
  DashboardMetrics,
  InspectionRequest,
  InspectorEmployee,
  SellerLeadValuation,
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
    body: { branchId?: string; physicalLocation: string; notes?: string }
  ) => call<VehicleStockUnit>(u, `/operations/acquisitions/${caseId}/stock-inward`, { method: 'POST', body: JSON.stringify(body) }),

  // --- Inventory & Stock Units ---
  inventory: (u: User) => call<VehicleStockUnit[]>(u, '/operations/inventory'),

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
};
