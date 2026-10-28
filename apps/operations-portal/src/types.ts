export type UserRole =
  | 'OPERATIONS_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'PRICING_APPROVER'
  | 'LISTING_EXECUTIVE'
  | 'INSPECTOR'
  | 'INSPECTION_REVIEWER'
  | 'FINANCE'
  | 'SALES_EXECUTIVE'
  | 'ADMIN'
  | 'SUPER_ADMIN';

export type DashboardMetrics = {
  unassigned: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  acquisitions?: {
    documentationRequired: number;
    settlementReady: number;
    handoverReady: number;
    completed: number;
    onHold: number;
  };
  stock?: {
    received: number;
    refurbishmentPending: number;
    inRefurbishment: number;
    qcPending: number;
    listingPreparation: number;
    listingReady: number;
    listed: number;
    reserved: number;
    sold: number;
  };
  refurbishment?: {
    pendingCostApprovals: number;
  };
  recentEvents?: AuditEvent[];
  generatedAt: string;
};

export type InspectionRequest = {
  id: string;
  branchId?: string | null;
  status: 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: string | null;
  locationType: 'HUB' | 'HOME';
  address?: string | null;
  createdAt: string;
  lead: {
    id: string;
    referenceCode: string;
    sellerName: string;
    sellerPhone?: string | null;
    city: string;
    make: string;
    model: string;
    variant?: string | null;
    manufacturingYear: number;
    fuelType?: string | null;
    odometerKm?: number | null;
  };
  assignment?: {
    id: string;
    status: 'ASSIGNED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED';
    inspectorId: string;
    scheduledAt?: string | null;
    locationType: 'HUB' | 'HOME';
    address?: string | null;
    instructions?: string | null;
    inspector?: {
      user: {
        displayName?: string | null;
        email: string;
      };
    };
  } | null;
  reports?: {
    id: string;
    revision: number;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REWORK_REQUIRED';
    submittedAt?: string | null;
  }[];
};

export type Branch = {
  id: string;
  code: string;
  name: string;
  city: string;
  address?: string | null;
  active: boolean;
};

export type InspectorEmployee = {
  userId: string;
  email: string;
  displayName?: string | null;
  phone?: string | null;
  activeLoadCount: number;
  branches: { id: string; name: string; city: string }[];
};

export type AcquisitionCase = {
  id: string;
  caseReference: string;
  leadId: string;
  offerId: string;
  status: 'DOCUMENTATION_REQUIRED' | 'SETTLEMENT_READY' | 'HANDOVER_READY' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  settlementStatus: 'NOT_READY' | 'READY_FOR_PAYMENT' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFIED' | 'PAYMENT_FAILED' | 'CANCELLED';
  custodyStatus: 'PENDING' | 'SCHEDULED' | 'RECEIVED' | 'DISPUTED' | 'REJECTED';
  completedAt?: string | null;
  completionNotes?: string | null;
  version: number;
  createdAt: string;
  lead: {
    id: string;
    referenceCode: string;
    sellerName: string;
    sellerPhone?: string | null;
    city: string;
    make: string;
    model: string;
    variant?: string | null;
    manufacturingYear: number;
    registrationNumber?: string | null;
  };
  offer: {
    id: string;
    offerAmountPaise: string | number;
    validUntil: string;
    acceptedAt?: string | null;
    version: number;
  };
  documents: AcquisitionDocument[];
  settlement?: AcquisitionSettlement | null;
  handover?: VehicleHandover | null;
  stockUnit?: VehicleStockUnit | null;
};

export type AcquisitionDocument = {
  id: string;
  acquisitionCaseId: string;
  documentType: 'SELLER_IDENTITY' | 'VEHICLE_REGISTRATION' | 'SELLER_AUTHORITY' | 'LIEN_OR_HYPOTHECATION' | 'PURCHASE_AGREEMENT' | string;
  status: 'REQUESTED' | 'RECEIVED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'MISMATCH' | 'WAIVED_BY_AUTHORIZED_POLICY';
  notes?: string | null;
  version: number;
  reviewedAt?: string | null;
};

export type AcquisitionSettlement = {
  id: string;
  acquisitionCaseId: string;
  approvedConsiderationPaise: string | number;
  status: 'NOT_READY' | 'READY_FOR_PAYMENT' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFIED' | 'PAYMENT_FAILED' | 'CANCELLED';
  transactionReference?: string | null;
  notes?: string | null;
  verifiedAt?: string | null;
  version: number;
};

