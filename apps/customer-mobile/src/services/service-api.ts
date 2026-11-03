import { api } from '../api';

export interface CustomerVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  variant?: string;
  fuelType: string;
  transmission: string;
  color?: string;
  registrationNumber?: string;
  odometerKm?: number;
  vin?: string;
  declaredOwnership: string;
  photoUrls: string[];
  notes?: string;
  isPreferred: boolean;
  isArchived?: boolean;
  lastServiceDate?: string | null;
  nextServiceDueKm?: number | null;
  nextServiceDueDate?: string | null;
  connectDeviceId?: string | null;
  connectStatus: string;
  activeServiceRequest?: {
    id: string;
    requestNumber: string;
    categoryKey: string;
    status: string;
    scheduledDate: string;
    scheduledTimeSlot: string;
  } | null;
  serviceRequests?: Array<{
    id: string;
    requestNumber: string;
    categoryKey: string;
    status: string;
    fulfillmentType: string;
    scheduledDate: string;
    scheduledTimeSlot: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  variant?: string;
  fuelType: string;
  transmission: string;
  color?: string;
  registrationNumber?: string;
  odometerKm?: number;
  vin?: string;
  declaredOwnership?: string;
  photoUrls?: string[];
  notes?: string;
  isPreferred?: boolean;
}

export interface UpdateVehicleInput {
  variant?: string;
  color?: string;
  registrationNumber?: string;
  odometerKm?: number;
  vin?: string;
  declaredOwnership?: string;
  photoUrls?: string[];
  notes?: string;
  isPreferred?: boolean;
}

export interface ServiceIssueCategory {
  categoryKey: string;
  version: number;
  title: string;
  description: string;
  icon: string;
  fixedPackageAvailable: boolean;
  packagePricePaise?: string | null;
  packageFeatures?: string[] | null;
}

export interface ServiceIssueQuestion {
  stableId: string;
  label: string;
  explanation?: string;
  responseType: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'TEXT' | 'NUMBER' | 'BOOLEAN';
  options?: string[];
  required: boolean;
  isSafetyCritical?: boolean;
}

export interface ServiceIssueTemplate extends ServiceIssueCategory {
  questions: ServiceIssueQuestion[];
}

export interface ServiceHub {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  operatingHours: string;
  phone?: string | null;
  capacityPerSlot: number;
  pickupRadiusKm: number;
  pickupFeePaise: string;
  diagnosticFeePaise: string;
}

export interface SlotCapacity {
  slotDate: string;
  slotTime: string;
  maxCapacity: number;
  bookedCount: number;
  isAvailable: boolean;
  availableCount: number;
}

export interface ServicePaymentOption {
  planId: string;
  title: string;
  description: string;
  percentage?: number;
  payNowPaise: string;
  balancePaise: string;
  isRecommended?: boolean;
}

export interface ServiceCategoryPaymentOptionsResponse {
  categoryKey: string;
  categoryTitle: string;
  pricingType: string;
  fixedPackageAvailable: boolean;
  packagePricePaise: string | null;
  packageFeatures?: string[];
  diagnosticFeePaise: string;
  policyCode: string;
  options: ServicePaymentOption[];
}

export interface ServicePaymentSummary {
  requestId: string;
  requestNumber: string;
  servicePaymentStatus: string;
  depositStatus: string;
  verifiedPaidPaise: string;
  outstandingBalancePaise: string;
  paymentPlanSnapshot?: any;
  finalInvoice?: any;
  payments: Array<{
    id: string;
    type: string;
    amountPaise: string;
    paymentGateway: string;
    status: string;
    gatewayPaymentId?: string;
    gatewayOrderId?: string;
    createdAt: string;
  }>;
}

export interface VerifyServicePaymentPayload {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
  amountPaise?: string;
  paymentGateway?: string;
  installmentType?: string;
}

export interface CreateServiceRequestPayload {
  vehicleId: string;
  hubId: string;
  categoryKey: string;
  customerSymptoms: string;
  questionAnswers: Record<string, unknown>;
  mediaUrls?: string[];
  fulfillmentType: 'PICKUP_AND_RETURN' | 'SELF_DROP_AT_HUB';
  scheduledDate: string;
  scheduledTimeSlot: string;
  paymentPlanId?: string;
  paymentGateway?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  pickupAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  };
  returnAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  };
}

