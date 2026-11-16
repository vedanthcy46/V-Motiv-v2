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
  requestedDate?: string | null;
  timeSlot?: string | null;
  locationType: 'HUB' | 'HOME';
  address?: string | null;
  notes?: string | null;
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
    fuelType?: string | null;
    transmission?: string | null;
    color?: string | null;
    registrationYear?: number | null;
    registrationCity?: string | null;
    ownershipCount?: number | null;
    odometerKm?: number | null;
    inspectionDate?: string | null;
    inspectionTimeSlot?: string | null;
    inspectionLocationType?: 'HUB' | 'HOME' | null;
    inspectionAddress?: string | null;
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
    fuelType?: string;
    transmission?: string;
    color?: string | null;
    registrationYear?: number | null;
    registrationCity?: string | null;
    ownershipCount?: number | null;
    odometerKm?: number | null;
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
  branchId?: string | null;
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

/** What happened to each row of an opening-stock import (row = position among the cars sent, starting at 1). */
export type OpeningStockBulkResult = {
  dryRun: boolean;
  total: number;
  created: number;
  wouldCreate: number;
  failed: number;
  items: Array<{ row: number; registrationNumber: string; status: 'CREATED' | 'WOULD_CREATE' | 'FAILED'; stockId?: string; stockCode?: string; code?: string; message?: string }>;
};

