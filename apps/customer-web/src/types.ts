export interface VehicleMedia {
  id: string;
  listingId: string;
  url: string;
  mediaType: string;
  displayOrder: number;
}

export interface VehicleDetail {
  id: string;
  make: string;
  model: string;
  variant?: string;
  manufacturingYear: number;
  registrationYear?: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  color?: string;
  ownershipCount?: number;
  city: string;
  bodyType?: string;
  engineCapacityCc?: number;
  conditionSummary?: string;
  inspectionSummary?: string;
  inspectionReportUrl?: string;
  features?: string[];
  verifiedTags?: string[];
}

export interface ListingItem {
  id: string;
  vehicleId: string;
  title: string;
  pricePaise: string | number;
  currency: string;
  status: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  vehicle: VehicleDetail;
  media: VehicleMedia[];
  customerProfile?: {
    topFeatures?: string[];
    qualityReport?: { overallStatus: string; totalChecksCount: number; passedChecksCount: number; inspectedAt?: string | null; defects?: Array<{ category: string; severity: string; description: string; location?: string | null }> } | null;
    refurbishment?: Array<{ category: string; action: string; completedAt?: string | null }>;
    qualityControl?: { status: string; findings?: string | null; reviewedAt?: string | null } | null;
  } | null;
  isWishlisted?: boolean;
}

export interface InventoryResponse {
  items: ListingItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CityItem {
  id: string;
  name: string;
}

export interface SellCarInput {
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
  expectedPricePaise?: number;
  ownershipCount?: number;
  inspectionLocationType?: 'HUB' | 'HOME';
  inspectionAddress?: string;
  sellerNotes?: string;
}

export interface DriveRequestInput {
  listingId: string;
  requestedDate: string;
  timeSlot: '10:00-12:00' | '12:00-14:00' | '15:00-17:00';
  serviceCity: string;
  locationPreference: 'HUB' | 'HOME';
  address?: string;
  customerNotes?: string;
}

export interface EnquiryInput {
  listingId: string;
  message: string;
}

export type DriveRequestStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface UserTestDrive {
  id: string;
  requestedDate: string;
  timeSlot: string;
  status: DriveRequestStatus;
  serviceCity: string;
  locationPreference: 'HUB' | 'HOME';
  address?: string | null;
  customerNotes?: string | null;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    pricePaise: string | number;
    currency: string;
  };
}

export interface UserPurchaseEnquiry {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    pricePaise: string | number;
    currency: string;
  };
}
