import {
  type AcquisitionLeadStatus,
  type AcquisitionOfferStatus,
  type DiscountRequestStatus,
  type EmployeeRole,
  type InspectionRequestStatus,
  type LeadInteractionChannel,
  type LeadInteractionOutcome,
  type Prisma,
  PrismaClient,
  type PurchaseEnquiryStatus,
  type QuotationStatus,
  type SalesTaskPriority,
  type SalesTaskStatus,
  type SalesTaskType,
  type TestDriveStatus,
  type VehicleReservationStatus,
} from '@prisma/client';
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export const salesRoles: EmployeeRole[] = ['SALES_EXECUTIVE', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
export const globalSalesRoles: EmployeeRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'];

export type SalesActor = {
  userId: string;
  email: string;
  displayName: string | null;
  employeeCode: string | null;
  roles: EmployeeRole[];
  branches: Array<{ id: string; code: string; name: string; city: string }>;
  globalScope: boolean;
};

export type LeadQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: AcquisitionLeadStatus;
  city?: string;
  unassigned?: boolean;
};

export interface SalesStore {
  actor(uid: string): Promise<SalesActor>;
  dashboard(actor: SalesActor): Promise<unknown>;
  
  // Seller Leads
  sellerLeads(actor: SalesActor, query: LeadQuery): Promise<unknown>;
  sellerLead(actor: SalesActor, id: string): Promise<unknown>;
  createManualSellerLead(actor: SalesActor, input: {
    sellerName: string;
    sellerPhone: string;
    city: string;
    pincode: string;
    make: string;
    model: string;
    variant?: string;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    expectedPricePaise?: bigint;
    sellerNotes?: string;
  }): Promise<unknown>;
  updateSellerLeadStatus(actor: SalesActor, id: string, input: { status: AcquisitionLeadStatus; note?: string }): Promise<unknown>;
  claimSellerLead(actor: SalesActor, id: string): Promise<unknown>;
  assignSellerLead(actor: SalesActor, id: string, input: { employeeId: string; reason?: string }): Promise<unknown>;
  qualifySellerLead(actor: SalesActor, id: string, input: { qualified: boolean; reasonCode: string; notes?: string }): Promise<unknown>;

  // Interactions & Tasks
  interactions(actor: SalesActor, id: string): Promise<unknown>;
  createInteraction(actor: SalesActor, id: string, input: {
    channel: LeadInteractionChannel;
    outcome: LeadInteractionOutcome;
    notes?: string;
  }): Promise<unknown>;
  tasks(actor: SalesActor, query: { status?: SalesTaskStatus; overdue?: boolean; leadId?: string }): Promise<unknown>;
  createTask(actor: SalesActor, id: string, input: {
    type: SalesTaskType;
    priority?: SalesTaskPriority;
    dueAt: Date;
    details: string;
    expectedOutcome?: string;
  }): Promise<unknown>;
  completeTask(actor: SalesActor, id: string, input: { actualOutcome: string }): Promise<unknown>;

  // Inspections
  requestInspection(actor: SalesActor, id: string, input: {
    requestedDate?: Date;
    timeSlot?: string;
    locationType: 'HUB' | 'HOME';
    address?: string;
    notes?: string;
  }): Promise<unknown>;
  inspectionSummary(actor: SalesActor, leadId: string): Promise<unknown>;

  // Acquisition Offers
  getAcquisitionOffers(actor: SalesActor, leadId: string): Promise<unknown>;
  proposeAcquisitionOffer(actor: SalesActor, leadId: string, input: {
    offerAmountPaise: bigint;
    validUntil: Date;
    terms?: string;
  }): Promise<unknown>;
  recordSellerOfferResponse(actor: SalesActor, leadId: string, offerId: string, input: {
    decision: 'ACCEPTED' | 'DECLINED';
    declineReason?: string;
  }): Promise<unknown>;

  // Buyer Leads
  buyerLeads(actor: SalesActor, query: { page: number; limit: number; search?: string; status?: PurchaseEnquiryStatus }): Promise<unknown>;
  buyerLead(actor: SalesActor, id: string): Promise<unknown>;
  updateBuyerLeadStatus(actor: SalesActor, id: string, status: PurchaseEnquiryStatus): Promise<unknown>;

  // Inventory
  inventory(actor: SalesActor, query: { page: number; limit: number; search?: string; city?: string }): Promise<unknown>;
  inventoryItem(actor: SalesActor, id: string): Promise<unknown>;

  // Test Drives
  testDrives(actor: SalesActor, query: { page: number; limit: number; status?: TestDriveStatus }): Promise<unknown>;
  requestTestDrive(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    requestedDate: Date;
    timeSlot: string;
    locationPreference?: 'HUB' | 'HOME';
    serviceCity?: string;
    customerNotes?: string;
  }): Promise<unknown>;
  updateTestDriveStatus(actor: SalesActor, id: string, input: { status: TestDriveStatus; customerNotes?: string }): Promise<unknown>;

  // Retail Quotations
  quotations(actor: SalesActor, query: { page: number; limit: number; listingId?: string; customerId?: string; status?: QuotationStatus }): Promise<unknown>;
  quotation(actor: SalesActor, id: string): Promise<unknown>;
  createQuotation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    chargesPaise?: bigint;
    chargeBreakdown?: Record<string, unknown>;
    discountPaise?: bigint;
    validUntil: Date;
    terms?: string;
  }): Promise<unknown>;
  submitQuotation(actor: SalesActor, id: string): Promise<unknown>;
  requestDiscount(actor: SalesActor, quotationId: string, input: {
    requestedDiscountPaise: bigint;
    reason: string;
  }): Promise<unknown>;
  decideDiscount(actor: SalesActor, discountRequestId: string, input: {
    decision: 'APPROVE' | 'REJECT';
    decisionNotes?: string;
  }): Promise<unknown>;

  // Vehicle Reservations
  reservations(actor: SalesActor, query: { page: number; limit: number; status?: VehicleReservationStatus }): Promise<unknown>;
  requestReservation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    quotationId?: string;
    enquiryId?: string;
    expiresAt: Date;
    notes?: string;
  }): Promise<unknown>;
  releaseReservation(actor: SalesActor, id: string, reason?: string): Promise<unknown>;

  // Customers CRM
  customers(actor: SalesActor, query: { page: number; limit: number; search?: string }): Promise<unknown>;
  customer(actor: SalesActor, id: string): Promise<unknown>;

  // Reporting & Notifications
  reports(actor: SalesActor): Promise<unknown>;
  notifications(actor: SalesActor): Promise<unknown>;

  // Communications (Resend Outbox)
  sendApprovedEmail(actor: SalesActor, input: {
    customerId: string;
    template: string;
    variables?: Record<string, string>;
  }): Promise<unknown>;
}

