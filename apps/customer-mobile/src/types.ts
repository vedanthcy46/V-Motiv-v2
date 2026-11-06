export type Profile = {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  status: 'ACTIVE';
  marketingConsent: boolean;
  preferredCity: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  createdAt: string;
  employee?: {
    role: string;
    active: boolean;
    permissions: string[];
    locationIds?: string[];
  } | null;
};

export type InspectionDefectItem = {
  id: string;
  title: string;
  category: string;
  location: string;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  repaired: boolean;
  actionTaken: string;
  description: string;
  photoUrl: string;
};

export type InspectionSystemAudit = {
  name: string;
  pointsCount: number;
  status: string;
  highlights: string;
  rating: string;
};

export type InspectionAuditDetails = {
  certificationBadge: string;
  certificationScore: string;
  overallStatus: string;
  totalChecksCount: number;
  passedChecksCount: number;
  imperfectionsCount: number;
  inspectedDate: string;
  leadInspector: string;
  engineerSummary: string;
  conditionSummary: string;
  reportUrl: string | null;
  systems: InspectionSystemAudit[];
  defects: InspectionDefectItem[];
};

export type CustomerVehicleProfile = {
  version?: number;
  generatedAt?: string;
  basicInformation?: {
    registrationNumber?: string | null;
    manufacturingYear?: number;
    odometerKm?: number;
    fuelType?: string;
    transmission?: string;
    variant?: string | null;
    model?: string;
    make?: string;
    registrationYear?: number | null;
    registrationCity?: string | null;
    ownershipCount?: number | null;
  };
  specifications?: {
    color?: string | null;
    bodyType?: string | null;
    engineCapacityCc?: number | null;
  };
  topFeatures?: string[];
  qualityReport?: {
    source?: string;
    inspectedAt?: string | null;
    overallStatus: string;
    totalChecksCount: number;
    passedChecksCount: number;
    defects?: Array<{
      category: string;
      severity: string;
      description: string;
      location?: string | null;
    }>;
    evidence?: Array<{ mimeType: string; url: string }>;
    summary?: string | null;
  } | null;
  refurbishment?: Array<{
    category: string;
    action: string;
    completedAt?: string | null;
    notes?: string | null;
  }>;
  qualityControl?: {
    status: string;
    findings?: string | null;
    evidenceNotes?: string | null;
    reviewedAt?: string | null;
  } | null;
  customerConditionSummary?: string | null;
};

export type ShowroomBranch = {
  id: string;
  code?: string;
  name: string;
  city: string;
  address?: string;
};

export type VehicleSummary = {
  id: string;
  title: string;
  pricePaise: string;
  /** What the price was when first listed; set only when the price has since dropped. */
  originalPricePaise?: string | null;
  discountPercent?: number | null;
  savingsPaise?: string | null;
  currency: 'INR';
  publishedAt: string;
  isWishlisted: boolean;
  status?: string;
  isHeld?: boolean;
  holdDetails?: {
    isHeld: boolean;
    status: string;
    expiresAt: string | null;
    message: string;
  } | null;
  inspectionDetails?: InspectionAuditDetails | null;
  customerProfile?: CustomerVehicleProfile | null;
  branch?: ShowroomBranch | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    variant: string;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    color: string | null;
    ownershipCount: number | null;
    city: string | null;
    registrationYear: number | null;
    bodyType: string | null;
    engineCapacityCc: number | null;
    conditionSummary: string | null;
    inspectionSummary: string | null;
    inspectionReportUrl: string | null;
    features: string[];
    verifiedTags: string[];
    registrationNumber?: string | null;
  };
  media: Array<{ id: string; url: string; mediaType: 'IMAGE'; displayOrder: number }>;
};

export type InventoryPage = {
  items: VehicleSummary[]; total: number; page: number; limit: number; totalPages: number;
  /** True when the server could not be reached and these cars come from the copy saved on the device. */
  fromCache?: boolean;
  /** When the saved copy was last updated from the server (epoch ms); set with fromCache. */
  syncedAt?: number;
};
export type RequestStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type TestDrive = {
  id: string;
  /** Who will take the customer on the drive. Set only once the drive is confirmed. */
  executive?: { name: string; phone: string | null } | null;
  requestedDate: string;
  timeSlot: string;
  status: RequestStatus;
  customerNotes: string | null;
  serviceCity: string;
  locationPreference: 'HUB' | 'HOME';
  address: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  listing: {
    id: string;
    title: string;
    pricePaise: string;
    currency: string;
    status?: string;
    vehicle?: {
      make: string;
      model: string;
      variant?: string | null;
      manufacturingYear: number;
      fuelType: string;
      transmission: string;
      odometerKm: number;
      color?: string | null;
      city?: string | null;
      verifiedTags?: string[];
    };
    media?: Array<{ id: string; url: string }>;
  };
};
export type AcquisitionOffer = {
  id: string;
  leadId: string;
  offerAmountPaise: string;
  validUntil: string;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  version: number;
  terms: string | null;
  declineReason: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
};

