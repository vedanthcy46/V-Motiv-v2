import { api } from '../api';

export interface RentalHub {
  id: string;
  name: string;
  city: string;
  address: string;
  operatingHours: string;
  phone?: string | null;
  isActive: boolean;
}

export interface RentalQuote {
  vehicleId: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  billableDays: number;
  remainderHours: number;
  baseFarePaise: string | number;
  taxPaise: string | number;
  securityDepositPaise: string | number;
  totalPayablePaise: string | number;
  includedKm: number;
  extraKmRatePaise: string | number;
  termsVersion: string;
  validUntil: string;
  quoteVersion: number;
}

export interface RentalFleetVehicle {
  id: string;
  fleetNumber: string;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  variant?: string | null;
  year: number;
  transmission: 'MANUAL' | 'AUTOMATIC';
  fuelType: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG';
  seats: number;
  color: string;
  odometerKm: number;
  fuelLevelPercent: number;
  hubId: string;
  images: string[];
  status: string;
  commercialPermitNumber?: string;
  insurancePolicyNumber?: string;
  baseDailyRatePaise: string | number;
  baseHourlyRatePaise: string | number;
  securityDepositPaise: string | number;
  includedKmPerDay: number;
  extraKmRatePaise: string | number;
  cleaningBufferMinutes: number;
  features?: string[];
  hub: RentalHub;
  quote?: RentalQuote;
}

export interface RentalSearchQuery {
  hubId?: string;
  city?: string;
  startTime: string;
  endTime: string;
  fuelType?: string;
  transmission?: string;
  seats?: number;
}

export interface CreateHoldPayload {
  vehicleId: string;
  hubId: string;
  startTime: string;
  endTime: string;
}

export interface RentalHold {
  id: string;
  holdCode: string;
  vehicleId: string;
  customerId: string;
  hubId: string;
  startTime: string;
  endTime: string;
  expiresAt: string;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'RELEASED';
  quoteSnapshot: RentalQuote;
  estimatedTotalPaise: string | number;
  vehicle: RentalFleetVehicle;
}

export interface CheckoutHoldPayload {
  returnHubId?: string;
  customerNotes?: string;
  acceptTerms: boolean;
  termsVersion: string;
}

export interface CheckoutHoldResponse {
  bookingId: string;
  bookingNumber: string;
  totalPayablePaise: string | number;
  gatewayOrderId: string;
  currency: string;
  validUntil: string;
}