export interface ServiceEstimateItem {
  id: string;
  category: string;
  description: string;
  partNumber?: string;
  quantity: number;
  unitPricePaise: string;
  totalPricePaise: string;
  isMandatory: boolean;
  isApprovedByCustomer: boolean;
}

export interface ServiceEstimate {
  id: string;
  version: number;
  status: string;
  subtotalPaise: string;
  pickupDropFeePaise: string;
  diagnosticFeePaise: string;
  discountPaise: string;
  cgstPaise: string;
  sgstPaise: string;
  totalAmountPaise: string;
  customerNotes?: string;
  validUntil: string;
  respondedAt?: string | null;
  items: ServiceEstimateItem[];
  createdAt: string;
}

export interface ServiceCustodyRecord {
  id: string;
  type: string;
  odometerKm: number;
  fuelChargeLevel: string;
  keyCount: number;
  accessories?: Record<string, boolean | string> | null;
  preExistingDamageNotes?: string | null;
  damagePhotoUrls: string[];
  handoverByPerson: string;
  customerAcknowledged: boolean;
  recordedAt: string;
}

export interface ServiceDiagnosis {
  id: string;
  diagnosticSummary: string;
  detailedFindings: string;
  recommendedAction: string;
  photosAndScans: string[];
  diagnosticFeePaise: string;
  isRoadTestNeeded: boolean;
  createdAt: string;
}

export interface ServiceHistoryEvent {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  title: string;
  description: string;
  actorRole?: string;
  createdAt: string;
}

export interface ServiceRequestSummary {
  id: string;
  requestNumber: string;
  categoryKey: string;
  status: string;
  fulfillmentType: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  emergencySafetyFlag: boolean;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    registrationNumber?: string;
  };
  hub: {
    id: string;
    name: string;
    city: string;
    address: string;
  };
  activeEstimate?: {
    id: string;
    version: number;
    status: string;
    totalAmountPaise: string;
  } | null;
  servicePaymentStatus?: string;
  depositStatus?: string;
  verifiedPaidPaise?: string;
  outstandingBalancePaise?: string;
  createdAt: string;
}

export interface ServiceRequestDetails {
  id: string;
  requestNumber: string;
  categoryKey: string;
  status: string;
  fulfillmentType: 'PICKUP_AND_RETURN' | 'SELF_DROP_AT_HUB';
  customerSymptoms: string;
  questionAnswers: Record<string, unknown>;
  mediaUrls: string[];
  scheduledDate: string;
  scheduledTimeSlot: string;
  pickupAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  } | null;
  returnAddress?: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    instructions?: string;
  } | null;
  emergencySafetyFlag: boolean;
  safetyNotes?: string | null;
  estimatedCompletionDate?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    fuelType: string;
    registrationNumber?: string;
    odometerKm?: number;
  };
  hub: {
    id: string;
    code: string;
    name: string;
    city: string;
    address: string;
    phone?: string;
    operatingHours: string;
  };
  custodyRecords: ServiceCustodyRecord[];
  diagnoses: ServiceDiagnosis[];
  estimates: ServiceEstimate[];
  workOrders: Array<{
    id: string;
    status: string;
    instructions: string;
    actualHoursSpent?: number;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  qcRecords: Array<{
    id: string;
    result: string;
    checklistResults: Record<string, unknown>;
    notes?: string;
    passedAt?: string | null;
  }>;
  payments: Array<{
    id: string;
    type: string;
    amountPaise: string;
    status: string;
    paymentGateway?: string;
    gatewayPaymentId?: string;
    verifiedAt?: string | null;
  }>;
  servicePaymentStatus?: string;
  depositStatus?: string;
  verifiedPaidPaise?: string;
  outstandingBalancePaise?: string;
  paymentPlanSnapshot?: any;
  finalInvoiceId?: string | null;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    subtotalPaise: string;
    diagnosticFeeCreditPaise: string;
    priorPaymentsCreditedPaise: string;
    cgstPaise: string;
    sgstPaise: string;
    totalAmountPaise: string;
    outstandingPaise: string;
    status: string;
    issuedAt: string;
  }>;
  historyEvents: ServiceHistoryEvent[];
  createdAt: string;
}

