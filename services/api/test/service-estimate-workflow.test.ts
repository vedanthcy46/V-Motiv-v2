import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceStore } from '../src/service-store.js';

type Any = any;
const future = () => new Date(Date.now() + 3 * 24 * 3600 * 1000);
const past = () => new Date(Date.now() - 3600 * 1000);

function makeStore(opts: { requestStatus: string; estimateStatus: string; validUntil?: Date }) {
  const estimate = {
    id: 'est-1',
    serviceRequestId: 'req-1',
    version: 1,
    status: opts.estimateStatus,
    validUntil: opts.validUntil ?? future(),
    totalAmountPaise: 500000n,
    pickupDropFeePaise: 0n,
    diagnosticFeePaise: 0n,
    discountPaise: 0n,
    items: [] as Any[],
    serviceRequest: { id: 'req-1', customerId: 'cust-1', requestNumber: 'SRV-1', status: opts.requestStatus },
  };
  const tx: Any = {
    serviceEstimate: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'est-2', items: [] }) },
    serviceEstimateItem: { updateMany: vi.fn() },
    serviceRequest: { update: vi.fn() },
    serviceHistoryEvent: { create: vi.fn() },
  };
  const db: Any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'cust-1' }) },
    serviceEstimate: { findUnique: vi.fn().mockResolvedValue(estimate), count: vi.fn().mockResolvedValue(1) },
    serviceRequest: { findUnique: vi.fn().mockResolvedValue({ id: 'req-1', customerId: 'cust-1', status: opts.requestStatus, requestNumber: 'SRV-1' }) },
    $transaction: vi.fn(async (fn: Any) => fn(tx)),
  };
  return { store: new PrismaServiceStore(db as Any), db, tx };
}

