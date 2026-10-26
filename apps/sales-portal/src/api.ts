import type { User } from 'firebase/auth';

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

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      q.append(key, String(val));
    }
  }
  return q.toString();
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

async function call<T>(user: User, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await user.getIdToken(!retry);
  const response = await fetch(`${base}/sales${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  if (response.status === 401 && retry) {
    await user.getIdToken(true);
    return call<T>(user, path, init, false);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ code: 'REQUEST_FAILED' }))) as { code?: string };
    throw new ApiError(response.status, body.code || 'REQUEST_FAILED');
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('application/json')) {
    throw new ApiError(response.status, 'INVALID_SERVER_RESPONSE');
  }

  return response.json() as Promise<T>;
}

export type Actor = {
  userId: string;
  email: string;
  displayName: string | null;
  employeeCode: string | null;
  roles: string[];
  branches: Array<{ id: string; code: string; name: string; city: string }>;
  globalScope: boolean;
};

export type DashboardData = {
  pipeline?: {
    submitted: number;
    qualifying: number;
    inspectionScheduled: number;
    offerPending: number;
    offered: number;
    accepted: number;
  };
  buyerPipeline?: {
    received: number;
    inReview: number;
    contacted: number;
    closed: number;
  };
  workQueue?: {
    tasksDueToday: number;
    tasksOverdue: number;
    upcomingTestDrives: number;
    activeReservations: number;
    eligibleInventory: number;
  };
  sellerFunnel?: Record<string, number>;
  buyerFunnel?: Record<string, number>;
  tasksDueToday: number;
  tasksOverdue?: number;
  upcomingTestDrives: number;
  unassignedCount: number;
  openOffersCount: number;
  pendingValuationsCount?: number;
  pendingDiscountsCount?: number;
  pendingReviewCount?: number;
  generatedAt: string;
};

export type NotificationData = {
  unassignedLeads: Array<{ id: string; referenceCode: string; make: string; model: string; city: string; createdAt: string }>;
  overdueTasks: Array<{ id: string; type: string; details: string; dueAt: string; lead?: { referenceCode: string } }>;
  pendingTestDrives: Array<{ id: string; requestedDate: string; timeSlot: string; user: { displayName: string | null }; listing: { title: string } }>;
  pendingDiscounts?: Array<{ id: string; quotationId: string; vehicleTitle: string; customerName: string; requestedDiscountPaise: string; createdAt: string }>;
  pendingOfferReviews?: Array<{ id: string; leadId: string; referenceCode: string; vehicleTitle: string; sellerName: string; city: string; recommendedPurchasePaise: string; createdAt: string }>;
  sentQuotations?: Array<{ id: string; quotationNumber: string; vehicleTitle: string; customerName: string; finalPricePaise: string; validUntil: string }>;
  totalUnread: number;
};

export type ReportsData = {
  sellerFunnel: Record<string, number>;
  buyerFunnel: Record<string, number>;
  inspectionsTotal: number;
  offersTotal: number;
  testDriveFunnel: Record<string, number>;
  generatedAt: string;
};

export type SellerLead = {
  id: string;
  referenceCode: string;
  sellerName: string;
  sellerPhone: string;
  city: string;
  pincode: string;
  make: string;
  model: string;
  variant: string | null;
  manufacturingYear: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  ownershipNumber: number;
  expectedPricePaise: string | null;
  status: string;
  inspectionDate: string | null;
  inspectionTimeSlot: string | null;
  createdAt: string;
  updatedAt: string;
  assignments?: Array<{
    id: string;
    employee: { id: string; user: { displayName: string | null; email: string } };
    assignedAt: string;
    releasedAt: string | null;
  }>;
  interactions?: Array<{
    id: string;
    channel: string;
    outcome: string;
    notes: string | null;
    createdAt: string;
    actor: { user: { displayName: string | null } };
  }>;
  tasks?: Array<{
    id: string;
    type: string;
    priority: string;
    status: string;
    details: string;
    dueAt: string;
  }>;
  inspectionRequests?: Array<{
    id: string;
    status: string;
    requestedDate: string | null;
    timeSlot: string | null;
    locationType: string;
  }>;
  acquisitionOffers?: Array<{
    id: string;
    offerAmountPaise: string;
    status: string;
    validUntil: string;
  }>;
};

export type LeadPage = {
  items: SellerLead[];
  total: number;
  page: number;
  totalPages: number;
};

export type BuyerLead = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    displayName: string | null;
    email: string;
    phone: string | null;
    preferredCity: string | null;
  };
  listing: {
    id: string;
    title: string;
    pricePaise: string;
    status: string;
    vehicle: {
      make: string;
      model: string;
      variant: string | null;
      manufacturingYear: number;
      fuelType: string;
      transmission: string;
      city: string | null;
      odometerKm: number;
    };
  };
};

export type BuyerLeadPage = {
  items: BuyerLead[];
  total: number;
  page: number;
  totalPages: number;
};

export type InventoryItem = {
  id: string;
  title: string;
  pricePaise: string;
  status: string;
  publishedAt: string | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    variant: string | null;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    city: string | null;
    registrationNumber: string | null;
    exteriorColor: string | null;
  };
  reservations?: Array<{
    id: string;
    reservationNumber?: string;
    status: string;
    expiresAt: string;
    notes?: string | null;
    customer?: {
      id: string;
      displayName: string | null;
      email: string;
      phone?: string | null;
    };
  }>;
};

export type InventoryPage = {
  items: InventoryItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type TestDrive = {
  id: string;
  status: string;
  requestedDate: string;
  timeSlot: string;
  customerNotes: string | null;
  executiveNotes: string | null;
  serviceCity: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
    email: string;
    phone: string | null;
  };
  listing: {
    id: string;
    title: string;
    pricePaise: string;
  };
  branch?: {
    name: string;
    city: string;
  } | null;
};

export type TestDrivePage = {
  items: TestDrive[];
  total: number;
  page: number;
  totalPages: number;
};

export type Quotation = {
  id: string;
  quotationNumber: string;
  status: string;
  chargesPaise: string;
  chargeBreakdown: Record<string, number> | null;
  discountPaise: string;
  totalPricePaise: string;
  validUntil: string;
  terms: string | null;
  createdAt: string;
  customer: {
    id: string;
    displayName: string | null;
    email: string;
    phone: string | null;
  };
  listing: {
    id: string;
    title: string;
    pricePaise: string;
    vehicle: {
      make: string;
      model: string;
      manufacturingYear: number;
      city: string | null;
    };
  };
  discounts?: Array<{
    id: string;
    requestedDiscountPaise: string;
    proposedPricePaise?: string;
    reason: string;
    status: string;
    decisionNotes: string | null;
    decidedAt?: string | null;
    reviewedAt?: string | null;
    reviewer?: { user: { displayName: string | null } } | null;
    decidedBy?: { user: { displayName: string | null } } | null;
  }>;
  latestDiscountRequest?: {
    id: string;
    requestedDiscountPaise: string;
    proposedPricePaise: string;
    reason: string;
    status: string;
    decisionNotes: string | null;
    decidedAt: string | null;
    decidedBy?: { displayName: string | null } | null;
  } | null;
};

export type ReviewItem = {
  id: string;
  type: 'VALUATION_OFFER' | 'QUOTATION_DISCOUNT';
  referenceId: string;
  referenceCode: string;
  title: string;
  partyName: string;
  amountPaise: string;
  status: string;
  decisionNotes?: string | null;
  decidedBy?: string | null;
  decidedAt: string;
};

export type ReviewRequestsData = {
  pendingValuations: Array<{
    id: string;
    leadId: string;
    referenceCode: string;
    vehicleTitle: string;
    sellerName: string;
    sellerPhone: string;
    recommendedPurchasePaise: string;
    expectedResalePaise: string;
    notes?: string | null;
    status: string;
    requestedBy: string;
    createdAt: string;
  }>;
  pendingDiscounts: Array<{
    id: string;
    quotationId: string;
    quotationNumber: string;
    vehicleTitle: string;
    customerName: string;
    requestedDiscountPaise: string;
    proposedPricePaise: string;
    reason: string;
    status: string;
    requestedBy: string;
    createdAt: string;
  }>;
  recentDecisions: ReviewItem[];
};

export type ValuationItem = {
  id: string;
  leadId: string;
  version: number;
  inspectionReportId: string;
  expectedResalePaise: string;
  refurbishmentPaise: string;
  otherCostsPaise: string;
  requiredMarginPaise: string;
  recommendedPurchasePaise: string;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  lead?: {
    id: string;
    referenceCode: string;
    make: string;
    model: string;
    manufacturingYear: number;
    city: string;
    sellerName: string;
    sellerPhone: string;
    expectedPricePaise?: string | null;
  };
  createdBy?: { user: { displayName: string | null; email: string } } | null;
  approvedBy?: { user: { displayName: string | null; email: string } } | null;
};

export type QuotationPage = {
  items: Quotation[];
  total: number;
  page: number;
  totalPages: number;
};

export type Reservation = {
  id: string;
  reservationNumber: string;
  status: string;
  expiresAt: string;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    displayName: string | null;
    email: string;
    phone: string | null;
  };
  listing: {
    id: string;
    title: string;
    pricePaise: string;
  };
};

export type ReservationPage = {
  items: Reservation[];
  total: number;
  page: number;
  totalPages: number;
};

export type Customer = {
  id: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  preferredCity: string | null;
  createdAt: string;
  acquisitionLeads?: Array<{ id: string; referenceCode: string; make: string; model: string; status: string }>;
  purchaseEnquiries?: Array<{ id: string; status: string; listing: { title: string } }>;
  testDriveRequests?: Array<{ id: string; status: string; requestedDate: string; listing: { title: string } }>;
  addresses?: Array<{ id: string; label: string; line1: string; city: string; state: string; pincode: string }>;
  emailOutbox?: Array<{ id: string; subject: string; text: string; templateVersion: string; state: string; attempts: number; createdAt: string; lastErrorCode?: string | null }>;
  notifications?: Array<{ id: string; title: string; body: string; category: string; eventType: string; read: boolean; createdAt: string }>;
};

export type CustomerPage = {
  items: Customer[];
  total: number;
  page: number;
  totalPages: number;
};

export type Task = {
  id: string;
  type: string;
  priority: string;
  status: string;
  details: string;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  dueAt: string;
  completedAt: string | null;
  lead?: {
    id: string;
    referenceCode: string;
    sellerName: string;
    sellerPhone: string;
    city: string;
  };
};

export type InspectionRequestItem = {
  id: string;
  leadId: string;
  status: string;
  requestedDate: string | null;
  timeSlot: string | null;
  locationType: string;
  address: string | null;
  notes: string | null;
  createdAt: string;
  lead: {
    id: string;
    referenceCode: string;
    make: string;
    model: string;
    city: string;
    sellerName: string;
    sellerPhone: string;
  };
  branch?: {
    id: string;
    name: string;
    city: string;
  } | null;
};

export type AcquisitionOfferItem = {
  id: string;
  leadId: string;
  offerAmountPaise: string;
  status: string;
  version: number;
  validUntil: string;
  terms: string | null;
  declineReason: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  lead: {
    id: string;
    referenceCode: string;
    make: string;
    model: string;
    city: string;
    sellerName: string;
    sellerPhone: string;
  };
};

export const salesApi = {
  me: (user: User) => call<Actor>(user, '/me'),
  dashboard: (user: User) => call<DashboardData>(user, '/dashboard'),
  notifications: (user: User) => call<NotificationData>(user, '/notifications'),
  reports: (user: User) => call<ReportsData>(user, '/reports'),

  // Seller Leads
  sellerLeads: (user: User, params: { page?: number; limit?: number; search?: string; status?: string; city?: string; unassigned?: boolean } = {}) =>
    call<LeadPage>(user, `/seller-leads?${query(params)}`),
  createSellerLead: (user: User, input: {
    sellerName: string;
    sellerPhone: string;
    city: string;
    pincode: string;
    make: string;
    model: string;
    variant?: string;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    expectedPricePaise?: string;
    sellerNotes?: string;
  }) => call<SellerLead>(user, '/seller-leads', { method: 'POST', body: JSON.stringify(input) }),
  sellerLead: (user: User, id: string) => call<SellerLead>(user, `/seller-leads/${id}`),
  updateSellerLeadStatus: (user: User, id: string, status: string, note?: string) =>
    call<SellerLead>(user, `/seller-leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
  claimSellerLead: (user: User, id: string) =>
    call<{ id: string; leadId: string }>(user, `/seller-leads/${id}/claim`, { method: 'POST' }),
  assignSellerLead: (user: User, id: string, employeeId: string, reason?: string) =>
    call<{ id: string }>(user, `/seller-leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ employeeId, reason }) }),
  qualifySellerLead: (user: User, id: string, qualified: boolean, reasonCode: string, notes?: string) =>
    call<SellerLead>(user, `/seller-leads/${id}/qualify`, { method: 'POST', body: JSON.stringify({ qualified, reasonCode, notes }) }),

  // Interactions & Tasks
  interactions: (user: User, leadId: string) => call<Array<NonNullable<SellerLead['interactions']>[number]>>(user, `/seller-leads/${leadId}/interactions`),
  createInteraction: (user: User, leadId: string, input: { channel: string; outcome: string; notes?: string }) =>
    call<NonNullable<SellerLead['interactions']>[number]>(user, `/seller-leads/${leadId}/interactions`, { method: 'POST', body: JSON.stringify(input) }),
  tasks: (user: User, params: { status?: string; overdue?: boolean; leadId?: string } = {}) =>
    call<Task[]>(user, `/tasks?${query(params)}`),
  createTask: (user: User, leadId: string, input: { type: string; priority?: string; dueAt: string; details: string; expectedOutcome?: string }) =>
    call<Task>(user, `/seller-leads/${leadId}/tasks`, { method: 'POST', body: JSON.stringify(input) }),
  completeTask: (user: User, id: string, actualOutcome: string) =>
    call<Task>(user, `/tasks/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ actualOutcome }) }),

  // Inspections
  allInspectionRequests: (user: User, params: { page?: number; limit?: number; status?: string } = {}) =>
    call<{ items: InspectionRequestItem[]; total: number; page: number; totalPages: number }>(user, `/inspection-requests?${query(params)}`),
  requestInspection: (user: User, leadId: string, input: { locationType: 'HUB' | 'HOME'; requestedDate?: string; timeSlot?: string; address?: string; notes?: string }) =>
    call<{ id: string; status: string }>(user, `/seller-leads/${leadId}/inspection-requests`, { method: 'POST', body: JSON.stringify(input) }),
  inspectionSummary: (user: User, leadId: string) =>
    call<{
      lead: SellerLead;
      hasCompletedInspection: boolean;
      approvedInspection: unknown;
      requests: unknown[];
    }>(user, `/seller-leads/${leadId}/inspection-summary`),

  // Offers & Valuations
  allAcquisitionOffers: (user: User, params: { page?: number; limit?: number; status?: string } = {}) =>
    call<{ items: AcquisitionOfferItem[]; total: number; page: number; totalPages: number }>(user, `/acquisition-offers?${query(params)}`),
  getAcquisitionOffers: (user: User, leadId: string) =>
    call<Array<{ id: string; offerAmountPaise: string; status: string; validUntil: string; terms: string | null; createdAt: string }>>(user, `/seller-leads/${leadId}/offers`),
  proposeAcquisitionOffer: (user: User, leadId: string, input: { valuationId?: string; offerAmountPaise: string; validUntil?: string; terms?: string; reason?: string }) =>
    call<{ id: string; status: string; message?: string }>(user, `/seller-leads/${leadId}/offers`, { method: 'POST', body: JSON.stringify(input) }),
  recordOfferResponse: (user: User, leadId: string, offerId: string, input: { decision: 'ACCEPTED' | 'DECLINED'; declineReason?: string }) =>
    call<{ id: string; status: string }>(user, `/seller-leads/${leadId}/offers/${offerId}/decision`, { method: 'POST', body: JSON.stringify(input) }),
  getValuations: (user: User, leadId: string) =>
    call<ValuationItem[]>(user, `/seller-leads/${leadId}/valuations`),
  allValuations: (user: User, params: { page?: number; limit?: number; status?: string } = {}) =>
    call<{ items: ValuationItem[]; total: number; page: number; totalPages: number }>(user, `/valuations?${query(params)}`),
  reviewRequests: (user: User) =>
    call<ReviewRequestsData>(user, '/review-requests'),

  // Buyer Leads
  buyerLeads: (user: User, params: { page?: number; limit?: number; search?: string; status?: string } = {}) =>
    call<BuyerLeadPage>(user, `/buyer-leads?${query(params)}`),
  buyerLead: (user: User, id: string) => call<BuyerLead>(user, `/buyer-leads/${id}`),
  updateBuyerStatus: (user: User, id: string, status: string) =>
    call<BuyerLead>(user, `/buyer-leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Inventory
  inventory: (user: User, params: { page?: number; limit?: number; search?: string; city?: string } = {}) =>
    call<InventoryPage>(user, `/inventory?${query(params)}`),
  inventoryItem: (user: User, id: string) => call<InventoryItem>(user, `/inventory/${id}`),

  // Test Drives
  testDrives: (user: User, params: { page?: number; limit?: number; search?: string; status?: string } = {}) =>
    call<TestDrivePage>(user, `/test-drives?${query(params)}`),
  requestTestDrive: (user: User, input: { listingId: string; customerId: string; requestedDate: string; timeSlot: string; locationPreference?: 'HUB' | 'HOME'; serviceCity?: string; customerNotes?: string }) =>
    call<TestDrive>(user, '/test-drives', { method: 'POST', body: JSON.stringify(input) }),
  updateTestDriveStatus: (user: User, id: string, input: { status: string; customerNotes?: string }) =>
    call<TestDrive>(user, `/test-drives/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),

  // Quotations & Discounts
  quotations: (user: User, params: { page?: number; limit?: number; search?: string; status?: string; customerId?: string; listingId?: string } = {}) =>
    call<QuotationPage>(user, `/quotations?${query(params)}`),
  quotation: (user: User, id: string) => call<Quotation>(user, `/quotations/${id}`),
  createQuotation: (user: User, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    chargesPaise?: string;
    chargeBreakdown?: Record<string, number>;
    validUntil: string;
    terms?: string;
  }) => call<Quotation>(user, '/quotations', { method: 'POST', body: JSON.stringify(input) }),
  updateQuotation: (user: User, id: string, input: { chargesPaise?: string; chargeBreakdown?: Record<string, number>; validUntil?: string; terms?: string }) =>
    call<Quotation>(user, `/quotations/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  submitQuotation: (user: User, id: string) =>
    call<Quotation>(user, `/quotations/${id}/submit`, { method: 'POST' }),
  requestDiscount: (user: User, quotationId: string, input: { requestedDiscountPaise: string; reason: string }) =>
    call<{ id: string; status: string }>(user, `/quotations/${quotationId}/discount-requests`, { method: 'POST', body: JSON.stringify(input) }),
  decideDiscount: (user: User, discountRequestId: string, input: { decision: 'APPROVE' | 'REJECT'; decisionNotes?: string }) =>
    call<{ id: string; status: string }>(user, `/quotations/discount-requests/${discountRequestId}/decision`, { method: 'POST', body: JSON.stringify(input) }),

  // Reservations
  reservations: (user: User, params: { page?: number; limit?: number; search?: string; status?: string } = {}) =>
    call<ReservationPage>(user, `/reservations?${query(params)}`),
  requestReservation: (user: User, input: { listingId: string; customerId: string; quotationId?: string; enquiryId?: string; expiresAt: string; notes?: string }) =>
    call<Reservation>(user, '/reservations', { method: 'POST', body: JSON.stringify(input) }),
  releaseReservation: (user: User, id: string, reason?: string) =>
    call<Reservation>(user, `/reservations/${id}/release`, { method: 'POST', body: JSON.stringify({ reason }) }),
  releaseListingReservation: (user: User, listingId: string, reason?: string) =>
    call<{ listing: unknown; reservation: unknown }>(user, `/listings/${listingId}/release-reservation`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Customers CRM
  customers: (user: User, params: { page?: number; limit?: number; search?: string } = {}) =>
    call<CustomerPage>(user, `/customers?${query(params)}`),
  customer: (user: User, id: string) => call<Customer>(user, `/customers/${id}`),

  // Communications & Notifications
  sendEmail: (user: User, input: { customerId: string; template: string; variables?: Record<string, string> }) =>
    call<{ id: string; state: string; queuedAt: string }>(user, '/communications/email', { method: 'POST', body: JSON.stringify(input) }),
  // In-App Inbox Notifications
  inboxNotifications: (user: User, page = 1) =>
    call<{ items: any[]; total: number; unreadCount: number }>(user, `/notifications?page=${page}&limit=20`),
  unreadInboxCount: (user: User) =>
    call<{ count: number }>(user, '/notifications/unread-count'),
  markNotificationRead: (user: User, id: string) =>
    call<{ success: boolean }>(user, `/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: (user: User) =>
    call<{ success: boolean }>(user, '/notifications/read-all', { method: 'POST' }),
};