// -------------------------------------------------------------
// GARAGE API METHODS
// -------------------------------------------------------------
export async function fetchCustomerVehicles(): Promise<CustomerVehicle[]> {
  return api<CustomerVehicle[]>('/api/v2/customer/garage');
}

export async function fetchCustomerVehicle(vehicleId: string): Promise<CustomerVehicle> {
  return api<CustomerVehicle>(`/api/v2/customer/garage/${vehicleId}`);
}

export async function createCustomerVehicle(data: CreateVehicleInput): Promise<CustomerVehicle> {
  return api<CustomerVehicle>('/api/v2/customer/garage', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomerVehicle(vehicleId: string, data: UpdateVehicleInput): Promise<CustomerVehicle> {
  return api<CustomerVehicle>(`/api/v2/customer/garage/${vehicleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function archiveCustomerVehicle(vehicleId: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/v2/customer/garage/${vehicleId}`, {
    method: 'DELETE',
  });
}

// -------------------------------------------------------------
// SERVICE API METHODS
// -------------------------------------------------------------
export async function fetchServiceCategories(hubId?: string): Promise<ServiceIssueCategory[]> {
  const query = hubId ? `?hubId=${encodeURIComponent(hubId)}` : '';
  return api<ServiceIssueCategory[]>(`/api/v2/service/categories${query}`);
}

export async function fetchServiceTemplate(categoryKey: string, hubId?: string): Promise<ServiceIssueTemplate> {
  const query = hubId ? `?hubId=${encodeURIComponent(hubId)}` : '';
  return api<ServiceIssueTemplate>(`/api/v2/service/categories/${categoryKey}${query}`);
}

export async function fetchServiceHubs(city?: string): Promise<ServiceHub[]> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return api<ServiceHub[]>(`/api/v2/service/hubs${query}`);
}

export async function fetchSlotAvailability(hubId: string, date: string): Promise<SlotCapacity[]> {
  return api<SlotCapacity[]>(`/api/v2/service/availability?hubId=${hubId}&date=${date}`);
}

export async function createServiceRequest(payload: CreateServiceRequestPayload): Promise<{ id: string; requestNumber: string; status: string }> {
  return api<{ id: string; requestNumber: string; status: string }>('/api/v2/service/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerServiceRequests(): Promise<ServiceRequestSummary[]> {
  return api<ServiceRequestSummary[]>('/api/v2/service/requests');
}

export async function fetchCustomerServiceRequest(requestId: string): Promise<ServiceRequestDetails> {
  return api<ServiceRequestDetails>(`/api/v2/service/requests/${requestId}`);
}

export async function respondToServiceEstimate(
  estimateId: string,
  decision: 'APPROVE' | 'DECLINE',
  notes?: string
): Promise<{ success: boolean; status: string }> {
  return api<{ success: boolean; status: string }>(`/api/v2/service/estimates/${estimateId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  });
}

export async function cancelServiceRequest(
  requestId: string,
  reason: string
): Promise<{ id: string; status: string }> {
  return api<{ id: string; status: string }>(`/api/v2/service/requests/${requestId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function fetchCategoryPaymentOptions(categoryKey: string, hubId?: string): Promise<ServiceCategoryPaymentOptionsResponse> {
  const query = hubId ? `?hubId=${encodeURIComponent(hubId)}` : '';
  const res = await api<ServiceCategoryPaymentOptionsResponse>(`/api/v2/service/categories/${categoryKey}/payment-options${query}`);
  if (res && Array.isArray(res.options)) {
    res.options = res.options.map(o => ({
      ...o,
      planId: o.planId || (o as any).id || 'ZERO_UPFRONT',
      id: (o as any).id || o.planId || 'ZERO_UPFRONT',
    }));
  }
  return res;
}

export async function fetchServicePaymentSummary(requestId: string): Promise<ServicePaymentSummary> {
  return api<ServicePaymentSummary>(`/api/v2/service/requests/${requestId}/payment-summary`);
}

export async function verifyServicePayment(
  requestId: string,
  payload: VerifyServicePaymentPayload
): Promise<{ success: boolean; servicePaymentStatus: string; verifiedPaidPaise: string; outstandingBalancePaise: string }> {
  return api<{ success: boolean; servicePaymentStatus: string; verifiedPaidPaise: string; outstandingBalancePaise: string }>(
    `/api/v2/service/requests/${requestId}/verify-payment`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}