export type InspectionSummaryInfo = {
  id: string;
  status: 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assignmentStatus: string | null;
  reportStatus: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  locationType?: string | null;
  address?: string | null;
  isCompleted: boolean;
};

export type SellingRequest = {
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
  expectedPricePaise: string | null;
  ownershipCount: number | null;
  registrationYear: number | null;
  color: string | null;
  registrationCity: string | null;
  loanOutstanding: boolean | null;
  accidentHistory: 'YES' | 'NO' | 'NOT_SURE' | null;
  serviceHistory: 'COMPLETE' | 'PARTIAL' | 'NOT_SURE' | null;
  sellerNotes: string | null;
  registrationNumber?: string | null;
  inspectionDate: string | null;
  inspectionTimeSlot: string | null;
  inspectionLocationType: 'HUB' | 'HOME' | null;
  inspectionAddress: string | null;
  status: 'SUBMITTED' | 'QUALIFYING' | 'INSPECTION_SCHEDULED' | 'OFFER_PENDING' | 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  cancelledAt: string | null;
  createdAt: string;
  offers: AcquisitionOffer[];
  inspection?: InspectionSummaryInfo | null;
};
export type BuyerQuotationSummary = {
  id: string;
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | string;
  basePricePaise: string;
  chargesPaise: string;
  discountPaise: string;
  finalAmountPaise: string;
  validUntil: string;
  terms: string | null;
  createdAt: string;
  authorName?: string;
  authorEmail?: string | null;
  authorPhone?: string | null;
};
/** A quotation Sales sent the customer, with what the app needs to show it and let them answer. */
export type CustomerQuotation = BuyerQuotationSummary & {
  canRespond: boolean;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  customerResponseNotes?: string | null;
  listing: {
    id: string;
    title: string;
    pricePaise: string;
    thumbnail: string | null;
    vehicle?: { make: string; model: string; variant?: string | null; manufacturingYear: number; fuelType: string; transmission: string; odometerKm: number } | null;
  } | null;
};
export type PurchaseEnquiry = {
  id: string;
  message: string | null;
  status: 'RECEIVED' | 'IN_REVIEW' | 'CONTACTED' | 'CLOSED' | string;
  createdAt: string;
  updatedAt?: string;
  listing: {
    id: string;
    title: string;
    pricePaise: string;
    currency: string;
    publishedAt?: string;
    vehicle?: {
      make: string;
      model: string;
      variant: string;
      manufacturingYear: number;
      fuelType: string;
      transmission: string;
      odometerKm: number;
      color: string | null;
      city: string | null;
      verifiedTags?: string[];
      conditionSummary?: string | null;
      inspectionSummary?: string | null;
      inspectionReportUrl?: string | null;
    };
    media?: Array<{ id: string; url: string }>;
  };
  quotations?: BuyerQuotationSummary[];
  reservations?: Array<{ id: string; status: string; expiresAt: string; createdAt: string }>;
};
export type SupportCase = { id: string; referenceCode: string; subject: string; category: string; description: string; status: string; createdAt: string; updatedAt: string };
export type SupportReply = { id: string; authorType: string; body: string; createdAt: string };
export type SupportCaseDetail = SupportCase & { replies: SupportReply[] };
export type SavedSearch = { id: string; name: string; query: Record<string, unknown>; createdAt: string };
export type SupportedCity = { id: string; name: string };
export type CustomerAddress = { id: string; label: string; addressLine: string; city: string; pincode: string; createdAt: string };
export type ActivityItem = {
  id: string;
  kind: 'TEST_DRIVE' | 'SELLING' | 'PURCHASE' | 'SUPPORT';
  status: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  reference: string;
  listingId?: string;
  registrationNumber?: string | null;
  variant?: string | null;
  color?: string | null;
  registrationYear?: number | null;
  registrationCity?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  odometerKm?: number | null;
};
export type ActivityPage = { items: ActivityItem[]; total: number; page: number; limit: number; totalPages: number };
