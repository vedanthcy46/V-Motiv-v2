// Staff notifications for the hand-offs between Sales, Operations, Finance and the listing team. Each one is best effort:
// a failed notification must never fail the business action that caused it (dispatchDomainEvent already swallows errors).
import type { NotificationService } from './notification/index.js';

type Db = { sellerLeadAssignment: { findFirst: (args: any) => Promise<{ employeeId: string | null; branchId: string | null } | null> } };

/** A seller accepted an offer (in the app, or in person at the showroom): Operations starts document collection, Sales is told. */
export async function notifyOfferAccepted(
  service: NotificationService | undefined,
  db: Db,
  lead: { id: string; referenceCode: string; make: string; model: string; sellerName?: string | null },
  source: 'CUSTOMER_SELF_SERVICE' | 'IN_PERSON_OTP',
  acquisitionCaseId?: string,
) {
  if (!service) return;
  const assignment = await db.sellerLeadAssignment.findFirst({ where: { leadId: lead.id, releasedAt: null }, orderBy: { assignedAt: 'desc' }, select: { employeeId: true, branchId: true } }).catch(() => null);
  const car = `${lead.make} ${lead.model}`.trim();
  await service.dispatchDomainEvent({
    type: 'ACQUISITION_OFFER_ACCEPTED_STAFF',
    category: 'SELLING',
    priority: 'HIGH',
    recipientRoles: ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER'],
    recipientUserIds: assignment?.employeeId ? [assignment.employeeId] : undefined,
    branchId: assignment?.branchId || undefined,
    title: `Offer accepted: ${car}`,
    body: `${lead.sellerName || 'The seller'} accepted the offer for ${car} (${lead.referenceCode})${source === 'IN_PERSON_OTP' ? ' in person' : ''}. Start collecting and verifying the seller documents.`,
    actionUrl: '/operations?tab=acquisitions',
    referenceId: acquisitionCaseId || lead.id,
    entityType: 'AcquisitionCase',
    metadata: { targetApp: 'OPS', leadId: lead.id, acquisitionCaseId },
  });
}

/** All seller documents are verified: Finance can prepare the payout. */
export async function notifyReadyForPayment(service: NotificationService | undefined, lead: { id: string; referenceCode: string; make: string; model: string }, acquisitionCaseId: string, branchId?: string) {
  if (!service) return;
  await service.dispatchDomainEvent({
    type: 'FINANCE_READY_FOR_PAYMENT',
    category: 'FINANCE',
    priority: 'HIGH',
    recipientRoles: ['FINANCE', 'SUPER_ADMIN'],
    recipientPermissions: ['finance.settlement.prepare'],
    branchId,
    title: `Ready to pay: ${lead.make} ${lead.model}`,
    body: `All seller documents for ${lead.make} ${lead.model} (${lead.referenceCode}) are verified. Prepare the seller payout.`,
    actionUrl: '/finance?tab=seller-settlements',
    referenceId: acquisitionCaseId,
    entityType: 'AcquisitionCase',
    metadata: { targetApp: 'FINANCE', acquisitionCaseId },
  });
}
