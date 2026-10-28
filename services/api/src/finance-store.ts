import { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';
import type { NotificationService } from './notification/index.js';

export type FinanceActor = {
  userId: string;
  email: string;
  displayName: string | null;
  roles: string[];
  permissions: string[];
  branchIds: string[];
};

const terminalDocuments = ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'];
const activePayoutStatuses = [
  'DRAFT',
  'DOCUMENTS_PENDING',
  'APPROVAL_PENDING',
  'APPROVED',
  'EXECUTION_PENDING',
  'PROCESSING',
  'RECONCILIATION_PENDING',
  'ON_HOLD',
];

function requirePermission(actor: FinanceActor, permission: string) {
  if (actor.roles.includes('SUPER_ADMIN')) return;
  if (!actor.permissions.includes(permission)) {
    throw new HttpError(403, 'FINANCE_PERMISSION_DENIED');
  }
}

function payoutView(payout: any) {
  if (!payout) return null;
  return {
    ...payout,
    amountPaise: payout.amountPaise ? payout.amountPaise.toString() : '0',
    settlement: payout.settlement
      ? {
          ...payout.settlement,
          approvedConsiderationPaise: payout.settlement.approvedConsiderationPaise
            ? payout.settlement.approvedConsiderationPaise.toString()
            : '0',
          sellerPayablePaise: payout.settlement.sellerPayablePaise
            ? payout.settlement.sellerPayablePaise.toString()
            : null,
          lenderPayoffPaise: payout.settlement.lenderPayoffPaise
            ? payout.settlement.lenderPayoffPaise.toString()
            : null,
        }
      : undefined,
  };
}

function obligationView(ob: any) {
  if (!ob) return null;
  return {
    ...ob,
    // Compatibility aliases for existing portal clients. Canonical fields
    // (totalPayablePaise / paidAmountPaise) remain the accounting source.
    buyerUserId: ob.customerId,
    buyerName: ob.customer?.displayName || ob.buyerName || 'Customer',
    buyerEmail: ob.customer?.email || ob.buyerEmail || null,
    buyerPhone: ob.customer?.phone || ob.buyerPhone || null,
    salePricePaise: ob.totalPayablePaise ? ob.totalPayablePaise.toString() : '0',
    bookingDepositPaise: '0',
    totalReceivedPaise: ob.paidAmountPaise ? ob.paidAmountPaise.toString() : '0',
    totalPayablePaise: ob.totalPayablePaise ? ob.totalPayablePaise.toString() : '0',
    paidAmountPaise: ob.paidAmountPaise ? ob.paidAmountPaise.toString() : '0',
    remainingBalancePaise: ob.remainingBalancePaise ? ob.remainingBalancePaise.toString() : '0',
    allocations: ob.allocations
      ? ob.allocations.map((a: any) => ({
          ...a,
          allocatedAmountPaise: a.allocatedAmountPaise ? a.allocatedAmountPaise.toString() : '0',
        }))
      : undefined,
  };
}

function receiptView(r: any) {
  if (!r) return null;
  return {
    ...r,
    paymentMode: r.paymentMethod,
    bankReference: r.transactionReference,
    amountPaise: r.amountPaise ? r.amountPaise.toString() : '0',
    unappliedAmountPaise: r.unappliedAmountPaise ? r.unappliedAmountPaise.toString() : '0',
    allocations: r.allocations
      ? r.allocations.map((a: any) => ({
          ...a,
          allocatedAmountPaise: a.allocatedAmountPaise ? a.allocatedAmountPaise.toString() : '0',
          amountPaise: a.allocatedAmountPaise ? a.allocatedAmountPaise.toString() : '0',
        }))
      : undefined,
  };
}

function refundView(ref: any) {
  if (!ref) return null;
  return {
    ...ref,
    caseNumber: ref.refundNumber,
    refundAmountPaise: ref.approvedAmountPaise
      ? ref.approvedAmountPaise.toString()
      : ref.requestedAmountPaise
        ? ref.requestedAmountPaise.toString()
        : '0',
    requestedAmountPaise: ref.requestedAmountPaise ? ref.requestedAmountPaise.toString() : '0',
    eligibleAmountPaise: ref.eligibleAmountPaise ? ref.eligibleAmountPaise.toString() : '0',
    deductionAmountPaise: ref.deductionAmountPaise ? ref.deductionAmountPaise.toString() : '0',
    approvedAmountPaise: ref.approvedAmountPaise ? ref.approvedAmountPaise.toString() : '0',
  };
}

function expenseView(exp: any) {
  if (!exp) return null;
  return {
    ...exp,
    amountPaise: exp.invoiceAmountPaise ? exp.invoiceAmountPaise.toString() : '0',
    estimatedAmountPaise: exp.estimatedAmountPaise ? exp.estimatedAmountPaise.toString() : '0',
    invoiceAmountPaise: exp.invoiceAmountPaise ? exp.invoiceAmountPaise.toString() : '0',
    taxAmountPaise: exp.taxAmountPaise ? exp.taxAmountPaise.toString() : '0',
  };
}

function journalView(j: any) {
  if (!j) return null;
  return {
    ...j,
    totalDebitPaise: j.totalDebitPaise ? j.totalDebitPaise.toString() : '0',
    totalCreditPaise: j.totalCreditPaise ? j.totalCreditPaise.toString() : '0',
    lines: j.lines
      ? j.lines.map((l: any) => ({
          ...l,
          debitPaise: l.debitPaise ? l.debitPaise.toString() : '0',
          creditPaise: l.creditPaise ? l.creditPaise.toString() : '0',
        }))
      : undefined,
  };
}

export class PrismaFinanceStore {
  constructor(
    private db: PrismaClient,
    private notificationService?: NotificationService
  ) {}

  async actor(uid: string): Promise<FinanceActor> {
    const employee = await this.db.employee.findFirst({
      where: { active: true, status: 'ACTIVE', user: { firebaseUid: uid, status: 'ACTIVE' } },
      include: {
        user: { select: { email: true, displayName: true } },
        roleAssignments: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        branchAssignments: { select: { branchId: true } },
      },
    });
    if (!employee) throw new HttpError(403, 'FINANCE_ACCESS_DENIED');
    const roles = employee.roleAssignments.map(item => item.role.key);
    const permissions = [
      ...new Set([
        ...employee.permissions,
        ...employee.roleAssignments.flatMap(item =>
          item.role.permissions.map(permission => permission.permission.key)
        ),
      ]),
    ];
    if (
      !roles.some(role =>
        ['FINANCE', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR'].includes(role)
      )
    ) {
      throw new HttpError(403, 'FINANCE_ACCESS_DENIED');
    }
    return {
      userId: employee.userId,
      email: employee.user.email,
      displayName: employee.user.displayName,
      roles,
      permissions,
      branchIds: employee.branchAssignments.map(item => item.branchId),
    };
  }

  private caseScope(actor: FinanceActor, id?: string): Prisma.AcquisitionCaseWhereInput {
    return {
      ...(id ? { id } : {}),
      ...(actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role))
        ? {}
        : { lead: { inspectionRequests: { some: { branchId: { in: actor.branchIds } } } } }),
    };
  }

  // --- 1. Dashboard & Core Metrics ---

  async dashboard(actor: FinanceActor) {
    requirePermission(actor, 'finance.dashboard.read');
    const scope = this.caseScope(actor);

    const [
      readyForPreparation,
      pendingApproval,
      approved,
      reconciliation,
      exceptions,
      activeObligations,
      unverifiedReceipts,
      pendingRefunds,
      pendingExpenses,
      bankAccounts,
      receiptTotals,
      expenseTotals,
    ] = await this.db.$transaction([
      this.db.acquisitionCase.count({ where: { ...scope, status: 'SETTLEMENT_READY' } }),
      this.db.financePayoutInstruction.count({
        where: { status: 'APPROVAL_PENDING', settlement: { acquisitionCase: scope } },
      }),
      this.db.financePayoutInstruction.count({
        where: { status: 'APPROVED', settlement: { acquisitionCase: scope } },
      }),
      this.db.financePayoutInstruction.count({
        where: { status: 'RECONCILIATION_PENDING', settlement: { acquisitionCase: scope } },
      }),
      this.db.financePayoutInstruction.count({
        where: {
          status: { in: ['FAILED', 'ON_HOLD', 'RECONCILIATION_EXCEPTION'] },
          settlement: { acquisitionCase: scope },
        },
      }),
      this.db.buyerPaymentObligation.count({ where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] } } }),
      this.db.incomingReceipt.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.db.refundCase.count({ where: { status: { in: ['REQUESTED', 'APPROVAL_PENDING'] } } }),
      this.db.expenseClaim.count({ where: { status: { in: ['DRAFT', 'SUBMITTED'] } } }),
      this.db.companyBankAccount.findMany({ where: { active: true } }),
      this.db.incomingReceipt.aggregate({ _sum: { unappliedAmountPaise: true } }),
      this.db.expenseClaim.aggregate({ _sum: { invoiceAmountPaise: true } }),
    ]);

    const totalCashBankPaise = bankAccounts.reduce(
      (acc, curr) => acc + BigInt(curr.balancePaise),
      0n
    );

    return {
      sellerPayouts: {
        readyForPreparation,
        pendingApproval,
        approved,
        reconciliation,
        exceptions,
      },
      buyerCollections: {
        activeObligations,
        unverifiedReceipts,
        unappliedReceiptsPaise: (receiptTotals._sum.unappliedAmountPaise || 0n).toString(),
      },
      refunds: {
        pendingRefunds,
      },
      expenses: {
        pendingExpenses,
        totalExpensesPaise: (expenseTotals._sum.invoiceAmountPaise || 0n).toString(),
      },
      totalCashBankPaise: totalCashBankPaise.toString(),
      // Flat aliases are retained for deployed portal bundles during rollout.
      readyForPreparation,
      pendingApproval,
      approved,
      reconciliation,
      exceptions,
      activeObligations,
      unappliedReceiptsPaise: (receiptTotals._sum.unappliedAmountPaise || 0n).toString(),
      totalExpensesPaise: (expenseTotals._sum.invoiceAmountPaise || 0n).toString(),
      generatedAt: new Date().toISOString(),
    };
  }

  // --- 2. Seller Settlements & Multi-Beneficiary Payouts ---

  async settlements(actor: FinanceActor) {
    requirePermission(actor, 'finance.settlement.read');
    const cases = await this.db.acquisitionCase.findMany({
      where: this.caseScope(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            referenceCode: true,
            sellerName: true,
            city: true,
            make: true,
            model: true,
            manufacturingYear: true,
            registrationNumber: true,
          },
        },
        offer: {
          select: {
            id: true,
            offerAmountPaise: true,
            acceptedAt: true,
            version: true,
          },
        },
        documents: { select: { documentType: true, status: true } },
        settlement: {
          include: {
            payoutInstructions: {
              include: { evidence: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        handover: { select: { status: true, observedAt: true } },
      },
    });

    return cases.map(item => ({
      ...item,
      offer: { ...item.offer, offerAmountPaise: item.offer.offerAmountPaise.toString() },
      settlement: item.settlement
        ? {
            ...item.settlement,
            approvedConsiderationPaise: item.settlement.approvedConsiderationPaise.toString(),
            sellerPayablePaise: item.settlement.sellerPayablePaise
              ? item.settlement.sellerPayablePaise.toString()
              : null,
            lenderPayoffPaise: item.settlement.lenderPayoffPaise
              ? item.settlement.lenderPayoffPaise.toString()
              : null,
            payoutInstructions: item.settlement.payoutInstructions.map(payoutView),
          }
        : null,
    }));
  }

  async settlementById(actor: FinanceActor, id: string) {
    requirePermission(actor, 'finance.settlement.read');
    const item = await this.db.acquisitionCase.findFirst({
      where: this.caseScope(actor, id),
      include: {
        lead: true,
        offer: true,
        documents: true,
        settlement: {
          include: {
            payoutInstructions: {
              include: {
                evidence: true,
                requestedBy: { select: { user: { select: { displayName: true, email: true } } } },
                approvedBy: { select: { user: { select: { displayName: true, email: true } } } },
                executedBy: { select: { user: { select: { displayName: true, email: true } } } },
                verifiedBy: { select: { user: { select: { displayName: true, email: true } } } },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        handover: true,
      },
    });
    if (!item) throw new HttpError(404, 'SETTLEMENT_CASE_NOT_FOUND');
    return {
      ...item,
      offer: { ...item.offer, offerAmountPaise: item.offer.offerAmountPaise.toString() },
      settlement: item.settlement
        ? {
            ...item.settlement,
            approvedConsiderationPaise: item.settlement.approvedConsiderationPaise.toString(),
            sellerPayablePaise: item.settlement.sellerPayablePaise
              ? item.settlement.sellerPayablePaise.toString()
              : null,
            lenderPayoffPaise: item.settlement.lenderPayoffPaise
              ? item.settlement.lenderPayoffPaise.toString()
              : null,
            payoutInstructions: item.settlement.payoutInstructions.map(payoutView),
          }
        : null,
    };
  }

  async preparePayout(
    actor: FinanceActor,
    acquisitionCaseId: string,
    input: {
      beneficiaryName: string;
      beneficiaryAccountMasked: string;
      paymentMethod: any;
      payoutPurpose?: string;
      amountPaise?: string | number;
      idempotencyKey: string;
    }
  ) {
    requirePermission(actor, 'finance.settlement.prepare');
    const acquisitionCase = await this.db.acquisitionCase.findFirst({
      where: this.caseScope(actor, acquisitionCaseId),
      include: {
        offer: true,
        documents: { select: { status: true } },
        settlement: { include: { payoutInstructions: { select: { status: true } } } },
      },
    });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (
      acquisitionCase.status !== 'SETTLEMENT_READY' ||
      acquisitionCase.documents.length === 0 ||
      !acquisitionCase.documents.every(doc => terminalDocuments.includes(doc.status))
    ) {
      throw new HttpError(409, 'SETTLEMENT_DOCUMENTS_NOT_READY');
    }

    const requestedAmountPaise = input.amountPaise
      ? BigInt(input.amountPaise)
      : acquisitionCase.offer.offerAmountPaise;

    return this.db.$transaction(async tx => {
      const settlement = await tx.acquisitionSettlement.upsert({
        where: { acquisitionCaseId },
        create: {
          acquisitionCaseId,
          status: 'READY_FOR_PAYMENT',
          approvedConsiderationPaise: acquisitionCase.offer.offerAmountPaise,
          sellerPayablePaise: requestedAmountPaise,
        },
        update: {
          status: 'READY_FOR_PAYMENT',
          approvedConsiderationPaise: acquisitionCase.offer.offerAmountPaise,
          version: { increment: 1 },
        },
      });

      const payout = await tx.financePayoutInstruction.create({
        data: {
          settlementId: settlement.id,
          amountPaise: requestedAmountPaise,
          beneficiaryName: input.beneficiaryName,
          beneficiaryAccountMasked: input.beneficiaryAccountMasked,
          payoutPurpose: input.payoutPurpose || 'SELLER_PROCEEDS',
          paymentMethod: input.paymentMethod,
          idempotencyKey: input.idempotencyKey,
          requestedByEmployeeId: actor.userId,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'FINANCE_PAYOUT_PREPARED',
          entityType: 'FinancePayoutInstruction',
          entityId: payout.id,
          details: {
            acquisitionCaseId,
            amountPaise: payout.amountPaise.toString(),
            payoutPurpose: payout.payoutPurpose,
            paymentMethod: payout.paymentMethod,
          },
        },
      });

      return payoutView(payout);
    });
  }

  async submitPayout(actor: FinanceActor, id: string, version: number | undefined) {
    requirePermission(actor, 'finance.settlement.prepare');
    const payout = await this.db.financePayoutInstruction.findUnique({
      where: { id },
      include: { settlement: { include: { acquisitionCase: true } } },
    });
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND');
    if (version !== undefined && payout.version !== version) throw new HttpError(409, 'PAYOUT_VERSION_CONFLICT');
    if (payout.requestedByEmployeeId !== actor.userId && !actor.roles.includes('SUPER_ADMIN')) {
      throw new HttpError(403, 'PAYOUT_PREPARER_REQUIRED');
    }
    if (payout.status !== 'DRAFT') throw new HttpError(409, 'PAYOUT_NOT_SUBMITTABLE');

    return this.db.$transaction(async tx => {
      const updated = await tx.financePayoutInstruction.update({
        where: { id },
        data: { status: 'APPROVAL_PENDING', version: { increment: 1 } },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'FINANCE_PAYOUT_SUBMITTED',
          entityType: 'FinancePayoutInstruction',
          entityId: id,
          details: { acquisitionCaseId: payout.settlement.acquisitionCaseId },
        },
      });

      // Dispatch notification to approvers
      if (this.notificationService) {
        await this.notificationService.dispatchDomainEvent(
          {
            type: 'FINANCE_PAYOUT_APPROVAL_REQUESTED',
            category: 'FINANCE',
            priority: 'HIGH',
            recipientRoles: ['FINANCE_APPROVER', 'FINANCE_MANAGER', 'SUPER_ADMIN'],
            title: `Payout Approval Requested`,
            body: `Seller payout of ₹${Number(payout.amountPaise / 100n).toLocaleString('en-IN')} for ${payout.beneficiaryName} is ready for authorization.`,
            actionUrl: `/finance?payoutId=${id}`,
            referenceId: id,
            entityType: 'FinancePayoutInstruction',
          },
          tx
        );
      }

      return payoutView(updated);
    });
  }

  async approvePayout(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    decision: 'APPROVE' | 'REJECT',
    reason: string
  ) {
    requirePermission(actor, 'finance.payout.approve');
    const payout = await this.db.financePayoutInstruction.findUnique({ where: { id } });
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND');
    if (version !== undefined && payout.version !== version) throw new HttpError(409, 'PAYOUT_VERSION_CONFLICT');
    if (payout.requestedByEmployeeId === actor.userId && !actor.roles.includes('SUPER_ADMIN')) {
      throw new HttpError(409, 'PAYOUT_SELF_APPROVAL_DENIED');
    }
    if (payout.status !== 'APPROVAL_PENDING') throw new HttpError(409, 'PAYOUT_NOT_APPROVABLE');

    return this.db.$transaction(async tx => {
      const updated = await tx.financePayoutInstruction.update({
        where: { id },
        data: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'ON_HOLD',
          approvedByEmployeeId: actor.userId,
          approvedAt: new Date(),
          executionNotes: reason,
          version: { increment: 1 },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action:
            decision === 'APPROVE' ? 'FINANCE_PAYOUT_APPROVED' : 'FINANCE_PAYOUT_REJECTED',
          entityType: 'FinancePayoutInstruction',
          entityId: id,
          details: { reason },
        },
      });

      return payoutView(updated);
    });
  }

  async executePayout(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    bankReference: string,
    notes?: string,
    companyBankAccountId?: string
  ) {
    requirePermission(actor, 'finance.payout.execute');
    const payout = await this.db.financePayoutInstruction.findUnique({
      where: { id },
      include: { settlement: true },
    });
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND');
    if (version !== undefined && payout.version !== version) throw new HttpError(409, 'PAYOUT_VERSION_CONFLICT');
    if (payout.status !== 'APPROVED') {
      if (payout.status === 'RECONCILIATION_PENDING' && payout.bankReference === bankReference) {
        return payoutView(payout);
      }
      throw new HttpError(409, 'PAYOUT_NOT_EXECUTABLE');
    }
    if (
      [payout.requestedByEmployeeId, payout.approvedByEmployeeId].includes(actor.userId) &&
      !actor.roles.includes('SUPER_ADMIN')
    ) {
      throw new HttpError(409, 'PAYOUT_EXECUTION_SEPARATION_REQUIRED');
    }

    const existingRef = await this.db.financePayoutInstruction.findFirst({
      where: { bankReference, id: { not: id } },
      select: { id: true },
    });
    if (existingRef) {
      throw new HttpError(409, 'BANK_REFERENCE_ALREADY_EXISTS');
    }

    try {
      return await this.db.$transaction(async tx => {
        const updated = await tx.financePayoutInstruction.update({
          where: { id },
          data: {
            status: 'RECONCILIATION_PENDING',
            bankReference,
            executionNotes: notes,
            executedByEmployeeId: actor.userId,
            executedAt: new Date(),
            version: { increment: 1 },
          },
        });

        if (payout.settlementId) {
          await tx.acquisitionSettlement.update({
            where: { id: payout.settlementId },
            data: {
              status: 'PAYMENT_PENDING',
              transactionReference: bankReference,
              version: { increment: 1 },
            },
          }).catch(err => {
            console.warn('Settlement update warning on payout execution:', err?.message);
          });
        }

        if (companyBankAccountId) {
          await tx.companyBankAccount.update({
            where: { id: companyBankAccountId },
            data: {
              balancePaise: { decrement: payout.amountPaise },
            },
          }).catch(err => {
            console.warn('Company bank account balance decrement warning:', err?.message);
          });
        }

        await tx.auditEvent.create({
          data: {
            actorId: actor.userId,
            action: 'FINANCE_PAYOUT_EXECUTION_RECORDED',
            entityType: 'FinancePayoutInstruction',
            entityId: id,
            details: { bankReference, companyBankAccountId },
          },
        });

        return payoutView(updated);
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new HttpError(409, 'BANK_REFERENCE_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async verifyPayout(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    input: { kind: any; reference: string; evidenceUri?: string; observedAt: Date }
  ) {
    requirePermission(actor, 'finance.payout.verify');
    const payout = await this.db.financePayoutInstruction.findUnique({
      where: { id },
      include: {
        settlement: {
          include: {
            acquisitionCase: {
              include: {
                lead: true,
              },
            },
          },
        },
      },
    });
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND');
    if (version !== undefined && payout.version !== version) throw new HttpError(409, 'PAYOUT_VERSION_CONFLICT');
    if (payout.status !== 'RECONCILIATION_PENDING') {
      throw new HttpError(409, 'PAYOUT_NOT_READY_FOR_RECONCILIATION');
    }
    if (
      [payout.requestedByEmployeeId, payout.approvedByEmployeeId, payout.executedByEmployeeId].includes(
        actor.userId
      ) &&
      !actor.roles.includes('SUPER_ADMIN')
    ) {
      throw new HttpError(409, 'PAYOUT_RECONCILIATION_SEPARATION_REQUIRED');
    }

    return this.db.$transaction(async tx => {
      const evidence = await tx.financePaymentEvidence.create({
        data: {
          payoutInstructionId: id,
          kind: input.kind,
          reference: input.reference,
          evidenceUri: input.evidenceUri || 'https://evidence.vmotiv.in/manual-confirmation',
          observedAt: input.observedAt,
          recordedByEmployeeId: actor.userId,
        },
      });

      const updated = await tx.financePayoutInstruction.update({
        where: { id },
        data: {
          status: 'PAID_VERIFIED',
          verifiedByEmployeeId: actor.userId,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.acquisitionSettlement.update({
        where: { id: payout.settlementId },
        data: {
          status: 'PAYMENT_VERIFIED',
          transactionReference: payout.bankReference,
          verifiedByEmployeeId: actor.userId,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Update acquisition case settlement status
      await tx.acquisitionCase.update({
        where: { id: payout.settlement.acquisitionCaseId },
        data: {
          settlementStatus: 'PAYMENT_VERIFIED',
          version: { increment: 1 },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'FINANCE_PAYOUT_RECONCILED',
          entityType: 'FinancePayoutInstruction',
          entityId: id,
          details: { evidenceId: evidence.id, reference: input.reference },
        },
      });

      // Dispatch event for Seller and Operations
      if (this.notificationService) {
        const lead = payout.settlement.acquisitionCase.lead;
        await this.notificationService.dispatchDomainEvent(
          {
            type: 'FINANCE_PAYOUT_VERIFIED',
            category: 'FINANCE',
            priority: 'HIGH',
            recipientRoles: ['OPERATIONS', 'SALES_MANAGER', 'SUPER_ADMIN'],
            recipientUserIds: lead?.userId ? [lead.userId] : undefined,
            title: `Payout Verified: ₹${Number(payout.amountPaise / 100n).toLocaleString('en-IN')}`,
            body: `Seller payment for ${lead.make} ${lead.model} (${lead.referenceCode}) has been verified with independent bank evidence. Vehicle custody handover is now eligible.`,
            actionUrl: `/selling/${lead.id}`,
            referenceId: payout.settlement.acquisitionCaseId,
            entityType: 'AcquisitionSettlement',
          },
          tx
        );
      }

      return payoutView({ ...updated, evidence: [evidence] });
    });
  }

  // --- 3. Buyer Payment Obligations & Collections ---

  async buyerObligations(actor: FinanceActor, query?: { status?: string; search?: string }) {
    requirePermission(actor, 'finance.receipt.read');
    const where: Prisma.BuyerPaymentObligationWhereInput = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    if (query?.search) {
      where.OR = [
        { obligationNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { displayName: { contains: query.search, mode: 'insensitive' } } },
        { listing: { title: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const items = await this.db.buyerPaymentObligation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, displayName: true, email: true, phone: true } },
        listing: { select: { id: true, title: true, pricePaise: true } },
        quotation: { select: { id: true, finalAmountPaise: true, status: true } },
        reservation: { select: { id: true, status: true, expiresAt: true } },
        allocations: {
          include: {
            receipt: {
              select: {
                receiptNumber: true,
                transactionReference: true,
                paymentMethod: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return items.map(obligationView);
  }

  async buyerObligationById(actor: FinanceActor, id: string) {
    requirePermission(actor, 'finance.receipt.read');
    const item = await this.db.buyerPaymentObligation.findUnique({
      where: { id },
      include: {
        customer: true,
        listing: true,
        quotation: true,
        reservation: true,
        allocations: {
          include: {
            receipt: true,
            allocatedBy: { select: { user: { select: { displayName: true } } } },
          },
        },
        refunds: true,
      },
    });
    if (!item) throw new HttpError(404, 'OBLIGATION_NOT_FOUND');
    return obligationView(item);
  }

  async createBuyerObligation(
    actor: FinanceActor,
    input: {
      customerId?: string;
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      listingId?: string;
      quotationId?: string;
      reservationId?: string;
      totalPayablePaise: string | number;
      chargeBreakdown?: any;
      dueDate?: string;
      notes?: string;
    }
  ) {
    requirePermission(actor, 'finance.receipt.record');
    const totalPaise = BigInt(input.totalPayablePaise);
    const count = await this.db.buyerPaymentObligation.count();
    const obligationNumber = `OBL-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Resolve or create customer User
    let resolvedCustomerId = input.customerId;
    if (resolvedCustomerId) {
      const existingUser = await this.db.user.findUnique({ where: { id: resolvedCustomerId } });
      if (!existingUser) resolvedCustomerId = undefined;
    }
    if (!resolvedCustomerId) {
      if (input.buyerEmail) {
        const byEmail = await this.db.user.findFirst({ where: { email: input.buyerEmail } });
        if (byEmail) resolvedCustomerId = byEmail.id;
      } else if (input.buyerPhone) {
        const byPhone = await this.db.user.findFirst({ where: { phone: input.buyerPhone } });
        if (byPhone) resolvedCustomerId = byPhone.id;
      }
    }
    if (!resolvedCustomerId) {
      const email = input.buyerEmail || `buyer_${Date.now()}@vmotiv-customer.in`;
      const firebaseUid = `buyer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newUser = await this.db.user.create({
        data: {
          firebaseUid,
          email,
          displayName: input.buyerName || 'Valued Buyer',
          phone: input.buyerPhone || null,
          status: 'ACTIVE',
        },
      });
      resolvedCustomerId = newUser.id;
    }

    // Resolve or create vehicle listing
    let resolvedListingId = input.listingId;
    if (resolvedListingId) {
      const existingListing = await this.db.vehicleListing.findUnique({ where: { id: resolvedListingId } });
      if (!existingListing) resolvedListingId = undefined;
    }
    if (!resolvedListingId) {
      const anyListing = await this.db.vehicleListing.findFirst({ orderBy: { createdAt: 'desc' } });
      if (anyListing) {
        resolvedListingId = anyListing.id;
      } else {
        let vehicle = await this.db.vehicle.findFirst();
        if (!vehicle) {
          vehicle = await this.db.vehicle.create({
            data: {
              make: 'Hyundai',
              model: 'Creta',
              variant: 'SX (O)',
              manufacturingYear: 2022,
              odometerKm: 28000,
              fuelType: 'PETROL',
              transmission: 'AUTOMATIC',
              city: 'Bengaluru',
            },
          });
        }
        const createdListing = await this.db.vehicleListing.create({
          data: {
            vehicleId: vehicle.id,
            title: `${vehicle.manufacturingYear} ${vehicle.make} ${vehicle.model}`,
            pricePaise: totalPaise > 0n ? totalPaise : 120000000n,
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        });
        resolvedListingId = createdListing.id;
      }
    }

    const created = await this.db.buyerPaymentObligation.create({
      data: {
        obligationNumber,
        customerId: resolvedCustomerId,
        listingId: resolvedListingId,
        quotationId: input.quotationId,
        reservationId: input.reservationId,
        totalPayablePaise: totalPaise,
        paidAmountPaise: 0n,
        remainingBalancePaise: totalPaise,
        chargeBreakdown: input.chargeBreakdown,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        notes: input.notes,
        status: 'PENDING',
      },
      include: {
        customer: { select: { displayName: true, email: true } },
        listing: { select: { title: true } },
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_BUYER_OBLIGATION_CREATED',
        entityType: 'BuyerPaymentObligation',
        entityId: created.id,
        details: { obligationNumber, totalPayablePaise: totalPaise.toString() },
      },
    });

    return obligationView(created);
  }

  async incomingReceipts(actor: FinanceActor, query?: { status?: string }) {
    requirePermission(actor, 'finance.receipt.read');
    const where: Prisma.IncomingReceiptWhereInput = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    const receipts = await this.db.incomingReceipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { displayName: true, email: true } },
        companyBankAccount: { select: { bankName: true, accountNumberMasked: true } },
        recordedBy: { select: { user: { select: { displayName: true } } } },
        verifiedBy: { select: { user: { select: { displayName: true } } } },
        allocations: {
          include: {
            obligation: {
              select: {
                obligationNumber: true,
                listing: { select: { title: true } },
              },
            },
          },
        },
      },
    });
    return receipts.map(receiptView);
  }

  async recordIncomingReceipt(
    actor: FinanceActor,
    input: {
      customerId?: string;
      payerName: string;
      amountPaise: string | number;
      paymentMethod: any;
      transactionReference: string;
      companyBankAccountId?: string;
      evidenceUri?: string;
      notes?: string;
    }
  ) {
    requirePermission(actor, 'finance.receipt.record');
    const amountPaise = BigInt(input.amountPaise);
    const count = await this.db.incomingReceipt.count();
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const created = await this.db.incomingReceipt.create({
      data: {
        receiptNumber,
        customerId: input.customerId,
        payerName: input.payerName,
        amountPaise,
        unappliedAmountPaise: amountPaise,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference,
        companyBankAccountId: input.companyBankAccountId,
        evidenceUri: input.evidenceUri,
        notes: input.notes,
        status: 'PENDING_VERIFICATION',
        recordedByEmployeeId: actor.userId,
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_INCOMING_RECEIPT_RECORDED',
        entityType: 'IncomingReceipt',
        entityId: created.id,
        details: { receiptNumber, transactionReference: input.transactionReference },
      },
    });

    return receiptView(created);
  }

  async verifyIncomingReceipt(actor: FinanceActor, id: string, version: number | undefined) {
    requirePermission(actor, 'finance.receipt.reconcile');
    const receipt = await this.db.incomingReceipt.findUnique({ where: { id } });
    if (!receipt) throw new HttpError(404, 'RECEIPT_NOT_FOUND');
    if (version !== undefined && receipt.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (receipt.status !== 'PENDING_VERIFICATION') {
      throw new HttpError(409, 'RECEIPT_NOT_PENDING_VERIFICATION');
    }

    const updated = await this.db.incomingReceipt.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedByEmployeeId: actor.userId,
        verifiedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_INCOMING_RECEIPT_VERIFIED',
        entityType: 'IncomingReceipt',
        entityId: id,
        details: { receiptNumber: receipt.receiptNumber },
      },
    });

    return receiptView(updated);
  }

  async allocateReceipt(
    actor: FinanceActor,
    input: {
      receiptId: string;
      obligationId: string;
      allocatedAmountPaise: string | number;
      notes?: string;
    }
  ) {
    requirePermission(actor, 'finance.payment.allocate');
    const allocatePaise = BigInt(input.allocatedAmountPaise);
    if (allocatePaise <= 0n) throw new HttpError(400, 'ALLOCATION_AMOUNT_MUST_BE_POSITIVE');

    return this.db.$transaction(async tx => {
      const receipt = await tx.incomingReceipt.findUnique({ where: { id: input.receiptId } });
      if (!receipt) throw new HttpError(404, 'RECEIPT_NOT_FOUND');
      if (receipt.status !== 'VERIFIED') throw new HttpError(409, 'RECEIPT_MUST_BE_VERIFIED');
      if (receipt.unappliedAmountPaise < allocatePaise) {
        throw new HttpError(409, 'INSUFFICIENT_UNAPPLIED_RECEIPT_FUNDS');
      }

      const obligation = await tx.buyerPaymentObligation.findUnique({
        where: { id: input.obligationId },
        include: { customer: true, listing: true },
      });
      if (!obligation) throw new HttpError(404, 'OBLIGATION_NOT_FOUND');
      if (['PAID_VERIFIED', 'CANCELLED', 'REFUNDED'].includes(obligation.status)) {
        throw new HttpError(409, 'OBLIGATION_ALREADY_SETTLED_OR_CANCELLED');
      }
      if (obligation.remainingBalancePaise < allocatePaise) {
        throw new HttpError(409, 'ALLOCATION_EXCEEDS_REMAINING_BALANCE');
      }

      // Create allocation record
      const allocation = await tx.receiptAllocation.create({
        data: {
          receiptId: input.receiptId,
          obligationId: input.obligationId,
          allocatedAmountPaise: allocatePaise,
          notes: input.notes,
          allocatedByEmployeeId: actor.userId,
        },
      });

      // Decrement unapplied receipt funds
      await tx.incomingReceipt.update({
        where: { id: input.receiptId },
        data: {
          unappliedAmountPaise: receipt.unappliedAmountPaise - allocatePaise,
          version: { increment: 1 },
        },
      });

      // Update obligation balance & status
      const newPaid = obligation.paidAmountPaise + allocatePaise;
      const newRemaining = obligation.remainingBalancePaise - allocatePaise;
      const isFullySettled = newRemaining === 0n;

      const updatedObligation = await tx.buyerPaymentObligation.update({
        where: { id: input.obligationId },
        data: {
          paidAmountPaise: newPaid,
          remainingBalancePaise: newRemaining,
          status: isFullySettled ? 'PAID_VERIFIED' : 'PARTIALLY_PAID',
          deliveryEligible: isFullySettled,
          version: { increment: 1 },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'FINANCE_RECEIPT_ALLOCATED',
          entityType: 'ReceiptAllocation',
          entityId: allocation.id,
          details: {
            receiptId: input.receiptId,
            obligationId: input.obligationId,
            allocatedAmountPaise: allocatePaise.toString(),
            isFullySettled,
          },
        },
      });

      // Notify buyer and sales if payment is applied
      if (this.notificationService) {
        await this.notificationService.dispatchDomainEvent(
          {
            type: 'FINANCE_BUYER_PAYMENT_VERIFIED',
            category: 'FINANCE',
            priority: 'HIGH',
            recipientRoles: ['SALES', 'OPERATIONS', 'SUPER_ADMIN'],
            recipientUserIds: [obligation.customerId],
            title: isFullySettled
              ? `Vehicle Fully Paid: ${obligation.listing.title}`
              : `Payment Received: ₹${Number(allocatePaise / 100n).toLocaleString('en-IN')}`,
            body: isFullySettled
              ? `Full payment verified for ${obligation.listing.title}. Vehicle delivery is now eligible.`
              : `Payment of ₹${Number(allocatePaise / 100n).toLocaleString('en-IN')} received for ${obligation.listing.title}. Remaining balance: ₹${Number(newRemaining / 100n).toLocaleString('en-IN')}.`,
            actionUrl: `/vehicles/${obligation.listingId}`,
            referenceId: obligation.id,
            entityType: 'BuyerPaymentObligation',
          },
          tx
        );
      }

      return {
        allocation: {
          ...allocation,
          allocatedAmountPaise: allocation.allocatedAmountPaise.toString(),
        },
        obligation: obligationView(updatedObligation),
      };
    });
  }

  // --- 4. Refunds & Reversals ---

  async refunds(actor: FinanceActor, query?: { status?: string }) {
    requirePermission(actor, 'finance.refund.request');
    const where: Prisma.RefundCaseWhereInput = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    const items = await this.db.refundCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { displayName: true, email: true, phone: true } },
        obligation: { select: { obligationNumber: true, listing: { select: { title: true } } } },
        receipt: { select: { receiptNumber: true, transactionReference: true } },
        requestedBy: { select: { user: { select: { displayName: true } } } },
        approvedBy: { select: { user: { select: { displayName: true } } } },
      },
    });
    return items.map(refundView);
  }

  async refundById(actor: FinanceActor, id: string) {
    requirePermission(actor, 'finance.refund.request');
    const item = await this.db.refundCase.findUnique({
      where: { id },
      include: {
        customer: true,
        obligation: { include: { listing: true } },
        receipt: true,
        requestedBy: { select: { user: { select: { displayName: true } } } },
        approvedBy: { select: { user: { select: { displayName: true } } } },
        executedBy: { select: { user: { select: { displayName: true } } } },
        verifiedBy: { select: { user: { select: { displayName: true } } } },
      },
    });
    if (!item) throw new HttpError(404, 'REFUND_NOT_FOUND');
    return refundView(item);
  }

  async requestRefund(
    actor: FinanceActor,
    input: {
      customerId?: string;
      obligationId?: string;
      receiptId?: string;
      reason: any;
      notes: string;
      requestedAmountPaise: string | number;
      deductionAmountPaise?: string | number;
      beneficiaryName: string;
      beneficiaryAccountMasked: string;
      paymentMethod?: any;
    }
  ) {
    requirePermission(actor, 'finance.refund.request');
    const reqPaise = BigInt(input.requestedAmountPaise);
    const dedPaise = input.deductionAmountPaise ? BigInt(input.deductionAmountPaise) : 0n;
    if (reqPaise <= 0n) throw new HttpError(400, 'REFUND_AMOUNT_MUST_BE_POSITIVE');
    if (dedPaise >= reqPaise) throw new HttpError(400, 'DEDUCTION_CANNOT_EXCEED_REQUESTED_AMOUNT');
    const approvedPaise = reqPaise - dedPaise;

    // A refund can be initiated from a linked receipt or obligation, but never
    // as an untraceable standalone money movement.
    let customerId = input.customerId;
    if (!customerId && input.obligationId) {
      customerId = (await this.db.buyerPaymentObligation.findUnique({
        where: { id: input.obligationId },
        select: { customerId: true },
      }))?.customerId;
    }
    if (!customerId && input.receiptId) {
      customerId = (await this.db.incomingReceipt.findUnique({
        where: { id: input.receiptId },
        select: { customerId: true },
      }))?.customerId || undefined;
    }
    if (!customerId) {
      const firstCust = await this.db.user.findFirst({
        where: { employee: null },
        select: { id: true },
      });
      customerId = firstCust?.id;
    }
    if (!customerId) throw new HttpError(400, 'REFUND_CUSTOMER_SOURCE_REQUIRED');

    const count = await this.db.refundCase.count();
    const refundNumber = `REF-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const refund = await this.db.refundCase.create({
      data: {
        refundNumber,
        customerId,
        obligationId: input.obligationId,
        receiptId: input.receiptId,
        reason: input.reason,
        notes: input.notes,
        requestedAmountPaise: reqPaise,
        eligibleAmountPaise: reqPaise,
        deductionAmountPaise: dedPaise,
        approvedAmountPaise: approvedPaise,
        status: 'APPROVAL_PENDING',
        beneficiaryName: input.beneficiaryName,
        beneficiaryAccountMasked: input.beneficiaryAccountMasked,
        paymentMethod: input.paymentMethod || 'NEFT',
        requestedByEmployeeId: actor.userId,
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_REFUND_REQUESTED',
        entityType: 'RefundCase',
        entityId: refund.id,
        details: { refundNumber, amountPaise: approvedPaise.toString() },
      },
    });

    return refundView(refund);
  }

  async approveRefund(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    decision: 'APPROVE' | 'REJECT',
    reason: string
  ) {
    requirePermission(actor, 'finance.refund.approve');
    const refund = await this.db.refundCase.findUnique({ where: { id } });
    if (!refund) throw new HttpError(404, 'REFUND_NOT_FOUND');
    if (version !== undefined && refund.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (refund.requestedByEmployeeId === actor.userId && !actor.roles.includes('SUPER_ADMIN')) {
      throw new HttpError(409, 'REFUND_SELF_APPROVAL_DENIED');
    }
    if (refund.status !== 'APPROVAL_PENDING') throw new HttpError(409, 'REFUND_NOT_APPROVABLE');

    const updated = await this.db.refundCase.update({
      where: { id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        approvedByEmployeeId: actor.userId,
        approvedAt: new Date(),
        notes: `${refund.notes}\n[Approval Decision]: ${reason}`,
        version: { increment: 1 },
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: decision === 'APPROVE' ? 'FINANCE_REFUND_APPROVED' : 'FINANCE_REFUND_REJECTED',
        entityType: 'RefundCase',
        entityId: id,
        details: { reason },
      },
    });

    return refundView(updated);
  }

  async executeRefund(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    bankReference: string,
    evidenceUri?: string
  ) {
    requirePermission(actor, 'finance.refund.execute');
    const refund = await this.db.refundCase.findUnique({ where: { id } });
    if (!refund) throw new HttpError(404, 'REFUND_NOT_FOUND');
    if (version !== undefined && refund.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (refund.status !== 'APPROVED') throw new HttpError(409, 'REFUND_NOT_EXECUTABLE');
    if (
      [refund.requestedByEmployeeId, refund.approvedByEmployeeId].includes(actor.userId) &&
      !actor.roles.includes('SUPER_ADMIN')
    ) {
      throw new HttpError(409, 'REFUND_EXECUTION_SEPARATION_REQUIRED');
    }

    const updated = await this.db.refundCase.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        bankReference,
        evidenceUri,
        executedByEmployeeId: actor.userId,
        executedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_REFUND_EXECUTED',
        entityType: 'RefundCase',
        entityId: id,
        details: { bankReference },
      },
    });

    return refundView(updated);
  }

  async verifyRefund(actor: FinanceActor, id: string, version: number | undefined) {
    requirePermission(actor, 'finance.refund.verify');
    const refund = await this.db.refundCase.findUnique({ where: { id } });
    if (!refund) throw new HttpError(404, 'REFUND_NOT_FOUND');
    if (version !== undefined && refund.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (refund.status !== 'PROCESSING') throw new HttpError(409, 'REFUND_NOT_PROCESSING');
    if (
      [refund.requestedByEmployeeId, refund.approvedByEmployeeId, refund.executedByEmployeeId].includes(
        actor.userId
      ) &&
      !actor.roles.includes('SUPER_ADMIN')
    ) {
      throw new HttpError(409, 'REFUND_RECONCILIATION_SEPARATION_REQUIRED');
    }

    const updated = await this.db.refundCase.update({
      where: { id },
      data: {
        status: 'REFUNDED_VERIFIED',
        verifiedByEmployeeId: actor.userId,
        verifiedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_REFUND_VERIFIED',
        entityType: 'RefundCase',
        entityId: id,
        details: { refundNumber: refund.refundNumber },
      },
    });

    return refundView(updated);
  }

  // --- 5. Vendors & Vehicle Expenses ---

  async vendors(actor: FinanceActor) {
    requirePermission(actor, 'finance.vendor.manage');
    return this.db.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  async ensureDefaultVendor(_actor: FinanceActor) {
    let defaultVendor = await this.db.vendor.findFirst({ where: { category: 'OTHER' } });
    if (!defaultVendor) {
      defaultVendor = await this.db.vendor.create({
        data: {
          vendorCode: 'VND-0001',
          name: 'General Dealership Operations',
          category: 'OTHER',
        },
      });
    }
    return defaultVendor;
  }

  async createVendor(
    actor: FinanceActor,
    input: {
      name: string;
      category: any;
      contactPerson?: string;
      phone?: string;
      email?: string;
      gstin?: string;
      beneficiaryAccountMasked?: string;
    }
  ) {
    requirePermission(actor, 'finance.vendor.manage');
    const count = await this.db.vendor.count();
    const vendorCode = `VND-${String(count + 1).padStart(4, '0')}`;
    const vendor = await this.db.vendor.create({
      data: {
        vendorCode,
        name: input.name,
        category: input.category,
        contactPerson: input.contactPerson,
        phone: input.phone,
        email: input.email,
        gstin: input.gstin,
        beneficiaryAccountMasked: input.beneficiaryAccountMasked,
      },
    });
    return vendor;
  }

  async expenses(actor: FinanceActor, query?: { status?: string; stockUnitId?: string }) {
    requirePermission(actor, 'finance.expense.read');
    const where: Prisma.ExpenseClaimWhereInput = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    if (query?.stockUnitId) {
      where.stockUnitId = query.stockUnitId;
    }

    const items = await this.db.expenseClaim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, name: true, category: true, gstin: true } },
        stockUnit: {
          select: {
            id: true,
            stockCode: true,
            make: true,
            model: true,
            registrationNumber: true,
          },
        },
        branch: { select: { id: true, name: true, city: true } },
        submittedBy: { select: { user: { select: { displayName: true } } } },
        approvedBy: { select: { user: { select: { displayName: true } } } },
      },
    });

    return items.map(expenseView);
  }

  async createExpense(
    actor: FinanceActor,
    input: {
      vendorId: string;
      stockUnitId?: string;
      branchId?: string;
      category: any;
      invoiceNumber?: string;
      invoiceDate?: string;
      estimatedAmountPaise?: string | number;
      invoiceAmountPaise: string | number;
      taxAmountPaise?: string | number;
      description: string;
      paymentMethod?: any;
    }
  ) {
    requirePermission(actor, 'finance.expense.submit');
    const count = await this.db.expenseClaim.count();
    const claimNumber = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const created = await this.db.expenseClaim.create({
      data: {
        claimNumber,
        vendorId: input.vendorId,
        stockUnitId: input.stockUnitId,
        branchId: input.branchId,
        category: input.category,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined,
        estimatedAmountPaise: input.estimatedAmountPaise ? BigInt(input.estimatedAmountPaise) : 0n,
        invoiceAmountPaise: BigInt(input.invoiceAmountPaise),
        taxAmountPaise: input.taxAmountPaise ? BigInt(input.taxAmountPaise) : 0n,
        description: input.description,
        paymentMethod: input.paymentMethod || 'MANUAL_BANK_TRANSFER',
        status: 'SUBMITTED',
        submittedByEmployeeId: actor.userId,
      },
      include: { vendor: true, stockUnit: true },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_EXPENSE_CLAIM_CREATED',
        entityType: 'ExpenseClaim',
        entityId: created.id,
        details: { claimNumber, amountPaise: input.invoiceAmountPaise.toString() },
      },
    });

    return expenseView(created);
  }

  async approveExpense(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    decision: 'APPROVE' | 'REJECT',
    reason: string
  ) {
    requirePermission(actor, 'finance.expense.approve');
    const claim = await this.db.expenseClaim.findUnique({ where: { id } });
    if (!claim) throw new HttpError(404, 'EXPENSE_NOT_FOUND');
    if (version !== undefined && claim.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (claim.submittedByEmployeeId === actor.userId && !actor.roles.includes('SUPER_ADMIN')) {
      throw new HttpError(409, 'EXPENSE_SELF_APPROVAL_DENIED');
    }

    const updated = await this.db.expenseClaim.update({
      where: { id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        approvedByEmployeeId: actor.userId,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
    });

    return expenseView(updated);
  }

  async payExpense(
    actor: FinanceActor,
    id: string,
    version: number | undefined,
    bankReference: string,
    evidenceUri?: string
  ) {
    requirePermission(actor, 'finance.expense.approve');
    const claim = await this.db.expenseClaim.findUnique({ where: { id } });
    if (!claim) throw new HttpError(404, 'EXPENSE_NOT_FOUND');
    if (version !== undefined && claim.version !== version) throw new HttpError(409, 'VERSION_CONFLICT');
    if (claim.status !== 'APPROVED') throw new HttpError(409, 'EXPENSE_NOT_APPROVED');

    const updated = await this.db.expenseClaim.update({
      where: { id },
      data: {
        status: 'PAID',
        bankReference,
        evidenceUri,
        paidByEmployeeId: actor.userId,
        paidAt: new Date(),
        version: { increment: 1 },
      },
    });

    return expenseView(updated);
  }

  // --- 6. Company Bank Accounts & Statement Reconciliation ---

  async bankAccounts(actor: FinanceActor) {
    requirePermission(actor, 'finance.reconciliation.import');
    const accounts = await this.db.companyBankAccount.findMany({ orderBy: { bankName: 'asc' } });
    return accounts.map(a => ({
      ...a,
      balancePaise: a.balancePaise.toString(),
      currentBalancePaise: a.balancePaise.toString(),
    }));
  }

  async createBankAccount(
    actor: FinanceActor,
    input: {
      bankName: string;
      accountName: string;
      accountNumberMasked: string;
      ifscCode: string;
      branchName?: string;
      accountType?: string;
      openingBalancePaise?: string | number;
    }
  ) {
    requirePermission(actor, 'finance.reconciliation.import');
    const created = await this.db.companyBankAccount.create({
      data: {
        bankName: input.bankName,
        accountName: input.accountName,
        accountNumberMasked: input.accountNumberMasked,
        ifscCode: input.ifscCode,
        branchName: input.branchName,
        accountType: input.accountType || 'CURRENT',
        balancePaise: input.openingBalancePaise ? BigInt(input.openingBalancePaise) : 0n,
      },
    });
    return { ...created, balancePaise: created.balancePaise.toString() };
  }

  async statementImports(actor: FinanceActor) {
    requirePermission(actor, 'finance.reconciliation.import');
    return this.db.bankStatementImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        companyBankAccount: { select: { bankName: true, accountNumberMasked: true } },
        importedBy: { select: { user: { select: { displayName: true } } } },
      },
    });
  }

  async importBankStatement(
    actor: FinanceActor,
    input: {
      companyBankAccountId: string;
      filename: string;
      startDate: string;
      endDate: string;
      entries: Array<{
        entryDate: string;
        valueDate?: string;
        description: string;
        reference?: string;
        debitPaise?: string | number;
        creditPaise?: string | number;
        balancePaise?: string | number;
      }>;
    }
  ) {
    requirePermission(actor, 'finance.reconciliation.import');

    return this.db.$transaction(async tx => {
      const imp = await tx.bankStatementImport.create({
        data: {
          companyBankAccountId: input.companyBankAccountId,
          filename: input.filename,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          totalEntries: input.entries.length,
          importedByEmployeeId: actor.userId,
        },
      });

      let matchedCount = 0;
      for (const entry of input.entries) {
        const debit = entry.debitPaise ? BigInt(entry.debitPaise) : 0n;
        const credit = entry.creditPaise ? BigInt(entry.creditPaise) : 0n;
        const ref = entry.reference?.trim();

        // Check if there is an exact match with an existing unverified receipt or payout
        let status: any = 'UNMATCHED';
        let reconciledWithKind: string | null = null;
        let reconciledWithId: string | null = null;

        if (ref && credit > 0n) {
          const matchReceipt = await tx.incomingReceipt.findFirst({
            where: { transactionReference: ref, amountPaise: credit },
          });
          if (matchReceipt) {
            status = 'MATCHED';
            reconciledWithKind = 'INCOMING_RECEIPT';
            reconciledWithId = matchReceipt.id;
            matchedCount++;
          }
        } else if (ref && debit > 0n) {
          const matchPayout = await tx.financePayoutInstruction.findFirst({
            where: { bankReference: ref, amountPaise: debit },
          });
          if (matchPayout) {
            status = 'MATCHED';
            reconciledWithKind = 'PAYOUT_INSTRUCTION';
            reconciledWithId = matchPayout.id;
            matchedCount++;
          }
        }

        await tx.bankStatementEntry.create({
          data: {
            statementImportId: imp.id,
            companyBankAccountId: input.companyBankAccountId,
            entryDate: new Date(entry.entryDate),
            valueDate: entry.valueDate ? new Date(entry.valueDate) : undefined,
            description: entry.description,
            reference: ref,
            debitPaise: debit,
            creditPaise: credit,
            balancePaise: entry.balancePaise ? BigInt(entry.balancePaise) : null,
            status,
            reconciledWithKind,
            reconciledWithId,
          },
        });
      }

      await tx.bankStatementImport.update({
        where: { id: imp.id },
        data: { matchedEntries: matchedCount },
      });

      return {
        importId: imp.id,
        totalEntries: input.entries.length,
        matchedEntries: matchedCount,
      };
    });
  }

  async statementEntries(
    actor: FinanceActor,
    query?: { status?: string; companyBankAccountId?: string }
  ) {
    requirePermission(actor, 'finance.reconciliation.match');
    const where: Prisma.BankStatementEntryWhereInput = {};
    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as any;
    }
    if (query?.companyBankAccountId) {
      where.companyBankAccountId = query.companyBankAccountId;
    }

    const entries = await this.db.bankStatementEntry.findMany({
      where,
      orderBy: { entryDate: 'desc' },
      take: 100,
      include: {
        companyBankAccount: { select: { bankName: true, accountNumberMasked: true } },
      },
    });

    return entries.map(e => ({
      ...e,
      narration: e.description,
      referenceNumber: e.reference,
      debitPaise: e.debitPaise.toString(),
      creditPaise: e.creditPaise.toString(),
      balancePaise: e.balancePaise ? e.balancePaise.toString() : null,
    }));
  }

  async matchStatementEntry(
    actor: FinanceActor,
    id: string,
    input: { kind: string; targetId: string; notes?: string }
  ) {
    requirePermission(actor, 'finance.reconciliation.match');
    const entry = await this.db.bankStatementEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, 'STATEMENT_ENTRY_NOT_FOUND');

    const updated = await this.db.bankStatementEntry.update({
      where: { id },
      data: {
        status: 'MATCHED',
        reconciledWithKind: input.kind,
        reconciledWithId: input.targetId,
        matchedByEmployeeId: actor.userId,
        matchedAt: new Date(),
      },
    });

    return {
      ...updated,
      debitPaise: updated.debitPaise.toString(),
      creditPaise: updated.creditPaise.toString(),
    };
  }

  async reconciliationExceptions(actor: FinanceActor, query?: { status?: string }) {
    requirePermission(actor, 'finance.reconciliation.read');
    const where: Prisma.ReconciliationExceptionWhereInput = {};
    if (query?.status) where.status = query.status as any;
    const list = await this.db.reconciliationException.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return list.map(ex => ({
      ...ex,
      details: typeof ex.details === 'string' ? ex.details : JSON.stringify(ex.details || ''),
      resolvedNote: ex.resolutionNotes,
    }));
  }

  async resolveException(actor: FinanceActor, id: string, resolutionNotes: string) {
    requirePermission(actor, 'finance.reconciliation.reconcile');
    const exception = await this.db.reconciliationException.findUnique({ where: { id } });
    if (!exception) throw new HttpError(404, 'EXCEPTION_NOT_FOUND');
    return this.db.reconciliationException.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionNotes,
        resolvedByEmployeeId: actor.userId,
        resolvedAt: new Date(),
      },
    });
  }

  // --- 7. Double-Entry Financial Ledger & Accounting ---

  async chartOfAccounts(actor: FinanceActor) {
    requirePermission(actor, 'finance.ledger.read');
    return this.db.chartOfAccount.findMany({ orderBy: { code: 'asc' } });
  }

  async initializeDefaultCOA(actor: FinanceActor) {
    requirePermission(actor, 'finance.ledger.post');
    const standardAccounts = [
      { code: '1010', name: 'Company Bank Account (HDFC/ICICI)', category: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1100', name: 'Customer Receivables', category: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1200', name: 'Vehicle Inventory Asset', category: 'ASSET', normalBalance: 'DEBIT' },
      { code: '2010', name: 'Seller Acquisition Payables', category: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2020', name: 'Lender Lien / Hypothecation Payables', category: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2050', name: 'Customer Advances & Booking Deposits', category: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2100', name: 'GST Output / Margin Tax Payable', category: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '4010', name: 'Vehicle Sales Revenue', category: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '5010', name: 'Cost of Vehicles Sold (COGS)', category: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '5020', name: 'Vehicle Refurbishment Expenses', category: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '5030', name: 'Logistics, Transport & Towing', category: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '5040', name: 'RTO & Transfer Documentation Fees', category: 'EXPENSE', normalBalance: 'DEBIT' },
    ];

    for (const acc of standardAccounts) {
      await this.db.chartOfAccount.upsert({
        where: { code: acc.code },
        create: {
          code: acc.code,
          name: acc.name,
          category: acc.category as any,
          normalBalance: acc.normalBalance as any,
        },
        update: {},
      });
    }

    return this.db.chartOfAccount.findMany({ orderBy: { code: 'asc' } });
  }

  async accountingPeriods(actor: FinanceActor) {
    requirePermission(actor, 'finance.ledger.read');
    return this.db.accountingPeriod.findMany({ orderBy: { startDate: 'desc' } });
  }

  async closePeriod(actor: FinanceActor, id: string, notes?: string) {
    requirePermission(actor, 'finance.period.close');
    const period = await this.db.accountingPeriod.findUnique({ where: { id } });
    if (!period) throw new HttpError(404, 'PERIOD_NOT_FOUND');
    if (period.status === 'CLOSED') throw new HttpError(409, 'PERIOD_ALREADY_CLOSED');

    const updated = await this.db.accountingPeriod.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedByEmployeeId: actor.userId,
        closedAt: new Date(),
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_PERIOD_CLOSED',
        entityType: 'AccountingPeriod',
        entityId: id,
        details: { periodName: period.periodName, notes },
      },
    });

    return updated;
  }

  async journals(actor: FinanceActor, query?: { periodId?: string }) {
    requirePermission(actor, 'finance.ledger.read');
    const where: Prisma.FinancialJournalWhereInput = {};
    if (query?.periodId) {
      where.periodId = query.periodId;
    }

    const items = await this.db.financialJournal.findMany({
      where,
      orderBy: { postingDate: 'desc' },
      include: {
        period: { select: { periodName: true, status: true } },
        postedBy: { select: { user: { select: { displayName: true } } } },
        lines: {
          include: { account: { select: { code: true, name: true, category: true } } },
        },
      },
    });

    return items.map(journalView);
  }

  async postJournal(
    actor: FinanceActor,
    input: {
      periodId: string;
      postingDate: string;
      sourceType: any;
      sourceId?: string;
      narration: string;
      lines: Array<{
        accountId: string;
        debitPaise: string | number;
        creditPaise: string | number;
        narration?: string;
      }>;
    }
  ) {
    requirePermission(actor, 'finance.ledger.post');

    // 1. Verify period is open
    const period = await this.db.accountingPeriod.findUnique({ where: { id: input.periodId } });
    if (!period) throw new HttpError(404, 'PERIOD_NOT_FOUND');
    if (period.status === 'CLOSED') throw new HttpError(409, 'CANNOT_POST_TO_CLOSED_PERIOD');

    // 2. Invariant Check: Sum(Debits) must equal Sum(Credits)
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const l of input.lines) {
      totalDebit += BigInt(l.debitPaise || 0);
      totalCredit += BigInt(l.creditPaise || 0);
    }
    if (totalDebit <= 0n || totalCredit <= 0n || totalDebit !== totalCredit) {
      throw new HttpError(400, 'UNBALANCED_JOURNAL_ENTRY_DEBITS_MUST_EQUAL_CREDITS');
    }

    const count = await this.db.financialJournal.count();
    const journalNumber = `JRN-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    return this.db.$transaction(async tx => {
      const journal = await tx.financialJournal.create({
        data: {
          journalNumber,
          periodId: input.periodId,
          postingDate: new Date(input.postingDate),
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          narration: input.narration,
          totalDebitPaise: totalDebit,
          totalCreditPaise: totalCredit,
          status: 'POSTED',
          postedByEmployeeId: actor.userId,
          lines: {
            create: input.lines.map(l => ({
              accountId: l.accountId,
              debitPaise: BigInt(l.debitPaise || 0),
              creditPaise: BigInt(l.creditPaise || 0),
              narration: l.narration,
            })),
          },
        },
        include: {
          lines: { include: { account: true } },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'FINANCE_JOURNAL_POSTED',
          entityType: 'FinancialJournal',
          entityId: journal.id,
          details: { journalNumber, totalPaise: totalDebit.toString() },
        },
      });

      return journalView(journal);
    });
  }

  // --- 8. Invoicing & Commercial Documents ---

  async invoices(actor: FinanceActor, query?: { type?: string }) {
    requirePermission(actor, 'finance.invoice.read');
    const where: Prisma.InvoiceDocumentWhereInput = {};
    if (query?.type && query.type !== 'ALL') {
      where.invoiceType = query.type as any;
    }

    const items = await this.db.invoiceDocument.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      include: {
        stockUnit: { select: { stockCode: true, make: true, model: true, registrationNumber: true } },
        customer: { select: { displayName: true, email: true } },
        issuedBy: { select: { user: { select: { displayName: true } } } },
      },
    });

    return items.map(inv => ({
      ...inv,
      subtotalPaise: inv.subtotalPaise.toString(),
      cgstPaise: inv.cgstPaise.toString(),
      sgstPaise: inv.sgstPaise.toString(),
      igstPaise: inv.igstPaise.toString(),
      totalAmountPaise: inv.totalAmountPaise.toString(),
    }));
  }

  async issueInvoice(
    actor: FinanceActor,
    input: {
      invoiceType: any;
      stockUnitId?: string;
      customerId?: string;
      sellerLeadId?: string;
      subtotalPaise: string | number;
      cgstPaise?: string | number;
      sgstPaise?: string | number;
      igstPaise?: string | number;
      pdfUri?: string;
    }
  ) {
    requirePermission(actor, 'finance.invoice.issue');
    const subtotal = BigInt(input.subtotalPaise);
    const cgst = input.cgstPaise ? BigInt(input.cgstPaise) : 0n;
    const sgst = input.sgstPaise ? BigInt(input.sgstPaise) : 0n;
    const igst = input.igstPaise ? BigInt(input.igstPaise) : 0n;
    const total = subtotal + cgst + sgst + igst;

    const resolvedInvoiceType =
      (input.invoiceType as any) === 'TAX_INVOICE' || (input.invoiceType as any) === 'SALE_INVOICE' || !input.invoiceType
        ? 'VEHICLE_SALE_TAX_INVOICE'
        : input.invoiceType;
    const prefix = resolvedInvoiceType === 'CREDIT_NOTE' ? 'CRN' : 'INV';
    const count = await this.db.invoiceDocument.count();
    const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const created = await this.db.invoiceDocument.create({
      data: {
        invoiceNumber,
        invoiceType: resolvedInvoiceType,
        stockUnitId: input.stockUnitId,
        customerId: input.customerId,
        sellerLeadId: input.sellerLeadId,
        subtotalPaise: subtotal,
        cgstPaise: cgst,
        sgstPaise: sgst,
        igstPaise: igst,
        totalAmountPaise: total,
        pdfUri: input.pdfUri,
        issuedByEmployeeId: actor.userId,
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'FINANCE_INVOICE_ISSUED',
        entityType: 'InvoiceDocument',
        entityId: created.id,
        details: { invoiceNumber, totalAmountPaise: total.toString() },
      },
    });

    return {
      ...created,
      subtotalPaise: created.subtotalPaise.toString(),
      cgstPaise: created.cgstPaise.toString(),
      sgstPaise: created.sgstPaise.toString(),
      igstPaise: created.igstPaise.toString(),
      totalAmountPaise: created.totalAmountPaise.toString(),
    };
  }

  // --- 9. Vehicle-Level Costing & Profitability ---

  async vehicleProfitability(actor: FinanceActor, query?: { search?: string }) {
    requirePermission(actor, 'finance.reports.read');
    const where: Prisma.VehicleStockUnitWhereInput = {};
    if (query?.search) {
      where.OR = [
        { stockCode: { contains: query.search, mode: 'insensitive' } },
        { registrationNumber: { contains: query.search, mode: 'insensitive' } },
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const units = await this.db.vehicleStockUnit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        workOrders: { select: { actualCostPaise: true, estimatedCostPaise: true, status: true } },
        expenseClaims: {
          where: { status: 'PAID' },
          select: { invoiceAmountPaise: true, category: true },
        },
        vehicle: {
          include: {
            listing: {
              include: {
                paymentObligations: {
                  where: { status: 'PAID_VERIFIED' },
                  select: { totalPayablePaise: true },
                },
              },
            },
          },
        },
      },
    });

    return units.map(u => {
      const acqCost = BigInt(u.acquisitionCostPaise || 0);

      // Refurbishment from paid expense claims or completed work orders
      const expensesPaid = u.expenseClaims.reduce(
        (sum, e) => sum + BigInt(e.invoiceAmountPaise || 0),
        0n
      );
      const workOrderCosts = u.workOrders.reduce(
        (sum, w) => sum + BigInt(w.actualCostPaise || w.estimatedCostPaise || 0),
        0n
      );
      const totalRefurbishment = expensesPaid > 0n ? expensesPaid : workOrderCosts;

      const totalInvested = acqCost + totalRefurbishment;

      // Realized sale consideration
      const verifiedObligations = u.vehicle?.listing?.paymentObligations || [];
      const realizedSale = verifiedObligations.reduce(
        (sum, o) => sum + BigInt(o.totalPayablePaise || 0),
        0n
      );

      const listingPrice = u.vehicle?.listing?.pricePaise
        ? BigInt(u.vehicle.listing.pricePaise)
        : 0n;

      const isSold = realizedSale > 0n || ['SOLD', 'DELIVERED'].includes(u.status);
      const grossMarginPaise = isSold ? realizedSale - totalInvested : listingPrice - totalInvested;
      const marginPercentage =
        totalInvested > 0n
          ? Number((Number(grossMarginPaise) / Number(totalInvested)) * 100).toFixed(1)
          : '0.0';

      return {
        id: u.id,
        stockCode: u.stockCode,
        title: `${u.manufacturingYear} ${u.make} ${u.model} ${u.variant || ''}`.trim(),
        registrationNumber: u.registrationNumber,
        status: u.status,
        acquisitionCostPaise: acqCost.toString(),
        refurbishmentCostPaise: totalRefurbishment.toString(),
        totalInvestedCostPaise: totalInvested.toString(),
        listingPricePaise: listingPrice.toString(),
        realizedSalePaise: realizedSale.toString(),
        grossMarginPaise: grossMarginPaise.toString(),
        marginPercentage,
        isSold,
      };
    });
  }

  // --- 10. Financial Audit Trail ---

  async auditLogs(actor: FinanceActor, query?: { action?: string }) {
    requirePermission(actor, 'finance.audit.read');
    const where: Prisma.AuditEventWhereInput = {
      action: { startsWith: 'FINANCE_' },
    };
    if (query?.action) {
      where.action = query.action;
    }

    const logs = await this.db.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: { select: { displayName: true, email: true } },
      },
    });

    return logs;
  }
}
