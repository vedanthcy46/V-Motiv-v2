import type { User } from 'firebase/auth';
import type {
  CityItem,
  DriveRequestInput,
  EnquiryInput,
  InventoryResponse,
  ListingItem,
  SellCarInput,
  UserPurchaseEnquiry,
  UserTestDrive,
} from './types';
import { friendlyError } from './account-api';

function publicApiBase() {
  const configured = (import.meta.env.VITE_API_BASE || '/api/v1')
    .replace('https://vmotiv.in', 'https://api.vmotiv.in')
    .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
    .replace(/\/$/, '');
  if (configured.endsWith('/api/v1') || configured.endsWith('/api/v2')) return configured;
  return `${configured}/api/v2`;
}
const API_BASE = publicApiBase();

export type InventoryFacetCount = { value: string; count: number };

const BODY_TYPE_LABELS: Record<string, string> = { HATCHBACK: 'Hatchback', SEDAN: 'Sedan', SUV: 'SUV', MUV: 'MUV / MPV', COUPE: 'Coupe', CONVERTIBLE: 'Convertible' };
/** Readable name for a stored body type code ("HATCHBACK" -> "Hatchback"). */
export function bodyTypeLabel(code?: string | null): string {
  if (!code) return '';
  const key = code.trim().toUpperCase();
  return BODY_TYPE_LABELS[key] ?? code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

/** Fuel types, transmissions and body types that exist in published stock, with counts. */
export async function fetchInventoryFacets(): Promise<{ fuelTypes: InventoryFacetCount[]; transmissions: InventoryFacetCount[]; bodyTypes: InventoryFacetCount[] }> {
  const response = await fetch(`${API_BASE}/inventory/facets`);
  if (!response.ok) throw new Error('Failed to load inventory filters');
  const body = await response.json();
  return { fuelTypes: body.fuelTypes ?? [], transmissions: body.transmissions ?? [], bodyTypes: body.bodyTypes ?? [] };
}

export function formatInrPaise(paise: string | number): string {
  const amount = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(amount) || amount <= 0) return '₹0';
  const rupees = Math.round(amount / 100);
  return '₹' + rupees.toLocaleString('en-IN');
}

export function formatLakh(paise: string | number): string {
  const amount = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(amount) || amount <= 0) return '₹0';
  const lakhs = (amount / (100 * 100_000));
  if (lakhs >= 1) {
    return `₹${lakhs.toFixed(2)} Lakh`;
  }
  return formatInrPaise(paise);
}

export async function fetchInventory(params?: {
  limit?: number;
  fuelType?: string;
  transmission?: string;
  bodyType?: string;
  city?: string;
  search?: string;
}): Promise<InventoryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.fuelType && params.fuelType !== 'ALL') searchParams.set('fuelType', params.fuelType);
  if (params?.transmission && params.transmission !== 'ALL') searchParams.set('transmission', params.transmission);
  if (params?.bodyType && params.bodyType !== 'ALL') searchParams.set('bodyType', params.bodyType);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);

  const url = `${API_BASE}/inventory?${searchParams.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to load published inventory');
  }
  return response.json();
}

export async function fetchVehicle(id: string): Promise<ListingItem> {
  const response = await fetch(`${API_BASE}/inventory/${id}`);
  if (!response.ok) {
    throw new Error('Vehicle not found or no longer published');
  }
  return response.json();
}

export async function fetchCities(): Promise<CityItem[]> {
  try {
    const response = await fetch(`${API_BASE}/cities`);
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function submitSellLead(user: User, input: SellCarInput): Promise<any> {
  const token = await user.getIdToken();
  const idempotencyKey = `sell-${user.uid}-${Date.now()}`;
  const response = await fetch(`${API_BASE}/me/sell`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...input,
      idempotencyKey,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.code || 'Failed to submit selling lead');
  }
  return response.json();
}

export async function submitTestDrive(user: User, input: DriveRequestInput): Promise<any> {
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}/me/drives`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 409 || data.code === 'REQUEST_CONFLICT') {
      throw new Error('You already have an active test drive booked for this vehicle.');
    }
    throw new Error(data.message || data.code || 'Failed to request test drive');
  }
  return response.json();
}

export async function submitEnquiry(user: User, input: EnquiryInput): Promise<any> {
  const token = await user.getIdToken();
  const idempotencyKey = `enq-${user.uid}-${input.listingId}-${Date.now()}`;
  const response = await fetch(`${API_BASE}/me/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      listingId: input.listingId,
      message: input.message,
      idempotencyKey,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 409 || data.code === 'REQUEST_CONFLICT') {
      throw new Error('You have already submitted an enquiry for this vehicle.');
    }
    throw new Error(data.message || data.code || 'Failed to submit purchase enquiry');
  }
  return response.json();
}

export async function fetchUserDrives(user: User): Promise<UserTestDrive[]> {
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE}/me/drives`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function fetchUserEnquiries(user: User): Promise<UserPurchaseEnquiry[]> {
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE}/me/enquiries`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function cancelTestDrive(user: User, driveId: string, reason = 'Cancelled by customer'): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}/me/drives/${driveId}/cancel`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.code || 'Failed to cancel test drive');
  }
}
