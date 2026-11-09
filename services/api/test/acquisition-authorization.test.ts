import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../src/errors.js';
import { PrismaSalesStore, type SalesActor } from '../src/sales-store.js';

const salesActor: SalesActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'sales@example.test',
  displayName: 'Sales',
  employeeCode: 'TEST-SALES',
  roles: ['SALES_EXECUTIVE'],
  branches: [],
  globalScope: false,
};

describe('seller acquisition acceptance boundary', () => {
  it('does not allow Sales to forge a seller acceptance', async () => {
    const store = new PrismaSalesStore({} as PrismaClient);
    await expect(store.recordSellerOfferResponse(
      salesActor,
      '11111111-1111-4111-8111-111111111112',
      '11111111-1111-4111-8111-111111111113',
      { decision: 'ACCEPTED' },
    )).rejects.toEqual(new HttpError(403, 'SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION'));
  });

  it('never files an offer request, or reaches the seller, without an independently approved inspection', async () => {
    const created: string[] = [];
    const db = {
      acquisitionLead: { findFirst: async () => ({ id: 'lead-1', referenceCode: 'VM-LEAD-1', make: 'Honda', model: 'City', manufacturingYear: 2020, sellerName: 'Seller', sellerPhone: '+919876543210', city: 'Bengaluru' }) },
      inspectionReport: { findFirst: async () => null },
      acquisitionOffer: { create: async () => { created.push('offer'); } },
      approvalRequest: { create: async () => { created.push('approval'); } },
    } as unknown as PrismaClient;
    const store = new PrismaSalesStore(db);
    await expect(store.proposeAcquisitionOffer({ ...salesActor, globalScope: true }, '11111111-1111-4111-8111-111111111112', {
      offerAmountPaise: 50000000n,
      reason: 'Customer requested an offer',
    })).rejects.toEqual(new HttpError(409, 'OFFER_REQUIRES_APPROVED_INSPECTION'));
    expect(created).toEqual([]);
  });
});