export type VehicleHandover = {
  id: string;
  acquisitionCaseId: string;
  status: 'PENDING' | 'SCHEDULED' | 'RECEIVED' | 'DISPUTED' | 'REJECTED';
  location: string;
  observedAt: string;
  registrationNumber?: string | null;
  odometerKm?: number | null;
  mainKeysReceived: number;
  spareKeysReceived: number;
  documentsReceived: boolean;
  accessoriesNotes?: string | null;
  conditionNotes?: string | null;
  exceptionNotes?: string | null;
  version: number;
};

export type VehicleStockUnit = {
  id: string;
  stockCode: string;
  acquisitionCaseId: string;
  vehicleId?: string | null;
  branchId?: string | null;
  branch?: Branch | null;
  status: 'RECEIVED' | 'REFURBISHMENT_PENDING' | 'IN_REFURBISHMENT' | 'QC_PENDING' | 'LISTING_PREPARATION' | 'LISTING_READY' | 'LISTED' | 'RESERVED' | 'SOLD' | 'ON_HOLD' | 'RETIRED';
  physicalLocation: string;
  registrationNumber?: string | null;
  make: string;
  model: string;
  variant?: string | null;
  manufacturingYear: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  acquisitionCostPaise: string | number;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deliveryRecord?: {
    buyerName: string;
    buyerPhone: string;
    odometerKm: number;
    deliveredAt: string;
    deliveredBy: string;
  } | null;
  workOrders?: RefurbishmentWorkOrder[];
  qualityControlReports?: QualityControlReport[];
  vehicle?: {
    id: string;
    color?: string | null;
    conditionSummary?: string | null;
    features?: string[];
    listing?: {
      id: string;
      title: string;
      status: string;
      pricePaise: string | number;
      media?: { id: string; url: string; displayOrder: number }[];
    } | null;
  } | null;
  acquisitionCase?: {
    id: string;
    caseReference: string;
    status: string;
    settlementStatus: string;
    custodyStatus: string;
    lead?: {
      id: string;
      referenceCode: string;
      sellerName: string;
      sellerPhone?: string | null;
      city: string;
    } | null;
  } | null;
};

export type RefurbishmentWorkOrder = {
  id: string;
  stockUnitId: string;
  createdByEmployeeId: string;
  category: string;
  requiredAction: string;
  assignedProvider?: string | null;
  estimatedCostPaise?: string | number | null;
  actualCostPaise?: string | number | null;
  status: 'DRAFT' | 'PENDING_COST_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  version: number;
  createdAt: string;
  costApproval?: RefurbishmentCostApproval | null;
};

export type RefurbishmentCostApproval = {
  id: string;
  workOrderId: string;
  requestedByEmployeeId: string;
  decidedByEmployeeId?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  decidedAt?: string | null;
  version: number;
};

export type QualityControlReport = {
  id: string;
  stockUnitId: string;
  workOrderId?: string | null;
  reviewerEmployeeId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'REWORK_REQUIRED' | 'FAILED';
  findings?: string | null;
  evidenceNotes?: string | null;
  reviewedAt?: string | null;
  version: number;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    email?: string | null;
    displayName?: string | null;
  } | null;
};

export type TestDrive = {
  id: string;
  listingId: string;
  customerId: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  requestedDate: string;
  timeSlot: string;
  locationPreference: 'HUB' | 'HOME';
  serviceCity?: string | null;
  customerNotes?: string | null;
  listing?: {
    id: string;
    title: string;
    pricePaise: string | number;
  };
  customer?: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email: string;
  };
};

export type SellerLeadValuation = {
  id: string;
  leadId: string;
  inspectionReportId: string;
  expectedResalePaise: string | number;
  refurbishmentPaise: string | number;
  otherCostsPaise: string | number;
  requiredMarginPaise: string | number;
  recommendedPurchasePaise: string | number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  notes?: string | null;
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  version: number;
  createdAt: string;
};

export type AcquisitionOfferItem = {
  id: string;
  leadId: string;
  valuationId: string;
  offerAmountPaise: string | number;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  validUntil: string;
  terms?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  createdAt: string;
  version: number;
  lead?: {
    id: string;
    referenceCode: string;
    sellerName: string;
    make: string;
    model: string;
  };
};
