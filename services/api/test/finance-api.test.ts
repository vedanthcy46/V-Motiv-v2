import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { PrismaFinanceStore, FinanceActor } from '../src/finance-store.js';
import { HttpError } from '../src/errors.js';

const financeOfficerToken = {
  uid: 'finance-officer-uid',
  email: 'finance@vmotiv.in',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const financeApproverToken = {
  uid: 'finance-approver-uid',
  email: 'controller@vmotiv.in',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;

const officerActor: FinanceActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Finance Officer',
  email: 'finance@vmotiv.in',
  roles: ['FINANCE'],
  permissions: ['finance.dashboard.read', 'finance.payout.create', 'finance.payout.submit', 'finance.receipt.record', 'finance.receipt.allocate', 'finance.ledger.post', 'finance.profitability.read'],
  branchIds: ['b-blr'],
};

const approverActor: FinanceActor = {
  userId: '22222222-2222-4222-8222-222222222222',
  displayName: 'Financial Controller',
  email: 'controller@vmotiv.in',
  roles: ['SUPER_ADMIN', 'FINANCE'],
  permissions: ['finance.payout.approve', 'finance.payout.execute', 'finance.payout.reconcile'],
  branchIds: ['b-blr'],
};

const SETTLEMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAYOUT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECEIPT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OBLIGATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACC1_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ACC2_ID = '12345678-1234-4234-8234-123456789abc';
const BANK_ACCOUNT_ID = '87654321-4321-4234-8234-123456789abc';

function setupFinanceApp(activeActor: FinanceActor, overrides: Partial<PrismaFinanceStore> = {}) {
  const verify = vi.fn().mockImplementation(async (token: string) => {
    if (token === 'approver-token') return financeApproverToken;
    return financeOfficerToken;
  });

  const identityStore = {
    sync: vi.fn(),
    find: vi.fn().mockResolvedValue({
      id: activeActor.userId,
      status: 'ACTIVE',
      employee: {
        id: 'emp-001',
        role: activeActor.roles[0],
        active: true,
      },
    }),
    ready: vi.fn().mockResolvedValue(undefined),
  } as any;

  const financeStore = {
    actor: vi.fn().mockImplementation(async (uid: string) => {
      if (uid === approverActor.userId || uid === financeApproverToken.uid) return approverActor;
      return officerActor;
    }),
    dashboard: vi.fn().mockResolvedValue({
      readyForPreparation: 2,
      pendingApproval: 1,
      approved: 3,
      reconciliation: 1,
      exceptions: 0,
      activeObligations: 5,
      unappliedReceiptsPaise: '25000000',
      totalExpensesPaise: '8500000',
    }),
    settlements: vi.fn().mockResolvedValue([]),
    preparePayout: vi.fn().mockImplementation(async (_actor, _id, input) => ({
      id: PAYOUT_ID,
      settlementId: SETTLEMENT_ID,
      beneficiaryName: input.beneficiaryName,
      beneficiaryAccountMasked: input.beneficiaryAccountMasked,
      paymentMethod: input.paymentMethod,
      amountPaise: '50000000',
      status: 'DRAFT',
      version: 1,
      payoutPurpose: 'SELLER_PROCEEDS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    submitPayout: vi.fn().mockResolvedValue({
      id: PAYOUT_ID,
      status: 'APPROVAL_PENDING',
      version: 2,
    }),
    approvePayout: vi.fn().mockImplementation(async (actor: FinanceActor, _id, _version, decision) => {
      // Invariant: Preparer cannot approve their own payout
      if (actor.userId === officerActor.userId) {
        throw new HttpError(403, 'PAYOUT_SELF_APPROVAL_DENIED');
      }
      return {
        id: PAYOUT_ID,
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        version: 3,
      };
    }),
    executePayout: vi.fn().mockResolvedValue({
      id: PAYOUT_ID,
      status: 'RECONCILIATION_PENDING',
      bankReference: 'UTR-123456',
      version: 4,
    }),
    verifyPayout: vi.fn().mockResolvedValue({
      id: PAYOUT_ID,
      status: 'RECONCILED',
      reconciliationReference: 'STMT-MATCH-01',
      version: 5,
    }),
    buyerObligations: vi.fn().mockResolvedValue([
      {
        id: OBLIGATION_ID,
        obligationNumber: 'OB-2026-0001',
        buyerUserId: 'cust-1',
        buyerName: 'Rahul Verma',
        salePricePaise: '120000000',
        bookingDepositPaise: '5000000',
        totalPayablePaise: '120000000',
        totalReceivedPaise: '120000000',
        remainingBalancePaise: '0',
        deliveryEligible: true,
        status: 'PAID',
        allocations: [],
        createdAt: new Date().toISOString(),
      },
    ]),
    recordIncomingReceipt: vi.fn().mockImplementation(async (_actor, input) => ({
      id: RECEIPT_ID,
      receiptNumber: 'RCP-2026-0001',
      payerName: input.payerName,
      amountPaise: input.amountPaise,
      unappliedAmountPaise: input.amountPaise,
      status: 'UNVERIFIED',
      receivedAt: new Date().toISOString(),
      allocations: [],
      createdAt: new Date().toISOString(),
    })),
    allocateReceipt: vi.fn().mockImplementation(async (_actor, input) => {
      return {
        allocation: { id: 'alloc-1', amountPaise: input.allocatedAmountPaise },
        obligation: {
          id: input.obligationId,
          remainingBalancePaise: '0',
          deliveryEligible: true,
        },
        receipt: { id: RECEIPT_ID, unappliedAmountPaise: '0' },
      };
    }),
    postJournal: vi.fn().mockImplementation(async (_actor, input) => {
      const sumDr = input.lines.reduce((s: bigint, l: any) => s + BigInt(l.debitPaise), 0n);
      const sumCr = input.lines.reduce((s: bigint, l: any) => s + BigInt(l.creditPaise), 0n);
      if (sumDr !== sumCr) {
        throw new HttpError(400, 'UNBALANCED_JOURNAL_ENTRY_DEBITS_MUST_EQUAL_CREDITS');
      }
      return {
        id: 'j-1',
        entryNumber: 'JRN-2026-0001',
        postingDate: input.postingDate,
        status: 'POSTED',
        lines: input.lines,
      };
    }),
    vehicleProfitability: vi.fn().mockResolvedValue([
      {
        stockUnitId: 'stock-1',
        vin: 'VIN12345678901234',
        make: 'Hyundai',
        model: 'Creta',
        year: 2022,
        status: 'IN_STOCK',
        acquisitionCostPaise: '90000000',
        refurbishmentExpensesPaise: '4500000',
        totalInvestedPaise: '94500000',
        realizedSalePricePaise: '105000000',
        realizedGrossMarginPaise: '10500000',
        realizedGrossMarginPercent: 10.0,
        deliveryEligible: true,
      },
    ]),
    ...overrides,
  } as unknown as PrismaFinanceStore;

  const app = createApp({
    verify,
    store: identityStore,
    webOrigin: 'http://localhost:3100',
    adminWebOrigin: 'http://localhost:3200',
    finance: financeStore,
  });

  return { app, financeStore };
}

describe('Finance Portal Engine & REST API', () => {
  it('identifies authenticated finance actor and returns authorization metadata', async () => {
    const { app } = setupFinanceApp(officerActor);

    const res = await request(app)
      .get('/api/v2/finance/me')
      .set('Authorization', 'Bearer valid-officer-token');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('finance@vmotiv.in');
    expect(res.body.roles).toContain('FINANCE');
  });

  it('provides dashboard treasury and reconciliation metrics', async () => {
    const { app } = setupFinanceApp(officerActor);

    const res = await request(app)
      .get('/api/v2/finance/dashboard')
      .set('Authorization', 'Bearer valid-officer-token');

    expect(res.status).toBe(200);
    expect(res.body.readyForPreparation).toBe(2);
    expect(res.body.activeObligations).toBe(5);
    expect(res.body.unappliedReceiptsPaise).toBe('25000000');
  });

  it('prepares seller payout instruction with masked beneficiary data', async () => {
    const { app, financeStore } = setupFinanceApp(officerActor);

    const res = await request(app)
      .post(`/api/v2/finance/seller-settlements/${SETTLEMENT_ID}/payout-instructions`)
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        beneficiaryName: 'Ramesh Patel',
        beneficiaryAccountMasked: 'XXXX 4321',
        paymentMethod: 'RTGS',
      });

    expect(res.status).toBe(201);
    expect(res.body.beneficiaryName).toBe('Ramesh Patel');
    expect(res.body.status).toBe('DRAFT');
    expect(financeStore.preparePayout).toHaveBeenCalled();
  });

  it('enforces strict maker-checker segregation: payout preparer cannot approve own payout', async () => {
    const { app } = setupFinanceApp(officerActor);

    // Officer attempting to approve
    const res = await request(app)
      .post(`/api/v2/finance/payout-instructions/${PAYOUT_ID}/decision`)
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        version: 1,
        decision: 'APPROVE',
        reason: 'Attempted self-approval',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYOUT_SELF_APPROVAL_DENIED');
  });

  it('allows independent controller to authorize payout instruction', async () => {
    const { app } = setupFinanceApp(approverActor);

    const res = await request(app)
      .post(`/api/v2/finance/payout-instructions/${PAYOUT_ID}/decision`)
      .set('Authorization', 'Bearer approver-token')
      .send({
        version: 1,
        decision: 'APPROVE',
        reason: 'Authorized bank disbursement',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  it('records incoming customer receipts with unapplied funds tracking', async () => {
    const { app, financeStore } = setupFinanceApp(officerActor);

    const res = await request(app)
      .post('/api/v2/finance/receipts')
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        payerName: 'Vikram Malhotra',
        paymentMode: 'IMPS',
        bankReference: 'UTR99887766',
        amountPaise: '50000000',
      });

    expect(res.status).toBe(201);
    expect(res.body.payerName).toBe('Vikram Malhotra');
    expect(res.body.amountPaise).toBe('50000000');
    expect(financeStore.recordIncomingReceipt).toHaveBeenCalled();
  });

  it('allocates receipt funds and marks buyer obligation delivery-eligible upon zero remaining balance', async () => {
    const { app, financeStore } = setupFinanceApp(officerActor);

    const res = await request(app)
      .post(`/api/v2/finance/receipts/${RECEIPT_ID}/allocate`)
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        obligationId: OBLIGATION_ID,
        amountPaise: '50000000',
      });

    expect(res.status).toBe(200);
    expect(res.body.obligation.remainingBalancePaise).toBe('0');
    expect(res.body.obligation.deliveryEligible).toBe(true);
    expect(financeStore.allocateReceipt).toHaveBeenCalled();
  });

  it('normalizes the Finance Portal refund form while preserving a linked customer-payment source', async () => {
    const requestRefund = vi.fn().mockResolvedValue({
      id: 'refund-1',
      refundNumber: 'REF-2026-0001',
      status: 'APPROVAL_PENDING',
      requestedAmountPaise: '250000',
    });
    const { app } = setupFinanceApp(officerActor, { requestRefund } as any);

    const res = await request(app)
      .post('/api/v2/finance/refunds')
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        obligationId: OBLIGATION_ID,
        beneficiaryName: 'Rahul Verma',
        beneficiaryAccountMasked: 'XXXX 4321',
        refundAmountPaise: '250000',
        reason: 'BOOKING_CANCELLATION',
        notes: 'The booking was cancelled before delivery.',
      });

    expect(res.status).toBe(201);
    expect(requestRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        obligationId: OBLIGATION_ID,
        requestedAmountPaise: '250000',
        reason: 'CANCELLED_RESERVATION',
      })
    );
  });

  it('enforces balanced double-entry accounting: rejects unbalanced journal entry', async () => {
    const { app } = setupFinanceApp(officerActor);

    const res = await request(app)
      .post('/api/v2/finance/journals')
      .set('Authorization', 'Bearer valid-officer-token')
      .send({
        postingDate: new Date().toISOString(),
        periodId: PERIOD_ID,
        sourceType: 'MANUAL',
        description: 'Unbalanced entry test',
        lines: [
          { accountId: ACC1_ID, debitPaise: '1000000', creditPaise: '0' },
          { accountId: ACC2_ID, debitPaise: '0', creditPaise: '900000' }, // Out of balance by 100000
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNBALANCED_JOURNAL_ENTRY_DEBITS_MUST_EQUAL_CREDITS');
  });

  it('executes payout instruction and accepts optional company bank account and notes', async () => {
    const { app, financeStore } = setupFinanceApp(approverActor);

    const res = await request(app)
      .post(`/api/v2/finance/payout-instructions/${PAYOUT_ID}/execute`)
      .set('Authorization', 'Bearer approver-token')
      .send({
        version: 1,
        bankReference: 'UTR-987654321',
        companyBankAccountId: '',
        notes: 'Disbursed via HDFC portal',
      });

    expect(res.status).toBe(200);
    expect(res.body.bankReference).toBe('UTR-123456');
    expect(financeStore.executePayout).toHaveBeenCalledWith(
      expect.anything(),
      PAYOUT_ID,
      1,
      'UTR-987654321',
      'Disbursed via HDFC portal',
      undefined
    );
  });

  it('edits bank-account metadata and removes an account through protected finance endpoints', async () => {
    const updateBankAccount = vi.fn().mockResolvedValue({
      id: BANK_ACCOUNT_ID,
      bankName: 'HDFC Bank',
      accountName: 'V MOTIV AUTOMOTIVE INDIA PVT LTD',
      accountNumberMasked: 'XXXX 9876',
      ifscCode: 'HDFC0000001',
      active: true,
    });
    const removeBankAccount = vi.fn().mockResolvedValue({ id: BANK_ACCOUNT_ID, action: 'DEACTIVATED', references: 2 });
    const { app } = setupFinanceApp(approverActor, { updateBankAccount, removeBankAccount } as any);

    const edited = await request(app)
      .patch(`/api/v2/finance/bank-accounts/${BANK_ACCOUNT_ID}`)
      .set('Authorization', 'Bearer approver-token')
      .send({
        bankName: 'HDFC Bank',
        accountName: 'V MOTIV AUTOMOTIVE INDIA PVT LTD',
        accountNumberMasked: 'XXXX 9876',
        ifscCode: 'HDFC0000001',
        branchName: 'Indiranagar',
        accountType: 'CURRENT',
      });
    expect(edited.status).toBe(200);
    expect(updateBankAccount).toHaveBeenCalledWith(expect.anything(), BANK_ACCOUNT_ID, expect.objectContaining({ bankName: 'HDFC Bank' }));

    const removed = await request(app)
      .delete(`/api/v2/finance/bank-accounts/${BANK_ACCOUNT_ID}`)
      .set('Authorization', 'Bearer approver-token');
    expect(removed.status).toBe(200);
    expect(removed.body.action).toBe('DEACTIVATED');
    expect(removeBankAccount).toHaveBeenCalledWith(expect.anything(), BANK_ACCOUNT_ID);
  });

  it('computes unit-level vehicle profitability comparing acquisition, refurbishment and realized sale', async () => {
    const { app } = setupFinanceApp(officerActor);

    const res = await request(app)
      .get('/api/v2/finance/profitability')
      .set('Authorization', 'Bearer valid-officer-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const item = res.body[0];
    expect(item.make).toBe('Hyundai');
    expect(item.totalInvestedPaise).toBe('94500000');
    expect(item.realizedGrossMarginPaise).toBe('10500000');
    expect(item.realizedGrossMarginPercent).toBe(10.0);
    expect(item.deliveryEligible).toBe(true);
  });
});