export type VehicleStockUnit = {
  id: string;
  stockCode: string;
  /** Null for opening stock: a car the hub already owned before the app existed. */
  acquisitionCaseId?: string | null;
  source?: 'ACQUISITION' | 'OPENING_STOCK';
  vehicleId?: string | null;
  branchId?: string | null;
  branch?: Branch | null;
  status: 'RECEIVED' | 'REFURBISHMENT_PENDING' | 'IN_REFURBISHMENT' | 'QC_PENDING' | 'LISTING_PREPARATION' | 'LISTING_READY' | 'LISTED' | 'RESERVED' | 'SOLD' | 'ON_HOLD' | 'RETIRED';
  physicalLocation: string;
  registrationNumber?: string | null;
  make: string;
  model: string;
  variant?: string | null;
  /** Canonical code (HATCHBACK, SEDAN, SUV, MUV, COUPE, CONVERTIBLE); worked out from make and model when not set by hand. */
  bodyType?: string | null;
  /** What the listing still lacks before it can be published (computed by the server). */
  listingGaps?: Array<{ key: string; label: string }>;
  color?: string | null;
  registrationYear?: number | null;
  registrationCity?: string | null;
  ownershipCount?: number | null;
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
  status: ServiceEstimateStatus;
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

export type ServiceJobStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPOINTMENT_SCHEDULED'
  | 'PICKUP_DISPATCHED'
  | 'IN_TRANSIT_TO_HUB'
  | 'ARRIVED_AT_HUB'
  | 'CHECKED_IN'
  | 'DIAGNOSIS_IN_PROGRESS'
  | 'ESTIMATE_PENDING_APPROVAL'
  | 'ESTIMATE_APPROVED'
  | 'ESTIMATE_REJECTED'
  | 'PARTS_ORDERED'
  | 'WORK_IN_PROGRESS'
  | 'QC_PENDING'
  | 'QC_PASSED'
  | 'QC_REWORK_REQUIRED'
  | 'INVOICE_GENERATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'RETURN_DISPATCHED'
  | 'READY_FOR_COLLECTION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REQUESTED'
  | 'AWAITING_DISPATCH'
  | 'VEHICLE_RECEIVED'
  | 'DIAGNOSIS_PENDING'
  | 'ESTIMATE_PENDING'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED';

/** A vehicle custody reading recorded by the workshop (check-in or release). `fuelPercent` is null when the level was recorded as words. */
export type ServiceCustodyReading = {
  id: string;
  odometerKm: number;
  fuelPercent: number | null;
  fuelLabel?: string;
  exteriorNotes?: string | null;
  keyCount?: number | null;
  recordedAt?: string;
};

export type ServiceStepState = { open: boolean; phase: 'open' | 'locked' | 'done' | 'not_applicable'; reason: string | null };
export type ServiceJobItem = {
  id: string;
  /** Which steps are open now (from the server). A step opens only when the one before it is done. */
  steps?: Record<'SCHEDULE' | 'DISPATCH_PICKUP' | 'CHECK_IN' | 'DIAGNOSIS' | 'ESTIMATE' | 'WORK_ORDER' | 'QC' | 'INVOICE' | 'RELEASE', ServiceStepState>;
  requestNumber: string;
  categoryKey: string;
  status: ServiceJobStatus;
  scheduledDate: string;
  scheduledTimeSlot: string;
  // Same values as the database enum ServiceFulfillmentType.
  fulfillmentType: 'PICKUP_AND_RETURN' | 'SELF_DROP_AT_HUB';
  pickupAddress?: string | null;
  customerNotes?: string | null;
  customerSymptoms?: string | null;
  questionAnswers?: Record<string, any> | null;
  mediaUrls?: string[];
  emergencySafetyFlag?: boolean;
  safetyNotes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  customer?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  vehicle?: {
    id: string;
    make: string;
    model: string;
    variant?: string | null;
    year: number;
    registrationNumber?: string | null;
    fuelType?: string | null;
    odometerKm?: number | null;
  } | null;
  hub?: {
    id: string;
    name: string;
    city: string;
  } | null;
  assignedAdvisor?: {
    id: string;
    displayName?: string | null;
  } | null;
  assignedTechnician?: {
    id: string;
    displayName?: string | null;
  } | null;
  activeEstimate?: {
    id: string;
    version?: number;
    status: string;
    totalAmountPaise: string | number;
  } | null;
  estimates?: {
    id: string;
    totalAmountPaise: string | number;
    status: ServiceEstimateStatus;
    version?: number;
    validUntil?: string;
    respondedAt?: string | null;
    responseNotes?: string | null;
    items?: {
      id: string;
      itemType: string;
      description: string;
      quantity: number;
      unitRatePaise: string | number;
      lineTotalPaise: string | number;
      isMandatory?: boolean;
      isApprovedByCustomer?: boolean;
    }[];
  }[];
  /** What the car arrived with (latest check-in). */
  custodyRecord?: ServiceCustodyReading | null;
  /** What the car left with (latest release); null until it is released. */
  releaseRecord?: ServiceCustodyReading | null;
  qcRecord?: {
    id: string;
    isPassed: boolean;
    checklistNotes: string;
  } | null;
  paymentRecord?: {
    id: string;
    amountPaise: string | number;
    status: 'PENDING' | 'PAID_VERIFIED' | 'REFUNDED';
    paymentMethod: string;
  } | null;
  payments?: Array<{
    id: string;
    type: string;
    amountPaise: string | number;
    status: 'PENDING' | 'PAID_VERIFIED' | 'FAILED';
    paymentGateway?: string | null;
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    verifiedByFinanceId?: string | null;
    verifiedAt?: string | null;
    createdAt: string;
  }>;
  servicePaymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID_IN_FULL' | 'REFUNDED';
  depositStatus?: string;
  verifiedPaidPaise?: string | number;
  outstandingBalancePaise?: string | number;
  paymentPlanSnapshot?: {
    planId: string;
    payNowPaise?: string;
    balancePaise?: string;
    categoryTitle?: string;
    paidAt?: string | null;
  } | null;
  finalInvoiceId?: string | null;
  finalInvoice?: {
    id: string;
    invoiceNumber: string;
    totalAmountPaise: string | number;
    outstandingPaise: string | number;
    status: string;
  } | null;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    subtotalPaise: string | number;
    diagnosticFeeCreditPaise: string | number;
    priorPaymentsCreditedPaise: string | number;
    cgstPaise: string | number;
    sgstPaise: string | number;
    totalAmountPaise: string | number;
    outstandingPaise: string | number;
    status: string;
    issuedAt: string;
  }>;
  historyEvents?: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    title: string;
    description: string;
    actorRole?: string | null;
    createdAt: string;
  }>;
};