export interface VerifyPaymentPayload {
  paymentGateway: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface DriverKycPayload {
  licenseNumber: string;
  licenseExpiry: string;
  licenseCategory?: string;
  dateOfBirth: string;
  drivingExperienceYears: number;
  licenseFrontUrl: string;
  licenseBackUrl: string;
}

export interface RentalTripEvidence {
  id: string;
  bookingId: string;
  pickupTime?: string | null;
  pickupOdometerKm?: number | null;
  pickupFuelPercent?: number | null;
  pickupPhotos?: string[] | null;
  pickupNotes?: string | null;
  pickupCustomerSigned: boolean;
  returnTime?: string | null;
  returnOdometerKm?: number | null;
  returnFuelPercent?: number | null;
  returnPhotos?: string[] | null;
  returnNotes?: string | null;
  returnCustomerSigned: boolean;
  excessKm: number;
  excessKmChargePaise: string | number;
  fuelRefillChargePaise: string | number;
  lateReturnChargePaise: string | number;
  damageChargePaise: string | number;
  totalAdditionalChargesPaise: string | number;
  depositRefundPaise: string | number;
  isSettled: boolean;
  settledAt?: string | null;
}

export interface RentalDriverVerification {
  id: string;
  bookingId: string;
  licenseNumber: string;
  licenseExpiry: string;
  licenseCategory: string;
  dateOfBirth: string;
  drivingExperienceYears: number;
  licenseFrontUrl: string;
  licenseBackUrl: string;
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string | null;
  verifiedAt?: string | null;
}

export interface RentalBookingDetails {
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
  pricingSnapshot: RentalQuote;
  baseFarePaise: string | number;
  taxPaise: string | number;
  securityDepositPaise: string | number;
  totalPayablePaise: string | number;
  includedKm: number;
  extraKmRatePaise: string | number;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  customerNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: RentalFleetVehicle;
  pickupHub: RentalHub;
  returnHub: RentalHub;
  trip?: RentalTripEvidence | null;
  driverVerification?: RentalDriverVerification | null;
  extensions?: Array<{
    id: string;
    requestedEndTime: string;
    additionalHours: number;
    totalPayablePaise: string | number;
    status: string;
  }>;
  damageClaims?: Array<{
    id: string;
    description: string;
    estimatedRepairCostPaise: string | number;
    isCustomerDisputed: boolean;
    status: string;
  }>;
}

// -------------------------------------------------------------
// API CLIENT CALLS
// -------------------------------------------------------------
export async function searchRentalCars(query: RentalSearchQuery): Promise<RentalFleetVehicle[]> {
  const params = new URLSearchParams();
  if (query.hubId) params.append('hubId', query.hubId);
  if (query.city) params.append('city', query.city);
  if (query.startTime) params.append('startTime', query.startTime);
  if (query.endTime) params.append('endTime', query.endTime);
  if (query.fuelType) params.append('fuelType', query.fuelType);
  if (query.transmission) params.append('transmission', query.transmission);
  if (query.seats) params.append('seats', query.seats.toString());

  return api<RentalFleetVehicle[]>(`/api/v2/rentals/search?${params.toString()}`);
}

export async function fetchRentalHubs(): Promise<RentalHub[]> {
  return api<RentalHub[]>('/api/v2/rentals/hubs');
}

export async function fetchRentalVehicleDetails(
  vehicleId: string,
  startTime?: string,
  endTime?: string
): Promise<RentalFleetVehicle> {
  const params = new URLSearchParams();
  if (startTime) params.append('startTime', startTime);
  if (endTime) params.append('endTime', endTime);

  const qs = params.toString() ? `?${params.toString()}` : '';
  return api<RentalFleetVehicle>(`/api/v2/rentals/vehicles/${vehicleId}${qs}`);
}

export async function createRentalHold(payload: CreateHoldPayload): Promise<RentalHold> {
  return api<RentalHold>('/api/v2/rentals/holds', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function checkoutRentalHold(
  holdId: string,
  payload: CheckoutHoldPayload
): Promise<CheckoutHoldResponse> {
  return api<CheckoutHoldResponse>(`/api/v2/rentals/holds/${holdId}/checkout`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyRentalPayment(
  bookingId: string,
  payload: VerifyPaymentPayload
): Promise<{ booking: RentalBookingDetails; alreadyVerified: boolean }> {
  return api<{ booking: RentalBookingDetails; alreadyVerified: boolean }>(
    `/api/v2/rentals/bookings/${bookingId}/verify-payment`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitRentalDriverKyc(
  bookingId: string,
  payload: DriverKycPayload
): Promise<RentalDriverVerification> {
  return api<RentalDriverVerification>(`/api/v2/rentals/bookings/${bookingId}/driver-kyc`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerRentals(): Promise<RentalBookingDetails[]> {
  return api<RentalBookingDetails[]>('/api/v2/rentals/bookings');
}

export async function fetchRentalBookingDetails(bookingId: string): Promise<RentalBookingDetails> {
  return api<RentalBookingDetails>(`/api/v2/rentals/bookings/${bookingId}`);
}

export async function cancelRentalBooking(
  bookingId: string,
  reason: string
): Promise<{ booking: RentalBookingDetails; calculatedRefundPaise: string | number }> {
  return api<{ booking: RentalBookingDetails; calculatedRefundPaise: string | number }>(
    `/api/v2/rentals/bookings/${bookingId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function requestRentalExtension(
  bookingId: string,
  requestedEndTime: string
): Promise<{ id: string; requestedEndTime: string; totalPayablePaise: string | number; status: string }> {
  return api<{ id: string; requestedEndTime: string; totalPayablePaise: string | number; status: string }>(
    `/api/v2/rentals/bookings/${bookingId}/extension-requests`,
    {
      method: 'POST',
      body: JSON.stringify({ requestedEndTime }),
    }
  );
}
