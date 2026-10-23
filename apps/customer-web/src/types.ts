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
