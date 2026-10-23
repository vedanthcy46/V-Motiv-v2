import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCities,
  fetchInventory,
  formatInrPaise,
  formatLakh,
  submitEnquiry,
  submitSellLead,
  submitTestDrive,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('currency and number formatters', () => {
  it('formats paise correctly into Indian rupee strings', () => {
    expect(formatInrPaise(199000000)).toBe('₹19,90,000');
    expect(formatInrPaise('78000000')).toBe('₹7,80,000');
    expect(formatInrPaise(0)).toBe('₹0');
    expect(formatInrPaise(-500)).toBe('₹0');
    expect(formatInrPaise('invalid')).toBe('₹0');
  });

  it('formats amounts in lakhs for automotive display', () => {
    expect(formatLakh(199000000)).toBe('₹19.90 Lakh');
    expect(formatLakh('78000000')).toBe('₹7.80 Lakh');
    expect(formatLakh(104500000)).toBe('₹10.45 Lakh');
    expect(formatLakh(150000000)).toBe('₹15.00 Lakh');
    expect(formatLakh(5000000)).toBe('₹50,000');
  });
});

describe('public API client', () => {
  it('fetches inventory with query parameters', async () => {
    const mockData = { items: [{ id: '1' }], total: 1, page: 1, limit: 6, totalPages: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchInventory({ limit: 6, fuelType: 'PETROL' });
    expect(result).toEqual(mockData);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/inventory?limit=6&fuelType=PETROL');
  });

  it('fetches supported cities gracefully', async () => {
    const mockCities = [{ id: 'c1', name: 'Bengaluru' }, { id: 'c2', name: 'Chennai' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockCities), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const cities = await fetchCities();
    expect(cities).toEqual(mockCities);
  });

  it('returns empty array when cities endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const cities = await fetchCities();
    expect(cities).toEqual([]);
  });
});

describe('authenticated customer action APIs', () => {
  const mockUser: any = {
    uid: 'user-123',
    getIdToken: vi.fn().mockResolvedValue('test-firebase-token'),
  };

  it('submits a sell lead with bearer token and idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead-1', status: 'DRAFT' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const leadInput = {
      sellerName: 'Rahul Sharma',
      sellerPhone: '+919876543210',
      city: 'Bengaluru',
      pincode: '560001',
      make: 'Hyundai',
      model: 'Creta',
      manufacturingYear: 2021,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      odometerKm: 30000,
      inspectionLocationType: 'HUB' as const,
    };

    const res = await submitSellLead(mockUser, leadInput);
    expect(res).toEqual({ id: 'lead-1', status: 'DRAFT' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/me/sell');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-firebase-token');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.sellerName).toBe('Rahul Sharma');
    expect(sentBody.idempotencyKey).toMatch(/^sell-user-123-\d+$/);
  });

  it('submits a test drive request with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'drive-1', status: 'REQUESTED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const driveInput = {
      listingId: '11111111-1111-1111-1111-111111111111',
      requestedDate: '2026-10-25',
      timeSlot: '10:00-12:00' as const,
      serviceCity: 'Bengaluru',
      locationPreference: 'HUB' as const,
    };

    const res = await submitTestDrive(mockUser, driveInput);
    expect(res).toEqual({ id: 'drive-1', status: 'REQUESTED' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/drives',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-firebase-token',
        },
      })
    );
  });

  it('submits a purchase enquiry with required message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'enq-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const enquiryInput = {
      listingId: '22222222-2222-2222-2222-222222222222',
      message: 'I would like to verify the service history documents.',
    };

    const res = await submitEnquiry(mockUser, enquiryInput);
    expect(res).toEqual({ id: 'enq-1' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/me/enquiries');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.message).toBe('I would like to verify the service history documents.');
    expect(sentBody.idempotencyKey).toMatch(/^enq-user-123-22222222-2222-2222-2222-222222222222-\d+$/);
  });
});
