import { api, jsonBody } from '../api';
import { isUnreachable, rememberCars, savedInventory, savedVehicle, syncInventory, type InventoryQuery } from './inventory-offline';
import type { InventoryFacets } from './inventory-facets';
import type { ActivityPage, CustomerQuotation, CustomerAddress, InventoryPage, Profile, PurchaseEnquiry, SavedSearch, SellingRequest, SupportedCity, SupportCase, SupportCaseDetail, SupportReply, TestDrive, VehicleSummary } from '../types';

export type InstantValuationSummary = {
  id: string;
  estimateAvailable: boolean;
  unavailableReason: string | null;
  sellerEstimateLowPaise: string | null;
  sellerEstimateHighPaise: string | null;
  confidenceCategory: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT' | 'BLOCKED' | string;
  comparableCount: number;
  dataAsOf: string | null;
  valuationVersion: string;
  estimateDate: string;
  assumptions: string[];
  disclaimer: string;
};

/** One page straight from the server, with no offline handling (used by the background sync too). */
function inventoryFromServer(values: InventoryQuery): Promise<InventoryPage> {
  const query = Object.entries(values).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
  return api<InventoryPage>(`/inventory${query ? `?${query}` : ''}`);
}

export const customer = {
  /**
   * Cars for sale. Every answer from the server is also saved on the device; when the server cannot be reached the same
   * question is answered from that saved copy (flagged fromCache), so browsing and filtering keep working offline.
   */
  async inventory(filters: {
    search?: string;
    city?: string;
    fuelType?: string;
    transmission?: string;
    make?: string;
    model?: string;
    bodyType?: string;
    color?: string;
    minYear?: number;
    maxYear?: number;
    maxOdometerKm?: number;
    minPricePaise?: number;
    maxPricePaise?: number;
    /** Pipe-separated feature names exactly as listed by inventoryFacets. */
    features?: string;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'year_desc';
    page?: number;
    limit?: number;
  } | string = '') {
    const values: InventoryQuery = typeof filters === 'string' ? { search: filters } : filters;
    try {
      const result = await inventoryFromServer(values);
      void rememberCars(result.items);
      // Keeps the whole showroom saved (and sold cars removed); does nothing if it was done recently.
      void syncInventory(inventoryFromServer);
      return result;
    } catch (error) {
      if (isUnreachable(error)) {
        const saved = await savedInventory(values);
        if (saved) return { ...saved, fromCache: true };
      }
      throw error;
    }
  },
  /** Real option lists, counts and ranges for the filters, computed over the whole inventory with the given filters applied. */
  inventoryFacets(filters: Record<string, string | number | undefined> = {}) {
    const query = Object.entries(filters).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
    return api<InventoryFacets>(`/inventory/facets${query ? `?${query}` : ''}`);
  },
  /** Cheap change tokens for this customer's own records; the app only reloads a screen when its token changes. */
  async pulse(domains: string[] = ['me']) {
    return (await api<{ tokens: Record<string, string> }>(`/pulse?domains=${domains.join(',')}`)).tokens;
  },
  masterData(category?: string) {
    return api<Array<{ id: string; category: string; code: string; name: string; parentCode: string | null }>>(`/master-data${category ? `?category=${encodeURIComponent(category)}` : ''}`);
  },
  /** One car; saved when it loads, and answered from the saved copy when the server cannot be reached. */
  async vehicle(id: string) {
    try {
      const car = await api<VehicleSummary>(`/inventory/${id}`);
      void rememberCars([car]);
      return car;
    } catch (error) {
      if (isUnreachable(error)) {
        const saved = await savedVehicle(id);
        if (saved) return saved;
      }
      throw error;
    }
  },
  cities() { return api<SupportedCity[]>('/cities'); },
  addresses() { return api<CustomerAddress[]>('/me/addresses'); },
  createAddress(input: { label: string; addressLine: string; city: string; pincode: string }) { return api<CustomerAddress>('/me/addresses', { method: 'POST', body: jsonBody(input) }); },
  removeAddress(id: string) { return api<void>(`/me/addresses/${id}`, { method: 'DELETE' }); },
  createPrivacyRequest(requestType: 'DATA_ACCESS' | 'ACCOUNT_DELETION') { return api<{ id: string; requestType: string; status: string }>('/me/privacy-requests', { method: 'POST', body: jsonBody({ requestType }) }); },
  wishlist() { return api<VehicleSummary[]>('/me/wishlist'); },
  addWishlist(id: string) { return api<void>(`/me/wishlist/${id}`, { method: 'PUT' }); },
  removeWishlist(id: string) { return api<void>(`/me/wishlist/${id}`, { method: 'DELETE' }); },
  testDrives() { return api<TestDrive[]>('/me/test-drive-requests'); },
  testDrive(id: string) { return api<TestDrive>(`/me/test-drive-requests/${id}`); },
  sellingRequests() { return api<SellingRequest[]>('/me/acquisition-leads'); },
  sellingRequest(id: string) { return api<SellingRequest>(`/me/acquisition-leads/${id}`); },
  cancelSellingRequest(id: string, reason?: string) { return api<void>(`/acquisition-leads/${id}/cancel`, { method: 'PATCH', body: jsonBody({ reason: reason || 'Cancelled by customer' }) }); },
  acceptOffer(offerId: string, version: number) { return api<unknown>(`/acquisition-offers/${offerId}/accept`, { method: 'PATCH', body: jsonBody({ version }) }); },
  declineOffer(offerId: string, input: { version: number; reason?: string }) { return api<unknown>(`/acquisition-offers/${offerId}/decline`, { method: 'PATCH', body: jsonBody(input) }); },
  purchaseEnquiries() { return api<PurchaseEnquiry[]>('/me/purchase-enquiries'); },
  purchaseEnquiry(id: string) { return api<PurchaseEnquiry>(`/me/purchase-enquiries/${id}`); },
  cancelPurchaseEnquiry(id: string, reason?: string) { return api<PurchaseEnquiry>(`/me/purchase-enquiries/${id}/cancel`, { method: 'POST', body: jsonBody({ reason: reason || 'Cancelled by buyer' }) }); },
  quotations() { return api<CustomerQuotation[]>('/me/quotations'); },
  quotation(id: string) { return api<CustomerQuotation>(`/me/quotations/${id}`); },
  respondToQuotation(id: string, decision: 'ACCEPT' | 'DECLINE', notes?: string) {
    return api<{ id: string; status: 'ACCEPTED' | 'DECLINED' }>(`/me/quotations/${id}/respond`, { method: 'POST', body: jsonBody({ decision, ...(notes ? { notes } : {}) }) });
  },
  supportCases() { return api<SupportCase[]>('/me/support-cases'); },
  supportCase(id: string) { return api<SupportCaseDetail>(`/support-cases/${id}`); },
  replySupportCase(id: string, body: string) { return api<SupportReply>(`/support-cases/${id}/replies`, { method: 'POST', body: jsonBody({ body }) }); },
  activity(page = 1, limit = 20) { return api<ActivityPage>(`/me/activity?page=${page}&limit=${limit}`); },
  savedSearches() { return api<SavedSearch[]>('/me/saved-searches'); },
  saveSearch(input: { name: string; query: Record<string, unknown> }) { return api<SavedSearch>('/me/saved-searches', { method: 'POST', body: jsonBody(input) }); },
  removeSavedSearch(id: string) { return api<void>(`/me/saved-searches/${id}`, { method: 'DELETE' }); },
  createPurchaseEnquiry(input: { listingId: string; message: string; idempotencyKey: string }) { return api<PurchaseEnquiry>('/purchase-enquiries', { method: 'POST', body: jsonBody(input) }); },
  createSupportCase(input: { subject: string; category: 'ACCOUNT' | 'BUYING' | 'SELLING' | 'INSPECTION' | 'PAYMENT_REFUND' | 'DELIVERY' | 'OWNERSHIP_TRANSFER' | 'PRIVACY' | 'OTHER'; description: string }) { return api<SupportCase>('/support-cases', { method: 'POST', body: jsonBody(input) }); },
  bookTestDrive(input: { listingId: string; requestedDate: string; timeSlot: string; serviceCity: string; locationPreference: 'HUB' | 'HOME'; address?: string; customerNotes?: string }) {
    return api<TestDrive>('/test-drive-requests', { method: 'POST', body: jsonBody(input) });
  },
  cancelTestDrive(id: string, reason?: string) { return api<void>(`/test-drive-requests/${id}/cancel`, { method: 'PATCH', body: jsonBody({ reason: reason || 'Cancelled by customer' }) }); },
  instantValuation(input: {
    make: string; model: string; variant?: string; manufacturingYear: number; registrationYear?: number;
    fuelType: string; transmission: string; odometerKm: number; city: string; ownershipCount?: number;
    accidentHistory?: 'YES' | 'NO' | 'NOT_SURE'; serviceHistory?: 'COMPLETE' | 'PARTIAL' | 'NOT_SURE'; loanOutstanding?: boolean;
  }) { return api<InstantValuationSummary>('/valuations/instant', { method: 'POST', body: jsonBody(input) }); },
  sell(input: {
    sellerName: string; sellerPhone: string; city: string; pincode: string; make: string; model: string; variant?: string;
    manufacturingYear: number; fuelType: string; transmission: string; odometerKm: number; expectedPricePaise?: number; ownershipCount?: number; registrationNumber?: string; registrationYear?: number; color?: string; registrationCity?: string; loanOutstanding?: boolean; accidentHistory?: 'YES' | 'NO' | 'NOT_SURE'; serviceHistory?: 'COMPLETE' | 'PARTIAL' | 'NOT_SURE'; sellerNotes?: string;
    inspectionDate?: string; inspectionTimeSlot?: string; inspectionLocationType?: 'HUB' | 'HOME'; inspectionAddress?: string; idempotencyKey?: string;
  }) { return api<SellingRequest>('/acquisition-leads', { method: 'POST', body: jsonBody(input) }); },
  updateProfile(input: { displayName?: string; phone?: string; marketingConsent?: boolean; preferredCity?: string; termsVersion?: string }) {
    return api<Profile>('/me', { method: 'PATCH', body: jsonBody(input) });
  },
};
