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
});
