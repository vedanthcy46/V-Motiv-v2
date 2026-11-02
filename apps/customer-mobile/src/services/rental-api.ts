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
  paymentPlanId?: 'FULL_100' | 'ADVANCE_25' | 'ADVANCE_50';
}

export interface CheckoutHoldResponse {
  bookingId: string;
  bookingNumber: string;
  totalPayablePaise: string | number;
  rentalTotalPaise?: string | number;
  initialPaymentDuePaise?: string | number;
  paymentPlan?: any;
  gatewayOrderId: string;
  currency: string;
  validUntil: string;
}

export interface RentalPaymentPlan {
  planId: 'FULL_100' | 'ADVANCE_25' | 'ADVANCE_50' | string;
  name: string;
  type: 'FULL' | 'PARTIAL';
  advancePercent: number;
  advancePaise: string | number;
  balancePaise: string | number;
  securityDepositPaise: string | number;
  initialPaymentDuePaise: string | number;
  balanceDueAt?: string | null;
  isAvailable: boolean;
  ineligibilityReason?: string | null;
}

export interface RentalPaymentOptionsResponse {
  quoteId: string;
  policyVersion: string;
  currency: string;
  pickupTime: string;
  hoursToPickup: number;
  rentalChargesPaise: string | number;
  baseFarePaise: string | number;
  taxPaise: string | number;
  securityDepositPaise: string | number;
  termsVersion: string;
  plans: RentalPaymentPlan[];
}

export interface RentalPaymentSummary {
  bookingId: string;
  bookingNumber: string;
  bookingStatus: string;
  currency: string;
  paymentPlan: {
    planId: string;
    type: string;
    name: string;
    advancePercent: number;
    policyVersion: string;
  };
  rentalTotalPaise: string | number;
  baseFarePaise: string | number;
  taxPaise: string | number;
  verifiedPaidPaise: string | number;
  outstandingPaise: string | number;
  paymentStatus: 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID_IN_FULL' | 'OVERDUE' | 'RECONCILIATION_REQUIRED';
  balanceDueAt?: string | null;
  isOverdue: boolean;
  deposit: {
    requiredPaise: string | number;
    status: string;
  };
  pickupReadiness: {
    eligible: boolean;
    blockers: string[];
    checklist: {
      rentalPaymentComplete: boolean;
      depositSatisfied: boolean;
      driverEligible: boolean;
      vehicleReady: boolean;
      termsAccepted: boolean;
      bookingConfirmed: boolean;
    };
  };
}

export interface RentalPaymentSchedule {
  bookingId: string;
  bookingNumber: string;
  currency: string;
  rentalTotalPaise: string | number;
  installments: Array<{
    installmentNumber: number;
    type: 'ADVANCE' | 'FULL' | 'BALANCE';
    title: string;
    amountPaise: string | number;
    status: string;
    paidAt?: string | null;
    dueAt?: string | null;
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
  }>;
  deposit: {
    title: string;
    amountPaise: string | number;
    status: string;
    note?: string;
  };
}

export interface RentalPaymentTransaction {
  id: string;
  bookingId: string;
  type: string;
  installmentType: string;
  amountPaise: string | number;
  status: string;
  paymentGateway: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
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
  paymentPlanSnapshot?: any;
  rentalPaymentStatus?: 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID_IN_FULL' | 'OVERDUE' | 'RECONCILIATION_REQUIRED' | null;
  depositStatus?: string | null;
  balanceDueAt?: string | null;
  verifiedPaidPaise?: string | number;
  outstandingBalancePaise?: string | number;
  isOverdue?: boolean;
  pickupReadiness?: {
    eligible: boolean;
    blockers: string[];
    checklist: {
      rentalPaymentComplete: boolean;
      depositSatisfied: boolean;
      driverEligible: boolean;
      vehicleReady: boolean;
      termsAccepted: boolean;
      bookingConfirmed: boolean;
    };
  };
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

export async function fetchRentalPaymentOptions(holdId: string): Promise<RentalPaymentOptionsResponse> {
  return api<RentalPaymentOptionsResponse>(`/api/v2/rentals/holds/${holdId}/payment-options`);
}

export async function fetchRentalPaymentSummary(bookingId: string): Promise<RentalPaymentSummary> {
  return api<RentalPaymentSummary>(`/api/v2/rentals/bookings/${bookingId}/payment-summary`);
}

export async function fetchRentalPaymentSchedule(bookingId: string): Promise<RentalPaymentSchedule> {
  return api<RentalPaymentSchedule>(`/api/v2/rentals/bookings/${bookingId}/payment-schedule`);
}

export async function payRentalBalance(bookingId: string): Promise<{
  bookingId: string;
  bookingNumber: string;
  gatewayOrderId: string;
  amountPaise: string | number;
  currency: string;
}> {
  return api<{
    bookingId: string;
    bookingNumber: string;
    gatewayOrderId: string;
    amountPaise: string | number;
    currency: string;
  }>(`/api/v2/rentals/bookings/${bookingId}/pay-balance`, {
    method: 'POST',
  });
}

export async function verifyRentalBalancePayment(
  bookingId: string,
  payload: VerifyPaymentPayload
): Promise<{ success: boolean; rentalPaymentStatus: string; verifiedPaidPaise: string | number; outstandingBalancePaise: string | number }> {
  return api<{ success: boolean; rentalPaymentStatus: string; verifiedPaidPaise: string | number; outstandingBalancePaise: string | number }>(
    `/api/v2/rentals/bookings/${bookingId}/verify-balance-payment`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchRentalPaymentHistory(bookingId: string): Promise<RentalPaymentTransaction[]> {
  return api<RentalPaymentTransaction[]>(`/api/v2/rentals/bookings/${bookingId}/payment-history`);
}

export async function fetchRentalPickupReadiness(bookingId: string): Promise<{
  eligible: boolean;
  blockers: string[];
  checklist: Record<string, boolean>;
}> {
  return api<{
    eligible: boolean;
    blockers: string[];
    checklist: Record<string, boolean>;
  }>(`/api/v2/rentals/bookings/${bookingId}/pickup-readiness`);
}
