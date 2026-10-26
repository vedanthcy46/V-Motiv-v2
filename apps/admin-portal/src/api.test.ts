import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { adminApi, ApiError } from './api.js';

const user = { getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User;
afterEach(() => { vi.restoreAllMocks(); vi.mocked(user.getIdToken).mockClear(); });

describe('Admin API client', () => {
  it('sends Firebase credentials and does not submit frontend authority', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ userId: 'one', permissions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await adminApi.me(user);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v2/admin/me'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer verified-token' }) }));
    expect(JSON.stringify(fetch.mock.calls[0])).not.toContain('SUPER_ADMIN');
  });

  it('refreshes once after a 401 and returns the retried result', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'INVALID_OR_REVOKED_TOKEN' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(adminApi.roles(user)).resolves.toEqual([]);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns the backend error contract without exposing a response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'PERMISSION_DENIED', private: 'must not surface' }), { status: 403 }));
    await expect(adminApi.audit(user)).rejects.toEqual(new ApiError(403, 'PERMISSION_DENIED'));
  });

  it('queries business oversight, master data, communications, and controlled exports', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ activeInventoryCount: 5 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    
    await adminApi.businessFinance(user);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v2/admin/business/finance'), expect.anything());

    fetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await adminApi.masterData(user, 'CAR_MAKE');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v2/admin/master-data?category=CAR_MAKE'), expect.anything());

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'export-1', status: 'READY' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await adminApi.createExportJob(user, { resourceType: 'INVENTORY' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v2/admin/exports'), expect.objectContaining({ method: 'POST' }));
  });
});