function scope(actor: SalesActor): Prisma.AcquisitionLeadWhereInput {
  if (actor.globalScope) return {};
  const cities = actor.branches.map(branch => branch.city);
  if (!cities.length) throw new HttpError(403, 'SALES_BRANCH_SCOPE_REQUIRED');
  return {
    AND: [
      { city: { in: cities, mode: 'insensitive' } },
      {
        OR: [
          { assignments: { none: { releasedAt: null } } },
          { assignments: { some: { employeeId: actor.userId, releasedAt: null } } },
        ],
      },
    ],
  };
}

function buyerScope(actor: SalesActor): Prisma.PurchaseEnquiryWhereInput {
  if (actor.globalScope) return {};
  const cities = actor.branches.map(branch => branch.city);
  if (!cities.length) throw new HttpError(403, 'SALES_BRANCH_SCOPE_REQUIRED');
  return { listing: { vehicle: { city: { in: cities, mode: 'insensitive' } } } };
}

function listingScope(actor: SalesActor): Prisma.VehicleListingWhereInput {
  if (actor.globalScope) return {};
  const cities = actor.branches.map(branch => branch.city);
  if (!cities.length) throw new HttpError(403, 'SALES_BRANCH_SCOPE_REQUIRED');
  return { vehicle: { city: { in: cities, mode: 'insensitive' } } };
}

function toActor(employee: Prisma.EmployeeGetPayload<{
  include: {
    user: true;
    roleAssignments: { include: { role: true } };
    branchAssignments: { include: { branch: true } };
  };
}>): SalesActor {
  const roles = [...new Set([employee.role, ...employee.roleAssignments.map(item => item.role.key)])];
  if (!roles.some(role => salesRoles.includes(role))) throw new HttpError(403, 'SALES_ACCESS_DENIED');
  return {
    userId: employee.userId,
    email: employee.user.email,
    displayName: employee.user.displayName,
    employeeCode: employee.employeeCode,
    roles,
    globalScope: roles.some(role => globalSalesRoles.includes(role)),
    branches: employee.branchAssignments
      .filter(item => item.branch.active)
      .map(item => ({ id: item.branch.id, code: item.branch.code, name: item.branch.name, city: item.branch.city })),
  };
}