describe('service estimate workflow guards', () => {
  it('a cancelled request can no longer have its estimate approved or declined by the customer', async () => {
    const { store, tx } = makeStore({ requestStatus: 'CANCELLED', estimateStatus: 'SENT_TO_CUSTOMER' });
    await expect(store.respondToEstimate('uid', 'est-1', 'APPROVE')).rejects.toThrow(/SERVICE_REQUEST_CLOSED_NO_ESTIMATE_ACTION/);
    expect(tx.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('staff cannot approve an estimate on a cancelled job or a superseded estimate', async () => {
    const cancelled = makeStore({ requestStatus: 'CANCELLED', estimateStatus: 'SENT_TO_CUSTOMER' });
    await expect(cancelled.store.approveServiceEstimateByStaff('staff', 'req-1', 'est-1', { decision: 'APPROVE' })).rejects.toThrow(/SERVICE_REQUEST_CLOSED/);
    const stale = makeStore({ requestStatus: 'ESTIMATE_PENDING_APPROVAL', estimateStatus: 'SUPERSEDED' });
    await expect(stale.store.approveServiceEstimateByStaff('staff', 'req-1', 'est-1', { decision: 'APPROVE' })).rejects.toThrow(/ESTIMATE_NOT_ACTIVE/);
  });

  it('refuses to issue an estimate on a cancelled job or with no line items (no invented prices)', async () => {
    const { store } = makeStore({ requestStatus: 'CANCELLED', estimateStatus: 'DECLINED' });
    await expect(store.createEstimate('staff', 'req-1', { items: [{ category: 'LABOUR', description: 'x', quantity: 1, unitPricePaise: 100 }] } as Any)).rejects.toThrow(/SERVICE_REQUEST_CLOSED/);
    const open = makeStore({ requestStatus: 'ESTIMATE_REJECTED', estimateStatus: 'DECLINED' });
    await expect(open.store.createEstimate('staff', 'req-1', { items: [] } as Any)).rejects.toThrow(/AT_LEAST_ONE_LINE_ITEM/);
  });

  it('rejects an expired estimate and asks for a revised one', async () => {
    const { store } = makeStore({ requestStatus: 'ESTIMATE_PENDING_APPROVAL', estimateStatus: 'SENT_TO_CUSTOMER', validUntil: past() });
    await expect(store.respondToEstimate('uid', 'est-1', 'APPROVE')).rejects.toThrow(/ESTIMATE_EXPIRED/);
  });

  it('lets the customer reconsider a declined estimate until a revised one is issued', async () => {
    const { store, tx } = makeStore({ requestStatus: 'ESTIMATE_REJECTED', estimateStatus: 'DECLINED' });
    await expect(store.respondToEstimate('uid', 'est-1', 'APPROVE')).resolves.toMatchObject({ status: 'ESTIMATE_APPROVED' });
    expect(tx.serviceEstimate.update).toHaveBeenCalled();
  });

  it('records a decline reason for the workshop to negotiate with', async () => {
    const { store, tx } = makeStore({ requestStatus: 'ESTIMATE_PENDING_APPROVAL', estimateStatus: 'SENT_TO_CUSTOMER' });
    await store.respondToEstimate('uid', 'est-1', 'DECLINE', 'Can you do it for less?', 'TOO_EXPENSIVE');
    expect(tx.serviceEstimate.update.mock.calls[0][0].data.responseNotes).toBe('Reason: too expensive. Can you do it for less?');
    expect(tx.serviceRequest.update.mock.calls[0][0].data.status).toBe('ESTIMATE_REJECTED');
  });

  it('a revised estimate supersedes both the pending and the declined one', async () => {
    const { store, tx } = makeStore({ requestStatus: 'ESTIMATE_REJECTED', estimateStatus: 'DECLINED' });
    await store.createEstimate('staff', 'req-1', { items: [{ category: 'LABOUR', description: 'Brake pads', quantity: 1, unitPricePaise: 200000 }] } as Any);
    expect(tx.serviceEstimate.updateMany.mock.calls[0][0].where.status.in).toEqual(['SENT_TO_CUSTOMER', 'DECLINED']);
  });
});

import { calculateEstimateTotals } from '../src/estimate-totals.js';

describe('per-line estimate approval', () => {
  const items = [
    { id: 'i-req', quantity: 1, unitPricePaise: 400000n, isMandatory: true },
    { id: 'i-opt1', quantity: 2, unitPricePaise: 50000n, isMandatory: false },
    { id: 'i-opt2', quantity: 1, unitPricePaise: 100000n, isMandatory: false },
  ];

  function storeWithItems() {
    const made = makeStore({ requestStatus: 'ESTIMATE_PENDING_APPROVAL', estimateStatus: 'SENT_TO_CUSTOMER' });
    made.db.serviceEstimate.findUnique.mockResolvedValue({
      id: 'est-1',
      serviceRequestId: 'req-1',
      version: 1,
      status: 'SENT_TO_CUSTOMER',
      validUntil: future(),
      totalAmountPaise: 0n,
      pickupDropFeePaise: 0n,
      diagnosticFeePaise: 0n,
      discountPaise: 0n,
      items,
      serviceRequest: { id: 'req-1', customerId: 'cust-1', requestNumber: 'SRV-1', status: 'ESTIMATE_PENDING_APPROVAL' },
    });
    return made;
  }

  it('totals use integer paise with the 9% + 9% GST split', () => {
    const t = calculateEstimateTotals({ items });
    expect(t.subtotalPaise).toBe(600000n);
    expect(t.cgstPaise).toBe(54000n);
    expect(t.totalAmountPaise).toBe(708000n);
  });

  it('deferring optional items recalculates the approved total on the server', async () => {
    const { store, tx } = storeWithItems();
    await store.respondToEstimate('uid', 'est-1', 'APPROVE', undefined, undefined, ['i-opt1']);
    const data = tx.serviceEstimate.update.mock.calls[0][0].data;
    expect(data.subtotalPaise).toBe(500000n); // required 4000 + optional 1000
    expect(data.totalAmountPaise).toBe(590000n);
    const flagCalls = tx.serviceEstimateItem.updateMany.mock.calls.map((c: Any) => c[0]);
    expect(flagCalls[1].where.id.in).toEqual(['i-opt1']);
    expect(flagCalls[1].data.isApprovedByCustomer).toBe(false);
  });

  it('never lets a required item be deferred, or every item be deferred, or unknown ids through', async () => {
    const a = storeWithItems();
    await expect(a.store.respondToEstimate('uid', 'est-1', 'APPROVE', undefined, undefined, ['i-req'])).rejects.toThrow(/REQUIRED_ESTIMATE_ITEMS_CANNOT_BE_DEFERRED/);
    const b = storeWithItems();
    await expect(b.store.respondToEstimate('uid', 'est-1', 'APPROVE', undefined, undefined, ['nope'])).rejects.toThrow(/UNKNOWN_ESTIMATE_ITEM/);
    const c = storeWithItems();
    c.db.serviceEstimate.findUnique.mockResolvedValue({ ...(await c.db.serviceEstimate.findUnique()), items: items.map(i => ({ ...i, isMandatory: false })) });
    await expect(c.store.respondToEstimate('uid', 'est-1', 'APPROVE', undefined, undefined, ['i-req', 'i-opt1', 'i-opt2'])).rejects.toThrow(/USE_DECLINE_TO_REJECT_ALL_ITEMS/);
  });

  it('declined items are ignored when the customer declines the whole estimate', async () => {
    const { store, tx } = storeWithItems();
    await store.respondToEstimate('uid', 'est-1', 'DECLINE', 'no', 'OTHER', ['i-opt1']);
    expect(tx.serviceEstimateItem.updateMany).not.toHaveBeenCalled();
    expect(tx.serviceEstimate.update.mock.calls[0][0].data.subtotalPaise).toBeUndefined();
  });
});

import { formatApprovedScope } from '../src/estimate-totals.js';

describe('work order scope', () => {
  it('lists approved lines and marks deferred lines as do-not-perform', () => {
    const text = formatApprovedScope([
      { description: 'Brake pads', quantity: 1, isMandatory: true, isApprovedByCustomer: true },
      { description: 'Wiper blades', quantity: 2, isMandatory: false, isApprovedByCustomer: false },
    ]);
    expect(text).toContain('APPROVED SCOPE');
    expect(text).toContain('- Brake pads');
    expect(text).toMatch(/DO NOT PERFORM:\n- Wiper blades x2/);
    expect(formatApprovedScope([])).toBe('');
  });
});
