import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaFinanceStore } from '../src/finance-store.js';

type Any = any;
const actor: Any = { userId: 'u-1', roles: ['FINANCE'], permissions: ['finance.receipt.reconcile', 'finance.receipt.record'] };

describe('company bank balance follows money in', () => {
  function makeStore(receipt: Any) {
    const bank: Any[] = [];
    const db: Any = {
      incomingReceipt: { findUnique: async () => receipt, update: async ({ data }: Any) => ({ ...receipt, ...data, status: 'VERIFIED' }) },
      companyBankAccount: { update: async (args: Any) => { bank.push(args); return {}; } },
      auditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    return { store: new PrismaFinanceStore(db as PrismaClient) as Any, bank };
  }
  const pending = { id: 'r-1', receiptNumber: 'REC-1', status: 'PENDING_VERIFICATION', version: 1, amountPaise: 500_000_00n, companyBankAccountId: 'acct-1' };

  it('verifying a receipt credits the account it was received into, so a payout no longer leaves it negative', async () => {
    const { store, bank } = makeStore(pending);
    await store.verifyIncomingReceipt(actor, 'r-1');
    expect(bank).toEqual([{ where: { id: 'acct-1' }, data: { balancePaise: { increment: 500_000_00n } } }]);
  });

  it('a receipt with no bank account recorded credits nothing', async () => {
    const { store, bank } = makeStore({ ...pending, companyBankAccountId: null });
    await store.verifyIncomingReceipt(actor, 'r-1');
    expect(bank).toHaveLength(0);
  });
});