const leadSelect = {
  id: true,
  referenceCode: true,
  sellerName: true,
  sellerPhone: true,
  city: true,
  pincode: true,
  make: true,
  model: true,
  variant: true,
  manufacturingYear: true,
  fuelType: true,
  transmission: true,
  odometerKm: true,
  expectedPricePaise: true,
  ownershipCount: true,
  registrationYear: true,
  color: true,
  registrationCity: true,
  insuranceValidUntil: true,
  loanOutstanding: true,
  accidentHistory: true,
  serviceHistory: true,
  sellerNotes: true,
  inspectionDate: true,
  inspectionTimeSlot: true,
  inspectionLocationType: true,
  inspectionAddress: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, displayName: true, phone: true } },
  assignments: {
    where: { releasedAt: null },
    select: { id: true, employeeId: true, branchId: true, assignedAt: true, employee: { select: { user: { select: { displayName: true, email: true } } } } },
    take: 1,
  },
  offers: {
    select: { id: true, offerAmountPaise: true, status: true, validUntil: true, version: true, terms: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
    take: 3,
  },
  inspectionRequests: {
    select: { id: true, status: true, requestedDate: true, timeSlot: true, locationType: true, address: true, scheduledAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.AcquisitionLeadSelect;

export class PrismaSalesStore implements SalesStore {
  constructor(private db: PrismaClient) {}

  async actor(uid: string): Promise<SalesActor> {
    const employee = await this.db.employee.findFirst({
      where: { user: { firebaseUid: uid, status: 'ACTIVE' }, active: true, status: 'ACTIVE' },
      include: {
        user: true,
        roleAssignments: { include: { role: true } },
        branchAssignments: { include: { branch: true } },
      },
    });
    if (!employee) throw new HttpError(403, 'SALES_ACCESS_DENIED');
    return toActor(employee);
  }

  async dashboard(actor: SalesActor) {
    const where = scope(actor);
    const bWhere = buyerScope(actor);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      submitted,
      qualifying,
      inspectionScheduled,
      offerPending,
      offered,
      accepted,
      buyerReceived,
      buyerInReview,
      buyerContacted,
      buyerClosed,
      tasksDueToday,
      tasksOverdue,
      upcomingTestDrives,
      activeReservations,
      eligibleInventory,
    ] = await this.db.$transaction([
      this.db.acquisitionLead.count({ where: { ...where, status: 'SUBMITTED' } }),
      this.db.acquisitionLead.count({ where: { ...where, status: 'QUALIFYING' } }),
      this.db.acquisitionLead.count({ where: { ...where, status: 'INSPECTION_SCHEDULED' } }),
      this.db.acquisitionLead.count({ where: { ...where, status: 'OFFER_PENDING' } }),
      this.db.acquisitionLead.count({ where: { ...where, status: 'OFFERED' } }),
      this.db.acquisitionLead.count({ where: { ...where, status: 'ACCEPTED' } }),
      this.db.purchaseEnquiry.count({ where: { ...bWhere, status: 'RECEIVED' } }),
      this.db.purchaseEnquiry.count({ where: { ...bWhere, status: 'IN_REVIEW' } }),
      this.db.purchaseEnquiry.count({ where: { ...bWhere, status: 'CONTACTED' } }),
      this.db.purchaseEnquiry.count({ where: { ...bWhere, status: 'CLOSED' } }),
      this.db.salesTask.count({ where: { assignedEmployeeId: actor.userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { gte: startOfToday, lt: endOfToday } } }),
      this.db.salesTask.count({ where: { assignedEmployeeId: actor.userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now } } }),
      this.db.testDriveRequest.count({ where: { status: { in: ['REQUESTED', 'CONFIRMED'] }, ...(actor.globalScope ? {} : { serviceCity: { in: actor.branches.map(b => b.city), mode: 'insensitive' } }) } }),
      this.db.vehicleReservation.count({ where: { status: 'CONFIRMED' } }),
      this.db.vehicleListing.count({ where: { ...listingScope(actor), status: 'PUBLISHED' } }),
    ]);

    return {
      pipeline: { submitted, qualifying, inspectionScheduled, offerPending, offered, accepted },
      buyerPipeline: { received: buyerReceived, inReview: buyerInReview, contacted: buyerContacted, closed: buyerClosed },
      workQueue: { tasksDueToday, tasksOverdue, upcomingTestDrives, activeReservations, eligibleInventory },
      generatedAt: now,
    };
  }

  async sellerLeads(actor: SalesActor, query: LeadQuery) {
    const where: Prisma.AcquisitionLeadWhereInput = {
      ...scope(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.unassigned ? { assignments: { none: { releasedAt: null } } } : {}),
      ...(query.search ? {
        OR: [
          { sellerName: { contains: query.search, mode: 'insensitive' } },
          { sellerPhone: { contains: query.search } },
          { referenceCode: { contains: query.search, mode: 'insensitive' } },
          { make: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.acquisitionLead.findMany({
        where,
        select: leadSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.acquisitionLead.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async sellerLead(actor: SalesActor, id: string) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id, ...scope(actor) },
      select: {
        ...leadSelect,
        interactions: {
          select: { id: true, channel: true, outcome: true, notes: true, occurredAt: true, employee: { select: { user: { select: { displayName: true, email: true } } } } },
          orderBy: { occurredAt: 'desc' },
          take: 20,
        },
        tasks: {
          select: { id: true, type: true, status: true, priority: true, dueAt: true, details: true, expectedOutcome: true, completedAt: true, actualOutcome: true },
          orderBy: [{ dueAt: 'asc' }],
          take: 20,
        },
      },
    });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    return lead;
  }

  async createManualSellerLead(actor: SalesActor, input: {
    sellerName: string;
    sellerPhone: string;
    city: string;
    pincode: string;
    make: string;
    model: string;
    variant?: string;
    manufacturingYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    expectedPricePaise?: bigint;
    sellerNotes?: string;
  }) {
    const branch = actor.branches.find(b => b.city.toLowerCase() === input.city.toLowerCase()) || actor.branches[0];
    return this.db.$transaction(async tx => {
      // Find or create customer user
      const placeholderEmail = `manual-${crypto.randomBytes(4).toString('hex')}@vmotiv.internal`;
      const customer = await tx.user.create({
        data: {
          firebaseUid: `manual-${crypto.randomUUID()}`,
          email: placeholderEmail,
          displayName: input.sellerName,
          phone: input.sellerPhone,
          preferredCity: input.city,
        },
      });

      const lead = await tx.acquisitionLead.create({
        data: {
          userId: customer.id,
          sellerName: input.sellerName,
          sellerPhone: input.sellerPhone,
          city: input.city,
          pincode: input.pincode,
          make: input.make,
          model: input.model,
          variant: input.variant,
          manufacturingYear: input.manufacturingYear,
          fuelType: input.fuelType,
          transmission: input.transmission,
          odometerKm: input.odometerKm,
          expectedPricePaise: input.expectedPricePaise,
          sellerNotes: input.sellerNotes,
          status: 'QUALIFYING',
          assignments: {
            create: {
              employeeId: actor.userId,
              branchId: branch?.id,
              assignedById: actor.userId,
              reason: 'MANUAL_ENTRY_BY_SALES',
            },
          },
        },
        select: leadSelect,
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'MANUAL_SELLER_LEAD_CREATED',
          entityType: 'AcquisitionLead',
          entityId: lead.id,
          details: { referenceCode: lead.referenceCode, make: input.make, model: input.model },
        },
      });
      return lead;
    });
  }

  async updateSellerLeadStatus(actor: SalesActor, id: string, input: { status: AcquisitionLeadStatus; note?: string }) {
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, status: true, referenceCode: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    const allowed: Record<string, AcquisitionLeadStatus[]> = {
      SUBMITTED: ['QUALIFYING', 'CANCELLED'],
      QUALIFYING: ['INSPECTION_SCHEDULED', 'OFFER_PENDING', 'CANCELLED'],
      INSPECTION_SCHEDULED: ['OFFER_PENDING', 'CANCELLED'],
      OFFER_PENDING: ['OFFERED', 'CANCELLED'],
      OFFERED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    };
    if (!allowed[lead.status]?.includes(input.status)) throw new HttpError(409, 'INVALID_LEAD_STATUS_TRANSITION');
    return this.db.$transaction(async tx => {
      const updated = await tx.acquisitionLead.update({
        where: { id },
        data: { status: input.status, ...(input.status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
        select: leadSelect,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SALES_LEAD_STATUS_UPDATED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, from: lead.status, to: input.status, note: input.note ?? null },
        },
      });
      return updated;
    });
  }

  async claimSellerLead(actor: SalesActor, id: string) {
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, city: true, referenceCode: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    const branch = actor.branches.find(item => item.city.toLowerCase() === lead.city.toLowerCase());
    return this.db.$transaction(async tx => {
      const active = await tx.sellerLeadAssignment.findFirst({ where: { leadId: id, releasedAt: null } });
      if (active) throw new HttpError(409, 'SELLER_LEAD_ALREADY_ASSIGNED');
      const assignment = await tx.sellerLeadAssignment.create({
        data: {
          leadId: id,
          employeeId: actor.userId,
          branchId: branch?.id,
          assignedById: actor.userId,
          reason: 'SELF_CLAIMED_FROM_BRANCH_QUEUE',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_CLAIMED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, branchId: branch?.id ?? null },
        },
      });
      return assignment;
    });
  }

  async assignSellerLead(actor: SalesActor, id: string, input: { employeeId: string; reason?: string }) {
    if (!actor.globalScope && !actor.roles.includes('OPERATIONS_MANAGER')) {
      throw new HttpError(403, 'PERMISSION_DENIED');
    }
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, referenceCode: true, city: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');

    const target = await this.db.employee.findFirst({
      where: { userId: input.employeeId, active: true, status: 'ACTIVE' },
      include: { branchAssignments: { include: { branch: true } } },
    });
    if (!target) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND');

    return this.db.$transaction(async tx => {
      await tx.sellerLeadAssignment.updateMany({ where: { leadId: id, releasedAt: null }, data: { releasedAt: new Date() } });
      const branch = target.branchAssignments.find(b => b.branch.city.toLowerCase() === lead.city.toLowerCase());
      const assignment = await tx.sellerLeadAssignment.create({
        data: {
          leadId: id,
          employeeId: target.userId,
          branchId: branch?.branchId,
          assignedById: actor.userId,
          reason: input.reason || 'MANAGER_ASSIGNMENT',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_REASSIGNED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, targetEmployeeId: target.userId, reason: input.reason },
        },
      });
      return assignment;
    });
  }

  async qualifySellerLead(actor: SalesActor, id: string, input: { qualified: boolean; reasonCode: string; notes?: string }) {
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, referenceCode: true, status: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const nextStatus = input.qualified ? 'QUALIFYING' : 'CANCELLED';
      const updated = await tx.acquisitionLead.update({
        where: { id },
        data: { status: nextStatus, ...(input.qualified ? {} : { cancelledAt: new Date() }) },
        select: leadSelect,
      });

      await tx.leadInteraction.create({
        data: {
          leadId: id,
          employeeId: actor.userId,
          channel: 'INTERNAL_NOTE',
          outcome: 'INFORMATION_PROVIDED',
          notes: `Qualification decision: ${input.qualified ? 'QUALIFIED' : 'REJECTED'}. Reason: ${input.reasonCode}. ${input.notes || ''}`.trim(),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_QUALIFIED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, qualified: input.qualified, reasonCode: input.reasonCode },
        },
      });
      return updated;
    });
  }

  async interactions(actor: SalesActor, id: string) {
    await this.sellerLead(actor, id);
    return this.db.leadInteraction.findMany({
      where: { leadId: id },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        channel: true,
        outcome: true,
        notes: true,
        occurredAt: true,
        employee: { select: { user: { select: { displayName: true, email: true } } } },
      },
    });
  }

  async createInteraction(actor: SalesActor, id: string, input: {
    channel: LeadInteractionChannel;
    outcome: LeadInteractionOutcome;
    notes?: string;
  }) {
    const lead = await this.sellerLead(actor, id) as { id: string; referenceCode: string };
    return this.db.$transaction(async tx => {
      const interaction = await tx.leadInteraction.create({
        data: { leadId: id, employeeId: actor.userId, ...input },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SALES_LEAD_INTERACTION_RECORDED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, channel: input.channel, outcome: input.outcome },
        },
      });
      return interaction;
    });
  }

  async tasks(actor: SalesActor, query: { status?: SalesTaskStatus; overdue?: boolean; leadId?: string }) {
    const now = new Date();
    return this.db.salesTask.findMany({
      where: {
        assignedEmployeeId: actor.userId,
        ...(query.leadId ? { leadId: query.leadId } : {}),
        ...(query.status ? { status: query.status } : { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
        ...(query.overdue ? { dueAt: { lt: now } } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        leadId: true,
        type: true,
        status: true,
        priority: true,
        dueAt: true,
        details: true,
        expectedOutcome: true,
        completedAt: true,
        actualOutcome: true,
        lead: { select: { referenceCode: true, sellerName: true, make: true, model: true } },
      },
    });
  }

  async createTask(actor: SalesActor, id: string, input: {
    type: SalesTaskType;
    priority?: SalesTaskPriority;
    dueAt: Date;
    details: string;
    expectedOutcome?: string;
  }) {
    const lead = await this.sellerLead(actor, id) as { id: string; referenceCode: string };
    return this.db.$transaction(async tx => {
      const task = await tx.salesTask.create({
        data: {
          leadId: id,
          assignedEmployeeId: actor.userId,
          createdByEmployeeId: actor.userId,
          priority: input.priority || 'NORMAL',
          ...input,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SALES_TASK_CREATED',
          entityType: 'SalesTask',
          entityId: task.id,
          details: { leadId: id, referenceCode: lead.referenceCode, type: input.type, dueAt: input.dueAt.toISOString() },
        },
      });
      return task;
    });
  }

  async completeTask(actor: SalesActor, id: string, input: { actualOutcome: string }) {
    const task = await this.db.salesTask.findFirst({
      where: { id, assignedEmployeeId: actor.userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: { id: true, leadId: true },
    });
    if (!task) throw new HttpError(404, 'SALES_TASK_NOT_FOUND');
    return this.db.$transaction(async tx => {
      const updated = await tx.salesTask.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), actualOutcome: input.actualOutcome },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SALES_TASK_COMPLETED',
          entityType: 'SalesTask',
          entityId: id,
          details: { leadId: task.leadId },
        },
      });
      return updated;
    });
  }

  async requestInspection(actor: SalesActor, id: string, input: {
    requestedDate?: Date;
    timeSlot?: string;
    locationType: 'HUB' | 'HOME';
    address?: string;
    notes?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id, ...scope(actor), status: { in: ['SUBMITTED', 'QUALIFYING'] } },
      select: { id: true, referenceCode: true, city: true },
    });
    if (!lead) throw new HttpError(409, 'INSPECTION_REQUEST_NOT_ELIGIBLE');
    const branch = actor.branches.find(item => item.city.toLowerCase() === lead.city.toLowerCase());

    return this.db.$transaction(async tx => {
      const request = await tx.inspectionRequest.create({
        data: {
          leadId: id,
          requestedByEmployeeId: actor.userId,
          branchId: branch?.id,
          ...input,
        },
      });
      await tx.acquisitionLead.update({ where: { id }, data: { status: 'INSPECTION_SCHEDULED' } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_REQUESTED_BY_SALES',
          entityType: 'InspectionRequest',
          entityId: request.id,
          details: { leadId: id, referenceCode: lead.referenceCode, status: request.status },
        },
      });
      return request;
    });
  }

  async inspectionSummary(actor: SalesActor, leadId: string) {
    await this.sellerLead(actor, leadId);
    const requests = await this.db.inspectionRequest.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        requestedDate: true,
        timeSlot: true,
        locationType: true,
        address: true,
        notes: true,
        scheduledAt: true,
        createdAt: true,
      },
    });
    return {
      requests,
      latestStatus: requests[0]?.status || 'NOT_REQUESTED',
    };
  }

  async getAcquisitionOffers(actor: SalesActor, leadId: string) {
    await this.sellerLead(actor, leadId);
    return this.db.acquisitionOffer.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        offerAmountPaise: true,
        status: true,
        version: true,
        validUntil: true,
        terms: true,
        declineReason: true,
        acceptedAt: true,
        declinedAt: true,
        createdAt: true,
      },
    });
  }

  async proposeAcquisitionOffer(actor: SalesActor, leadId: string, input: {
    offerAmountPaise: bigint;
    validUntil: Date;
    terms?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id: leadId, ...scope(actor), status: { in: ['INSPECTION_SCHEDULED', 'OFFER_PENDING', 'OFFERED'] } },
      select: { id: true, referenceCode: true },
    });
    if (!lead) throw new HttpError(409, 'OFFER_PROPOSAL_NOT_ELIGIBLE');

    const latestOffer = await this.db.acquisitionOffer.findFirst({
      where: { leadId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestOffer?.version || 0) + 1;

    return this.db.$transaction(async tx => {
      const offer = await tx.acquisitionOffer.create({
        data: {
          leadId,
          offerAmountPaise: input.offerAmountPaise,
          validUntil: input.validUntil,
          terms: input.terms,
          version: nextVersion,
          status: 'OFFERED',
        },
      });
      await tx.acquisitionLead.update({ where: { id: leadId }, data: { status: 'OFFERED' } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'ACQUISITION_OFFER_PROPOSED',
          entityType: 'AcquisitionOffer',
          entityId: offer.id,
          details: { leadId, referenceCode: lead.referenceCode, amountPaise: input.offerAmountPaise.toString(), version: nextVersion },
        },
      });
      return offer;
    });
  }

  async recordSellerOfferResponse(actor: SalesActor, leadId: string, offerId: string, input: {
    decision: 'ACCEPTED' | 'DECLINED';
    declineReason?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id: leadId, ...scope(actor), status: 'OFFERED' },
      select: { id: true, referenceCode: true },
    });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');

    const offer = await this.db.acquisitionOffer.findFirst({
      where: { id: offerId, leadId, status: 'OFFERED' },
    });
    if (!offer) throw new HttpError(404, 'ACQUISITION_OFFER_NOT_FOUND');
    if (offer.validUntil < new Date()) throw new HttpError(410, 'OFFER_EXPIRED');

    return this.db.$transaction(async tx => {
      const updatedOffer = await tx.acquisitionOffer.update({
        where: { id: offerId },
        data: {
          status: input.decision === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED',
          acceptedAt: input.decision === 'ACCEPTED' ? new Date() : null,
          declinedAt: input.decision === 'DECLINED' ? new Date() : null,
          declineReason: input.declineReason,
        },
      });
      await tx.acquisitionLead.update({
        where: { id: leadId },
        data: { status: input.decision === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED' },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: input.decision === 'ACCEPTED' ? 'OFFER_ACCEPTED_BY_SELLER' : 'OFFER_DECLINED_BY_SELLER',
          entityType: 'AcquisitionOffer',
          entityId: offerId,
          details: { leadId, referenceCode: lead.referenceCode, decision: input.decision, reason: input.declineReason },
        },
      });
      return updatedOffer;
    });
  }

  async buyerLeads(actor: SalesActor, query: { page: number; limit: number; search?: string; status?: PurchaseEnquiryStatus }) {
    const where: Prisma.PurchaseEnquiryWhereInput = {
      ...buyerScope(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
          { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
          { listing: { title: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.purchaseEnquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, displayName: true, email: true, phone: true, preferredCity: true } },
          listing: {
            select: {
              id: true,
              title: true,
              pricePaise: true,
              status: true,
              vehicle: { select: { make: true, model: true, manufacturingYear: true, city: true, odometerKm: true } },
            },
          },
        },
      }),
      this.db.purchaseEnquiry.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async buyerLead(actor: SalesActor, id: string) {
    const lead = await this.db.purchaseEnquiry.findFirst({
      where: { id, ...buyerScope(actor) },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, displayName: true, email: true, phone: true, preferredCity: true, createdAt: true } },
        listing: {
          select: {
            id: true,
            title: true,
            pricePaise: true,
            status: true,
            vehicle: { select: { id: true, make: true, model: true, variant: true, manufacturingYear: true, fuelType: true, transmission: true, odometerKm: true, city: true } },
            media: { select: { id: true, url: true, displayOrder: true }, take: 4 },
          },
        },
        quotations: {
          select: { id: true, basePricePaise: true, chargesPaise: true, discountPaise: true, finalAmountPaise: true, status: true, version: true, validUntil: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        reservations: {
          select: { id: true, status: true, expiresAt: true, notes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!lead) throw new HttpError(404, 'BUYER_LEAD_NOT_FOUND');
    return lead;
  }

  async updateBuyerLeadStatus(actor: SalesActor, id: string, status: PurchaseEnquiryStatus) {
    const lead = await this.db.purchaseEnquiry.findFirst({ where: { id, ...buyerScope(actor) }, select: { id: true, status: true, listingId: true } });
    if (!lead) throw new HttpError(404, 'BUYER_LEAD_NOT_FOUND');
    const allowed: Record<string, string[]> = {
      RECEIVED: ['IN_REVIEW', 'CLOSED'],
      IN_REVIEW: ['CONTACTED', 'CLOSED'],
      CONTACTED: ['CLOSED'],
    };
    if (!allowed[lead.status]?.includes(status)) throw new HttpError(409, 'INVALID_BUYER_LEAD_STATUS_TRANSITION');
    return this.db.$transaction(async tx => {
      const updated = await tx.purchaseEnquiry.update({ where: { id }, data: { status } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'BUYER_LEAD_STATUS_UPDATED',
          entityType: 'PurchaseEnquiry',
          entityId: id,
          details: { from: lead.status, to: status, listingId: lead.listingId },
        },
      });
      return updated;
    });
  }

  async inventory(actor: SalesActor, query: { page: number; limit: number; search?: string; city?: string }) {
    const where: Prisma.VehicleListingWhereInput = {
      ...listingScope(actor),
      status: { in: ['PUBLISHED', 'RESERVED'] },
      ...(query.city ? { vehicle: { city: { equals: query.city, mode: 'insensitive' } } } : {}),
      ...(query.search ? {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { vehicle: { make: { contains: query.search, mode: 'insensitive' } } },
          { vehicle: { model: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.vehicleListing.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          title: true,
          pricePaise: true,
          currency: true,
          status: true,
          publishedAt: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              variant: true,
              manufacturingYear: true,
              odometerKm: true,
              fuelType: true,
              transmission: true,
              city: true,
            },
          },
          media: { select: { url: true }, take: 1 },
        },
      }),
      this.db.vehicleListing.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async inventoryItem(actor: SalesActor, id: string) {
    const item = await this.db.vehicleListing.findFirst({
      where: { id, ...listingScope(actor) },
      select: {
        id: true,
        title: true,
        pricePaise: true,
        currency: true,
        status: true,
        publishedAt: true,
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            variant: true,
            manufacturingYear: true,
            odometerKm: true,
            fuelType: true,
            transmission: true,
            color: true,
            city: true,
            registrationYear: true,
          },
        },
        media: { select: { id: true, url: true, displayOrder: true }, orderBy: { displayOrder: 'asc' } },
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { id: true, status: true, expiresAt: true, customer: { select: { displayName: true, email: true } } },
          take: 1,
        },
      },
    });
    if (!item) throw new HttpError(404, 'INVENTORY_ITEM_NOT_FOUND');
    return item;
  }

  async testDrives(actor: SalesActor, query: { page: number; limit: number; status?: TestDriveStatus }) {
    const where: Prisma.TestDriveRequestWhereInput = {
      ...(actor.globalScope ? {} : { serviceCity: { in: actor.branches.map(branch => branch.city), mode: 'insensitive' } }),
      ...(query.status ? { status: query.status } : {}),
    };
    if (!actor.globalScope && !actor.branches.length) throw new HttpError(403, 'SALES_BRANCH_SCOPE_REQUIRED');
    const [items, total] = await this.db.$transaction([
      this.db.testDriveRequest.findMany({
        where,
        orderBy: [{ requestedDate: 'asc' }, { timeSlot: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          requestedDate: true,
          timeSlot: true,
          serviceCity: true,
          locationPreference: true,
          status: true,
          customerNotes: true,
          createdAt: true,
          user: { select: { id: true, displayName: true, email: true, phone: true } },
          listing: { select: { id: true, title: true, status: true, vehicle: { select: { make: true, model: true } } } },
        },
      }),
      this.db.testDriveRequest.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async requestTestDrive(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    requestedDate: Date;
    timeSlot: string;
    locationPreference?: 'HUB' | 'HOME';
    serviceCity?: string;
    customerNotes?: string;
  }) {
    const listing = await this.db.vehicleListing.findFirst({
      where: { id: input.listingId, ...listingScope(actor), status: 'PUBLISHED' },
      include: { vehicle: true },
    });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_AVAILABLE');

    return this.db.$transaction(async tx => {
      const td = await tx.testDriveRequest.create({
        data: {
          userId: input.customerId,
          listingId: input.listingId,
          requestedDate: input.requestedDate,
          timeSlot: input.timeSlot,
          serviceCity: input.serviceCity || listing.vehicle.city || 'Bengaluru',
          locationPreference: input.locationPreference || 'HUB',
          customerNotes: input.customerNotes,
          status: 'REQUESTED',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'TEST_DRIVE_REQUESTED_BY_SALES',
          entityType: 'TestDriveRequest',
          entityId: td.id,
          details: { listingId: input.listingId, customerId: input.customerId, slot: input.timeSlot },
        },
      });
      return td;
    });
  }

  async updateTestDriveStatus(actor: SalesActor, id: string, input: { status: TestDriveStatus; customerNotes?: string }) {
    const td = await this.db.testDriveRequest.findUnique({ where: { id } });
    if (!td) throw new HttpError(404, 'TEST_DRIVE_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.testDriveRequest.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.customerNotes ? { customerNotes: input.customerNotes } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'TEST_DRIVE_STATUS_UPDATED',
          entityType: 'TestDriveRequest',
          entityId: id,
          details: { from: td.status, to: input.status, notes: input.customerNotes },
        },
      });
      return updated;
    });
  }

  async quotations(actor: SalesActor, query: { page: number; limit: number; listingId?: string; customerId?: string; status?: QuotationStatus }) {
    const where: Prisma.BuyerQuotationWhereInput = {
      ...(query.listingId ? { listingId: query.listingId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(actor.globalScope ? {} : { listing: { vehicle: { city: { in: actor.branches.map(b => b.city), mode: 'insensitive' } } } }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.buyerQuotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          basePricePaise: true,
          chargesPaise: true,
          discountPaise: true,
          finalAmountPaise: true,
          status: true,
          version: true,
          validUntil: true,
          createdAt: true,
          customer: { select: { displayName: true, email: true } },
          listing: { select: { id: true, title: true } },
          author: { select: { user: { select: { displayName: true } } } },
        },
      }),
      this.db.buyerQuotation.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async quotation(actor: SalesActor, id: string) {
    const q = await this.db.buyerQuotation.findFirst({
      where: {
        id,
        ...(actor.globalScope ? {} : { listing: { vehicle: { city: { in: actor.branches.map(b => b.city), mode: 'insensitive' } } } }),
      },
      select: {
        id: true,
        basePricePaise: true,
        chargesPaise: true,
        chargeBreakdown: true,
        discountPaise: true,
        finalAmountPaise: true,
        status: true,
        version: true,
        validUntil: true,
        terms: true,
        customerResponseNotes: true,
        acceptedAt: true,
        declinedAt: true,
        createdAt: true,
        customer: { select: { id: true, displayName: true, email: true, phone: true } },
        listing: { select: { id: true, title: true, status: true, vehicle: { select: { make: true, model: true, manufacturingYear: true, city: true } } } },
        author: { select: { user: { select: { displayName: true, email: true } } } },
        discountRequests: {
          select: { id: true, requestedDiscountPaise: true, proposedPricePaise: true, reason: true, status: true, decisionNotes: true, createdAt: true, decidedAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!q) throw new HttpError(404, 'QUOTATION_NOT_FOUND');
    return q;
  }

  async createQuotation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    chargesPaise?: bigint;
    chargeBreakdown?: Record<string, unknown>;
    discountPaise?: bigint;
    validUntil: Date;
    terms?: string;
  }) {
    const listing = await this.db.vehicleListing.findFirst({
      where: { id: input.listingId, ...listingScope(actor), status: { in: ['PUBLISHED', 'RESERVED'] } },
      select: { id: true, pricePaise: true },
    });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_FOUND');

    const customer = await this.db.user.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND');

    const charges = input.chargesPaise || 0n;
    const discount = input.discountPaise || 0n;
    const finalAmount = listing.pricePaise + charges - discount;
    if (finalAmount <= 0n) throw new HttpError(400, 'INVALID_QUOTATION_AMOUNT');

    return this.db.$transaction(async tx => {
      const q = await tx.buyerQuotation.create({
        data: {
          listingId: input.listingId,
          customerId: input.customerId,
          employeeId: actor.userId,
          enquiryId: input.enquiryId,
          basePricePaise: listing.pricePaise,
          chargesPaise: charges,
          chargeBreakdown: input.chargeBreakdown as Prisma.InputJsonValue,
          discountPaise: discount,
          finalAmountPaise: finalAmount,
          status: 'DRAFT',
          validUntil: input.validUntil,
          terms: input.terms || 'Standard 1-year warranty and transfer assistance included.',
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'RETAIL_QUOTATION_CREATED',
          entityType: 'BuyerQuotation',
          entityId: q.id,
          details: { listingId: input.listingId, customerId: input.customerId, amount: finalAmount.toString() },
        },
      });
      return q;
    });
  }

  async submitQuotation(actor: SalesActor, id: string) {
    const q = await this.db.buyerQuotation.findUnique({ where: { id } });
    if (!q) throw new HttpError(404, 'QUOTATION_NOT_FOUND');
    if (q.status !== 'DRAFT') throw new HttpError(409, 'QUOTATION_ALREADY_SUBMITTED');

    return this.db.$transaction(async tx => {
      const updated = await tx.buyerQuotation.update({
        where: { id },
        data: { status: 'SENT' },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'RETAIL_QUOTATION_SENT',
          entityType: 'BuyerQuotation',
          entityId: id,
          details: { finalAmount: q.finalAmountPaise.toString() },
        },
      });
      return updated;
    });
  }

  async requestDiscount(actor: SalesActor, quotationId: string, input: {
    requestedDiscountPaise: bigint;
    reason: string;
  }) {
    const q = await this.db.buyerQuotation.findUnique({ where: { id: quotationId } });
    if (!q) throw new HttpError(404, 'QUOTATION_NOT_FOUND');
    if (q.status !== 'DRAFT') throw new HttpError(409, 'DISCOUNT_ONLY_ON_DRAFT');

    const proposedPrice = q.basePricePaise + q.chargesPaise - input.requestedDiscountPaise;
    if (proposedPrice <= 0n) throw new HttpError(400, 'DISCOUNT_EXCEEDS_TOTAL');

    return this.db.$transaction(async tx => {
      const req = await tx.discountRequest.create({
        data: {
          quotationId,
          requestedDiscountPaise: input.requestedDiscountPaise,
          proposedPricePaise: proposedPrice,
          reason: input.reason,
          requestedById: actor.userId,
          status: 'PENDING',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'DISCOUNT_APPROVAL_REQUESTED',
          entityType: 'DiscountRequest',
          entityId: req.id,
          details: { quotationId, requestedDiscount: input.requestedDiscountPaise.toString() },
        },
      });
      return req;
    });
  }

  async decideDiscount(actor: SalesActor, discountRequestId: string, input: {
    decision: 'APPROVE' | 'REJECT';
    decisionNotes?: string;
  }) {
    if (!actor.roles.some(r => ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'PRICING_APPROVER'].includes(r))) {
      throw new HttpError(403, 'PERMISSION_DENIED');
    }
    const req = await this.db.discountRequest.findUnique({
      where: { id: discountRequestId, status: 'PENDING' },
      include: { quotation: true },
    });
    if (!req) throw new HttpError(404, 'DISCOUNT_REQUEST_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.discountRequest.update({
        where: { id: discountRequestId },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decisionNotes: input.decisionNotes,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });

      if (input.decision === 'APPROVE') {
        const finalAmount = req.quotation.basePricePaise + req.quotation.chargesPaise - req.requestedDiscountPaise;
        await tx.buyerQuotation.update({
          where: { id: req.quotationId },
          data: {
            discountPaise: req.requestedDiscountPaise,
            finalAmountPaise: finalAmount,
            status: 'APPROVED',
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: input.decision === 'APPROVE' ? 'DISCOUNT_APPROVED' : 'DISCOUNT_REJECTED',
          entityType: 'DiscountRequest',
          entityId: discountRequestId,
          details: { decision: input.decision, notes: input.decisionNotes },
        },
      });
      return updated;
    });
  }

  async reservations(actor: SalesActor, query: { page: number; limit: number; status?: VehicleReservationStatus }) {
    const where: Prisma.VehicleReservationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(actor.globalScope ? {} : { listing: { vehicle: { city: { in: actor.branches.map(b => b.city), mode: 'insensitive' } } } }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.vehicleReservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          notes: true,
          createdAt: true,
          listing: { select: { id: true, title: true, pricePaise: true } },
          customer: { select: { displayName: true, email: true, phone: true } },
          reservedBy: { select: { user: { select: { displayName: true } } } },
        },
      }),
      this.db.vehicleReservation.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async requestReservation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    quotationId?: string;
    enquiryId?: string;
    expiresAt: Date;
    notes?: string;
  }) {
    const listing = await this.db.vehicleListing.findFirst({
      where: { id: input.listingId, ...listingScope(actor) },
      select: { id: true, status: true, title: true },
    });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_FOUND');
    if (listing.status !== 'PUBLISHED') throw new HttpError(409, 'LISTING_NOT_AVAILABLE_FOR_RESERVATION');

    return this.db.$transaction(async tx => {
      // Check existing active reservation
      const existing = await tx.vehicleReservation.findFirst({
        where: { listingId: input.listingId, status: 'CONFIRMED' },
      });
      if (existing) throw new HttpError(409, 'VEHICLE_ALREADY_RESERVED');

      const res = await tx.vehicleReservation.create({
        data: {
          listingId: input.listingId,
          customerId: input.customerId,
          quotationId: input.quotationId,
          enquiryId: input.enquiryId,
          reservedById: actor.userId,
          expiresAt: input.expiresAt,
          notes: input.notes,
          status: 'CONFIRMED',
        },
      });

      await tx.vehicleListing.update({
        where: { id: input.listingId },
        data: { status: 'RESERVED' },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_RESERVED_BY_SALES',
          entityType: 'VehicleReservation',
          entityId: res.id,
          details: { listingId: input.listingId, title: listing.title, customerId: input.customerId },
        },
      });
      return res;
    });
  }

  async releaseReservation(actor: SalesActor, id: string, reason?: string) {
    const res = await this.db.vehicleReservation.findUnique({
      where: { id, status: 'CONFIRMED' },
      select: { id: true, listingId: true },
    });
    if (!res) throw new HttpError(404, 'RESERVATION_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const updated = await tx.vehicleReservation.update({
        where: { id },
        data: { status: 'RELEASED', releasedAt: new Date(), notes: reason },
      });

      await tx.vehicleListing.update({
        where: { id: res.listingId },
        data: { status: 'PUBLISHED' },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_RESERVATION_RELEASED',
          entityType: 'VehicleReservation',
          entityId: id,
          details: { listingId: res.listingId, reason },
        },
      });
      return updated;
    });
  }

  async customers(actor: SalesActor, query: { page: number; limit: number; search?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(query.search ? {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          preferredCity: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              acquisitionLeads: true,
              purchaseEnquiries: true,
              testDriveRequests: true,
            },
          },
        },
      }),
      this.db.user.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async customer(actor: SalesActor, id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        preferredCity: true,
        status: true,
        createdAt: true,
        acquisitionLeads: {
          select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, status: true, expectedPricePaise: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        purchaseEnquiries: {
          select: { id: true, status: true, message: true, createdAt: true, listing: { select: { id: true, title: true, pricePaise: true } } },
          orderBy: { createdAt: 'desc' },
        },
        testDriveRequests: {
          select: { id: true, status: true, requestedDate: true, timeSlot: true, listing: { select: { id: true, title: true } } },
          orderBy: { requestedDate: 'desc' },
        },
        addresses: {
          select: { id: true, label: true, addressLine: true, city: true, pincode: true },
        },
      },
    });
    if (!user) throw new HttpError(404, 'CUSTOMER_NOT_FOUND');
    return user;
  }

  async reports(actor: SalesActor) {
    const where = scope(actor);
    const bWhere = buyerScope(actor);

    const [
      sellerStats,
      buyerStats,
      inspectionCount,
      offerCount,
      testDriveStats,
    ] = await this.db.$transaction([
      this.db.acquisitionLead.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),
      this.db.purchaseEnquiry.groupBy({
        by: ['status'],
        where: bWhere,
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),
      this.db.inspectionRequest.count(),
      this.db.acquisitionOffer.count(),
      this.db.testDriveRequest.groupBy({
        by: ['status'],
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    return {
      sellerFunnel: (sellerStats as Array<{ status: string; _count: { id: number } }>).reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count.id }), {}),
      buyerFunnel: (buyerStats as Array<{ status: string; _count: { id: number } }>).reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count.id }), {}),
      inspectionsTotal: inspectionCount,
      offersTotal: offerCount,
      testDriveFunnel: (testDriveStats as Array<{ status: string; _count: { id: number } }>).reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count.id }), {}),
      generatedAt: new Date(),
    };
  }

  async notifications(actor: SalesActor) {
    const now = new Date();
    // Gather authoritative notifications:
    // 1. Unassigned leads in branch scope
    const unassigned = await this.db.acquisitionLead.findMany({
      where: { ...scope(actor), assignments: { none: { releasedAt: null } } },
      select: { id: true, referenceCode: true, make: true, model: true, city: true, createdAt: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    // 2. Overdue tasks for this employee
    const overdueTasks = await this.db.salesTask.findMany({
      where: { assignedEmployeeId: actor.userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now } },
      select: { id: true, type: true, details: true, dueAt: true, lead: { select: { referenceCode: true } } },
      take: 5,
    });

    // 3. Recent test drives
    const recentTestDrives = await this.db.testDriveRequest.findMany({
      where: { status: 'REQUESTED', ...(actor.globalScope ? {} : { serviceCity: { in: actor.branches.map(b => b.city), mode: 'insensitive' } }) },
      select: { id: true, requestedDate: true, timeSlot: true, user: { select: { displayName: true } }, listing: { select: { title: true } } },
      take: 5,
    });

    return {
      unassignedLeads: unassigned,
      overdueTasks,
      pendingTestDrives: recentTestDrives,
      totalUnread: unassigned.length + overdueTasks.length + recentTestDrives.length,
    };
  }

  async sendApprovedEmail(actor: SalesActor, input: {
    customerId: string;
    template: string;
    variables?: Record<string, string>;
  }) {
    const customer = await this.db.user.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND');

    const subjectMap: Record<string, string> = {
      ENQUIRY_ACK: 'V MOTIV — We have received your car enquiry',
      ADDITIONAL_DETAILS_REQUESTED: 'V MOTIV — More details requested for your valuation',
      INSPECTION_CONFIRMED: 'V MOTIV — Vehicle evaluation appointment scheduled',
      OFFER_COMMUNICATED: 'V MOTIV — Official purchase offer for your vehicle',
      QUOTATION_SENT: 'V MOTIV — Official quotation for your vehicle',
      TEST_DRIVE_CONFIRMED: 'V MOTIV — Test drive appointment confirmed',
    };

    const subject = subjectMap[input.template] || 'V MOTIV — Update on your vehicle enquiry';
    const emailBody = `Hello ${customer.displayName || 'Customer'},\n\nThis is an authorized update regarding your V MOTIV request.\n\nTemplate: ${input.template}\n${JSON.stringify(input.variables || {}, null, 2)}\n\nBest regards,\nV MOTIV Sales Team`;

    return this.db.$transaction(async tx => {
      const email = await tx.emailOutbox.create({
        data: {
          recipient: customer.email,
          subject,
          text: emailBody,
          userId: customer.id,
          eventKey: `sales-${Date.now()}-${crypto.randomUUID()}`,
          templateVersion: input.template,
          state: 'PENDING',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SALES_TRANSACTIONAL_EMAIL_QUEUED',
          entityType: 'EmailOutbox',
          entityId: email.id,
          details: { recipient: customer.email, template: input.template },
        },
      });
      return { id: email.id, state: email.state, queuedAt: email.createdAt };
    });
  }
}