export type ServiceQueueResponse = {
  items: ServiceJobItem[];
  total: number;
  page: number;
  totalPages: number;
};

/** Mirrors the API enum ServiceEstimateStatus. */
export type ServiceEstimateStatus = 'DRAFT' | 'SENT_TO_CUSTOMER' | 'APPROVED' | 'DECLINED' | 'SUPERSEDED';

export type RentalAvailabilityState = 'AVAILABLE' | 'ON_HOLD' | 'BOOKED' | 'IN_TRIP' | 'MAINTENANCE' | 'CLEANING' | 'UNAVAILABLE';

export type RentalFleetAvailability = {
  state: RentalAvailabilityState;
  bookable: boolean;
  label: string;
  availableFrom: string | null;
  holdExpiresAt: string | null;
};

export type RentalFleetItem = {
  id: string;
  fleetNumber: string;
  registrationNumber: string;
  /** Optional: null when no VIN has been entered. */
  vin?: string | null;
  make: string;
  model: string;
  variant?: string | null;
  year: number;
  hubId: string;
  status: string;
  isEligibleForRental?: boolean;
  commercialPermitExpiry?: string | null;
  insuranceExpiry?: string | null;
  fitnessCertExpiry?: string | null;
  baseDailyRatePaise: string | number;
  securityDepositPaise: string | number;
  includedKmPerDay?: number;
  includedDailyKm?: number;
  extraKmRatePaise: string | number;
  seats: number;
  transmission: string;
  fuelType: string;
  color: string;
  odometerKm?: number;
  /** Fuel / charge level last recorded on the vehicle (%). */
  fuelLevelPercent?: number;
  images?: string[];
  features?: string[];
  commercialPermitNumber?: string | null;
  insurancePolicyNumber?: string | null;
  hub?: {
    id: string;
    name: string;
    city: string;
  };
  blocks?: {
    id: string;
    startTime: string;
    endTime: string;
    reason: string;
    notes?: string | null;
    createdAt: string;
  }[];
  activeBlock?: {
    id: string;
    startTime: string;
    endTime: string;
    reason: string;
    notes?: string | null;
  } | null;
  /** Present only when the fleet was requested for an interval. */
  availability?: RentalFleetAvailability | null;
  /** Where the km allowance / excess rate shown for this car come from (hub policy wins). */
  kmPolicySource?: { includedKm: 'HUB' | 'VEHICLE'; extraKmRate: 'HUB' | 'VEHICLE' };
};

