import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The branch a seller lead belongs to: the branch of whoever owns it, else the branch that took the inspection, else the branch in the
 * lead's city. An event with no branch can only reach global staff, so every event that concerns a lead should be given one.
 */
export async function branchForLead(db: Db, leadId: string): Promise<string | null> {
  const assignment = await db.sellerLeadAssignment.findFirst({ where: { leadId, releasedAt: null, branchId: { not: null } }, orderBy: { assignedAt: 'desc' }, select: { branchId: true } }).catch(() => null);
  if (assignment?.branchId) return assignment.branchId;
  const request = await db.inspectionRequest.findFirst({ where: { leadId, branchId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { branchId: true } }).catch(() => null);
  if (request?.branchId) return request.branchId;
  const lead = await db.acquisitionLead.findUnique({ where: { id: leadId }, select: { city: true } }).catch(() => null);
  if (!lead?.city) return null;
  const branch = await db.branch.findFirst({ where: { city: { equals: lead.city, mode: 'insensitive' }, active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }).catch(() => null);
  return branch?.id ?? null;
}
