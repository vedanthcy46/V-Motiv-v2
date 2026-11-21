// Time-based events: things that become true because time passed, not because someone clicked. Each detector looks at the real
// records, raises a catalog event through the outbox (deduplicated per record per window) and never changes business state.
import type { PrismaClient } from '@prisma/client';
import { branchForLead } from './branches.js';
import { enqueueDomainEvent } from './outbox.js';

type Db = PrismaClient;
const MAX_PER_RUN = 100;

export async function detectUnassignedLeads(db: Db, now = new Date()): Promise<number> {
  const leads = await db.acquisitionLead.findMany({
    where: { status: { in: ['SUBMITTED', 'QUALIFYING'] }, createdAt: { lt: new Date(now.getTime() - 30 * 60_000), gt: new Date(now.getTime() - 14 * 86_400_000) }, assignments: { none: { releasedAt: null } } },
    select: { id: true, referenceCode: true, make: true, model: true }, take: MAX_PER_RUN, orderBy: { createdAt: 'asc' },
  });
  for (const lead of leads) {
    await enqueueDomainEvent(db, { eventType: 'LEAD_UNASSIGNED_OVERDUE', aggregateId: lead.id, branchId: await branchForLead(db, lead.id), payload: { referenceCode: lead.referenceCode, vehicle: `${lead.make} ${lead.model}` } });
  }
  return leads.length;
}

export async function detectFollowUpsDue(db: Db, now = new Date()): Promise<number> {
  const tasks = await db.salesTask.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lte: new Date(now.getTime() + 15 * 60_000), gt: new Date(now.getTime() - 3 * 86_400_000) } },
    select: { id: true, leadId: true, assignedEmployeeId: true, lead: { select: { referenceCode: true } } }, take: MAX_PER_RUN, orderBy: { dueAt: 'asc' },
  });
  for (const task of tasks) {
    await enqueueDomainEvent(db, { eventType: 'SALES_FOLLOW_UP_DUE', aggregateId: task.id, branchId: await branchForLead(db, task.leadId), assigneeUserIds: [task.assignedEmployeeId], payload: { referenceCode: task.lead.referenceCode } });
  }
  return tasks.length;
}

async function hubBranch(db: Db, hubId: string): Promise<string | null> {
  return (await db.serviceHub.findUnique({ where: { id: hubId }, select: { branchId: true } }))?.branchId ?? null;
}

export async function detectRentals(db: Db, now = new Date()): Promise<{ pickups: number; balances: number; returns: number }> {
  const [pickups, balances, returns] = await Promise.all([
    db.rentalBooking.findMany({ where: { status: 'CONFIRMED', startTime: { gt: now, lte: new Date(now.getTime() + 3 * 3_600_000) } }, select: { id: true, bookingNumber: true, pickupHubId: true, startTime: true }, take: MAX_PER_RUN }),
    db.rentalBooking.findMany({ where: { status: 'CONFIRMED', outstandingBalancePaise: { gt: 0n }, balanceDueAt: { lte: now }, startTime: { gt: new Date(now.getTime() - 6 * 3_600_000) } }, select: { id: true, bookingNumber: true, pickupHubId: true }, take: MAX_PER_RUN }),
    db.rentalBooking.findMany({ where: { status: { in: ['TRIP_ACTIVE', 'VEHICLE_COLLECTED'] }, endTime: { lt: new Date(now.getTime() - 30 * 60_000), gt: new Date(now.getTime() - 14 * 86_400_000) } }, select: { id: true, bookingNumber: true, pickupHubId: true }, take: MAX_PER_RUN }),
  ]);
  for (const booking of pickups) await enqueueDomainEvent(db, { eventType: 'RENTAL_PICKUP_REMINDER', aggregateId: booking.id, branchId: await hubBranch(db, booking.pickupHubId), payload: { referenceCode: booking.bookingNumber, dueAt: booking.startTime.toISOString().slice(11, 16) + ' UTC' } });
  for (const booking of balances) await enqueueDomainEvent(db, { eventType: 'RENTAL_BALANCE_OVERDUE', aggregateId: booking.id, branchId: await hubBranch(db, booking.pickupHubId), payload: { referenceCode: booking.bookingNumber } });
  for (const booking of returns) await enqueueDomainEvent(db, { eventType: 'RENTAL_RETURN_OVERDUE', aggregateId: booking.id, branchId: await hubBranch(db, booking.pickupHubId), payload: { referenceCode: booking.bookingNumber } });
  return { pickups: pickups.length, balances: balances.length, returns: returns.length };
}

/** If the notification pipeline itself is failing (dead events, or a growing backlog), tell the designated responders. */
export async function detectPipelineTrouble(db: Db, now = new Date()): Promise<boolean> {
  const [dead, stuck] = await Promise.all([
    db.domainOutboxEvent.count({ where: { status: 'DEAD', createdAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
    db.domainOutboxEvent.count({ where: { status: { in: ['PENDING', 'FAILED'] }, createdAt: { lt: new Date(now.getTime() - 15 * 60_000) } } }),
  ]);
  if (dead === 0 && stuck === 0) return false;
  await enqueueDomainEvent(db, { eventType: 'INTEGRATION_OUTAGE', aggregateId: 'notification-pipeline', payload: { reasonCode: dead ? 'NOTIFICATION_EVENTS_FAILING' : 'NOTIFICATION_BACKLOG', count: dead || stuck } });
  return true;
}

export async function runDetectors(db: Db, now = new Date()) {
  const [unassigned, followUps, rentals, trouble] = await Promise.all([detectUnassignedLeads(db, now), detectFollowUpsDue(db, now), detectRentals(db, now), detectPipelineTrouble(db, now)]);
  return { unassigned, followUps, rentals, pipelineTrouble: trouble };
}