export type RentalBookingItem = {
  id: string;
  bookingNumber: string;
  customerId: string;
  vehicleId: string;
  pickupHubId: string;
  returnHubId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'VEHICLE_COLLECTED' | 'TRIP_ACTIVE' | 'RETURN_INSPECTED' | 'SETTLED' | 'CANCELLED';
  kycStatus: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  baseFarePaise?: string | number;
  taxPaise?: string | number;
  paymentPlanSnapshot?: {
    planId: string;
    planName: string;
    advancePercentage: number;
    balancePercentage: number;
    policyVersion: string;
  } | null;
  rentalPaymentStatus?: 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID_IN_FULL' | 'REFUNDED' | string;
  depositStatus?: 'NOT_COLLECTED' | 'COLLECTED' | 'REFUND_QUEUED' | 'REFUNDED' | 'RETAINED' | string;
  balanceDueAt?: string | null;
  /** Kilometres included in this booking, and the rate charged per extra km (set when the booking was priced). */
  includedKm?: number;
  extraKmRatePaise?: string | number;
  verifiedPaidPaise?: string | number;
  outstandingBalancePaise?: string | number;
  pickupReadiness?: {
    isReady: boolean;
    reasons: string[];
    checklist: {
      bookingConfirmed: boolean;
      rentalPaymentComplete: boolean;
      driverEligible: boolean;
      vehicleReady: boolean;
    };
  };
  totalPayablePaise: string | number;
  securityDepositPaise: string | number;
  customer?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  vehicle?: RentalFleetItem;
  pickupHub?: {
    id: string;
    name: string;
    city: string;
  };
  driverVerification?: {
    id: string;
    licenseNumber: string;
    licenseExpiry: string;
    dateOfBirth: string;
    drivingExperienceYears: number;
    licenseFrontUrl?: string;
    licenseBackUrl?: string;
    status: string;
    rejectionReason?: string | null;
    verifiedAt?: string | null;
  } | null;
  trip?: {
    id: string;
    pickupTime?: string | null;
    pickupOdometerKm?: number | null;
    pickupFuelPercent?: number | null;
    pickupPhotos?: string[] | null;
    pickupNotes?: string | null;
    pickupCustomerSigned?: boolean;
    returnTime?: string | null;
    returnOdometerKm?: number | null;
    returnFuelPercent?: number | null;
    returnPhotos?: string[] | null;
    returnNotes?: string | null;
    returnCustomerSigned?: boolean;
    excessKm?: number;
    excessKmChargePaise?: string | number;
    fuelRefillChargePaise?: string | number;
    lateReturnChargePaise?: string | number;
    damageChargePaise?: string | number;
    totalAdditionalChargesPaise?: string | number;
    depositRefundPaise?: string | number;
    isSettled?: boolean;
    settledAt?: string | null;
  } | null;
  tripEvidence?: {
    id: string;
    pickupOdometerKm?: number;
    pickupFuelPercent?: number;
    pickupTime?: string;
    returnOdometerKm?: number;
    returnFuelPercent?: number;
    returnTime?: string;
    excessKm?: number;
    damageChargePaise?: string | number;
  } | null;
};

export type RentalOperationsSummary = {
  activeFleet: number;
  activeBookings: number;
  pendingKyc: number;
  returnsDueToday: number;
};

export type RentalPaymentDashboard = {
  partiallyPaidCount: number;
  fullyPaidCount: number;
  overdueCount: number;
  blockedPickupsCount: number;
  reconciliationPendingCount: number;
};

export type RentalPaymentSummary = {
  bookingId: string;
  bookingNumber: string;
  rentalPaymentStatus: string;
  depositStatus: string;
  rentalTotalPaise: string;
  verifiedPaidPaise: string;
  outstandingPaise: string;
  securityDepositPaise: string;
  balanceDueAt: string | null;
  isOverdue: boolean;
  paymentPlan: {
    planId: string;
    planName: string;
    advancePercentage: number;
    balancePercentage: number;
    policyVersion: string;
  } | null;
  pickupReadiness: {
    isReady: boolean;
    reasons: string[];
    checklist: {
      bookingConfirmed: boolean;
      rentalPaymentComplete: boolean;
      driverEligible: boolean;
      vehicleReady: boolean;
    };
  };
};

export type RentalPaymentSchedule = {
  bookingId: string;
  bookingNumber: string;
  rentalPaymentStatus?: string;
  currency?: string;
  rentalTotalPaise?: string;
  rentalTotalRupees?: number;
  installments: Array<{
    installmentNumber?: number;
    type: 'ADVANCE' | 'BALANCE' | 'FULL' | string;
    title?: string;
    percentage?: number;
    amountPaise: string;
    amountRupees?: number;
    status: 'PAID' | 'VERIFIED' | 'PENDING' | 'OVERDUE' | string;
    dueAt?: string | null;
    paidAt: string | null;
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
  }>;
};

export type RentalPaymentTransaction = {
  id: string;
  amountPaise: string;
  amountRupees?: number;
  status: string;
  provider?: string;
  paymentGateway?: string;
  reference?: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  installmentType: string | null;
  createdAt: string;
  verifiedAt?: string | null;
};
