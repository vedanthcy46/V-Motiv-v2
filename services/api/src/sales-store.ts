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
import { canonicalMakeModel } from './vehicle-names.js';
import crypto from 'node:crypto';
import { accountSummary, resolveWalkInCustomer } from './walk-in-customer.js';
import { enqueueDomainEvent } from './employee-notifications/outbox.js';
import { HttpError } from './errors.js';
import type { NotificationService } from './notification/index.js';
import { notifyOfferAccepted } from './acquisition-events.js';
import { CODE_TTL_MS, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR, RESEND_COOLDOWN_MS, challengeStatus, codeMatches, generateCode, hashCode, isWalkInSeller, maskPhone, smsText } from './in-person-acceptance.js';
import { otpSecretFromEnv, smsSenderFromEnv, type SmsSender } from './sms.js';

export const salesRoles: EmployeeRole[] = ['SALES_EXECUTIVE', 'OPERATIONS_MANAGER', 'PRICING_APPROVER', 'ADMIN', 'SUPER_ADMIN'];
export const globalSalesRoles: EmployeeRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'];
const pricingRoles: EmployeeRole[] = ['PRICING_APPROVER', 'ADMIN', 'SUPER_ADMIN'];

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

export type AcquisitionValuationStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface SalesStore {
  actor(uid: string): Promise<SalesActor>;
  dashboard(actor: SalesActor): Promise<unknown>;
  scrapRequests(actor: SalesActor, opts: { status?: "NEW" | "CONTACTED" | "CLOSED"; search?: string; limit?: number }): Promise<unknown>;
  updateScrapRequest(actor: SalesActor, id: string, input: { status: "NEW" | "CONTACTED" | "CLOSED"; note?: string }): Promise<unknown>;
  
  // Seller Leads
  sellerLeads(actor: SalesActor, query: LeadQuery): Promise<unknown>;
  sellerLead(actor: SalesActor, id: string): Promise<unknown>;
  createManualSellerLead(actor: SalesActor, input: {
    sellerName: string;
    sellerPhone: string;
    sellerEmail: string;
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
  releaseSellerLead(actor: SalesActor, id: string): Promise<unknown>;
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
  inspectionRequests(actor: SalesActor, query: { page: number; limit: number; status?: InspectionRequestStatus }): Promise<unknown>;
  requestInspection(actor: SalesActor, id: string, input: {
    requestedDate?: Date;
    timeSlot?: string;
    locationType: 'HUB' | 'HOME';
    address?: string;
    notes?: string;
  }): Promise<unknown>;
  updateInspectionSchedule(actor: SalesActor, id: string, input: {
    inspectionDate: Date;
    inspectionTimeSlot: string;
    inspectionLocationType: 'HUB' | 'HOME';
    inspectionAddress?: string;
    notes?: string;
  }): Promise<unknown>;
  updateVehicleDetails(actor: SalesActor, id: string, input: {
    registrationNumber?: string;
    variant?: string;
    color?: string;
    registrationYear?: number;
    registrationCity?: string;
    odometerKm?: number;
  }): Promise<unknown>;
  inspectionSummary(actor: SalesActor, leadId: string): Promise<unknown>;

  valuations(actor: SalesActor, leadId: string): Promise<unknown>;
  allValuations(actor: SalesActor, query: { page: number; limit: number; status?: AcquisitionValuationStatus }): Promise<unknown>;
  reviewRequests(actor: SalesActor): Promise<unknown>;

  // Acquisition Offers
  acquisitionOffers(actor: SalesActor, query: { page: number; limit: number; status?: AcquisitionOfferStatus }): Promise<unknown>;
  getAcquisitionOffers(actor: SalesActor, leadId: string): Promise<unknown>;
  proposeAcquisitionOffer(actor: SalesActor, leadId: string, input: {
    valuationId?: string;
    offerAmountPaise: bigint;
    validUntil?: Date;
    terms?: string;
    reason?: string;
  }): Promise<unknown>;
  recordSellerOfferResponse(actor: SalesActor, leadId: string, offerId: string, input: {
    decision: 'ACCEPTED' | 'DECLINED';
    declineReason?: string;
  }): Promise<unknown>;
  startInPersonAcceptance(actor: SalesActor, leadId: string, offerId: string): Promise<unknown>;
  confirmInPersonAcceptance(actor: SalesActor, leadId: string, offerId: string, input: { challengeId: string; code: string }): Promise<unknown>;

  // Buyer Leads
  createManualBuyerLead(actor: SalesActor, input: { buyerName: string; buyerPhone: string; buyerEmail: string; listingId: string; message?: string }): Promise<unknown>;
  buyerLeads(actor: SalesActor, query: { page: number; limit: number; search?: string; status?: PurchaseEnquiryStatus }): Promise<unknown>;
  buyerLead(actor: SalesActor, id: string): Promise<unknown>;
  updateBuyerLeadStatus(actor: SalesActor, id: string, status: PurchaseEnquiryStatus): Promise<unknown>;

  // Inventory
  inventory(actor: SalesActor, query: { page: number; limit: number; search?: string; city?: string }): Promise<unknown>;
  inventoryItem(actor: SalesActor, id: string): Promise<unknown>;

  // Test Drives
  testDrives(actor: SalesActor, query: { page: number; limit: number; status?: TestDriveStatus; search?: string }): Promise<unknown>;
  requestTestDrive(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    requestedDate?: Date;
    timeSlot: string;
    locationPreference?: 'HUB' | 'HOME';
    serviceCity?: string;
    customerNotes?: string;
  }): Promise<unknown>;
  updateTestDriveStatus(actor: SalesActor, id: string, input: { status: TestDriveStatus; customerNotes?: string; assignedEmployeeId?: string }): Promise<unknown>;

  // Retail Quotations
  quotations(actor: SalesActor, query: { page: number; limit: number; listingId?: string; customerId?: string; status?: QuotationStatus }): Promise<unknown>;
  quotation(actor: SalesActor, id: string): Promise<unknown>;
  createQuotation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    chargesPaise?: bigint;
    chargeBreakdown?: Record<string, unknown>;
    validUntil?: Date;
    terms?: string;
  }): Promise<unknown>;
  updateQuotation(actor: SalesActor, id: string, input: { chargesPaise?: bigint; chargeBreakdown?: Record<string, unknown>; validUntil?: Date; terms?: string }): Promise<unknown>;
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
    expiresAt?: Date;
    notes?: string;
  }): Promise<unknown>;
  releaseReservation(actor: SalesActor, id: string, reason?: string): Promise<unknown>;
  releaseListingReservation(actor: SalesActor, listingId: string, reason?: string): Promise<unknown>;

  // Customers CRM
  customers(actor: SalesActor, query: { page: number; limit: number; search?: string }): Promise<unknown>;
  customer(actor: SalesActor, id: string): Promise<unknown>;

  // Reporting & Notifications
  reports(actor: SalesActor): Promise<unknown>;
  notifications(actor: SalesActor): Promise<unknown>;

  // Communications (Resend Outbox)
  sendApprovedEmail(actor: SalesActor, input: {
    customerId: string;
    enquiryId?: string;
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
function requirePricing(actor: SalesActor) { if (!actor.roles.some(role => pricingRoles.includes(role))) throw new HttpError(403, 'PRICING_ACCESS_DENIED'); }

const buyerLeadSelect = {
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
} as const;

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
  registrationNumber: true,
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
  constructor(private db: PrismaClient, private smsSender?: SmsSender, private notificationService?: NotificationService) {}

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

  /** Scrap-a-car requests from customers, newest first. Every sales person sees all of them: there are few, and whoever is free should call. */
  async scrapRequests(_actor: SalesActor, opts: { status?: 'NEW' | 'CONTACTED' | 'CLOSED'; search?: string; limit?: number }) {
    const search = opts.search?.trim();
    const rows = await this.db.scrapRequest.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(search ? { OR: [{ requestNumber: { contains: search.toUpperCase() } }, { registrationNumber: { contains: search.toUpperCase().replace(/[^A-Z0-9]/g, '') || '-' } }, { contactPhone: { contains: search.replace(/s/g, '') } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      include: { customer: { select: { displayName: true, email: true } } },
    });
    return { items: rows.map(row => ({
      id: row.id, requestNumber: row.requestNumber, status: row.status, registrationNumber: row.registrationNumber, make: row.make, model: row.model, manufacturingYear: row.manufacturingYear,
      fuelType: row.fuelType, odometerKm: row.odometerKm, condition: row.condition, city: row.city, pickupAddress: row.pickupAddress, contactPhone: row.contactPhone,
      customerName: row.customer.displayName || row.customer.email, staffNote: row.staffNote, contactedAt: row.contactedAt, createdAt: row.createdAt,
    })) };
  }

  /** Marks a request contacted or closed, with an optional note. The first person to change it is recorded as handling it. */
  async updateScrapRequest(actor: SalesActor, id: string, input: { status: 'CONTACTED' | 'CLOSED' | 'NEW'; note?: string }) {
    const existing = await this.db.scrapRequest.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    const updated = await this.db.scrapRequest.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.note !== undefined ? { staffNote: input.note || null } : {}),
        handledById: existing.handledById ?? actor.userId,
        ...(input.status === 'CONTACTED' && !existing.contactedAt ? { contactedAt: new Date() } : {}),
      },
    });
    await this.db.auditEvent.create({ data: { actorId: actor.userId, action: 'SCRAP_REQUEST_UPDATED', entityType: 'ScrapRequest', entityId: id, details: { from: existing.status, to: input.status } } });
    return { id: updated.id, status: updated.status, staffNote: updated.staffNote, contactedAt: updated.contactedAt };
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
      pendingValuationsCount,
      pendingDiscountsCount,
    ] = await Promise.all([
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
      this.db.acquisitionValuation.count({ where: { lead: where, status: 'PENDING_APPROVAL' } }),
      this.db.discountRequest.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      pipeline: { submitted, qualifying, inspectionScheduled, offerPending, offered, accepted },
      buyerPipeline: { received: buyerReceived, inReview: buyerInReview, contacted: buyerContacted, closed: buyerClosed },
      workQueue: { tasksDueToday, tasksOverdue, upcomingTestDrives, activeReservations, eligibleInventory },
      // Direct metrics for sales dashboard
      tasksDueToday,
      tasksOverdue,
      upcomingTestDrives,
      unassignedCount: submitted,
      openOffersCount: offered,
      pendingValuationsCount,
      pendingDiscountsCount,
      pendingReviewCount: pendingValuationsCount + pendingDiscountsCount,
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
    const [items, total] = await Promise.all([
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
    sellerEmail: string;
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
    const names = await canonicalMakeModel(this.db as any, input.make, input.model);
    return this.db.$transaction(async tx => {
      // One account per seller: theirs if they have one, otherwise created now and the app link emailed to them.
      const resolved = await resolveWalkInCustomer(tx, {
        name: input.sellerName,
        phone: input.sellerPhone,
        email: input.sellerEmail,
        placeholderDomain: 'sales.vmotiv.in',
        context: 'your car sale and offer',
      });
      const customer = resolved.user;
      if (resolved.accountCreated) await tx.user.update({ where: { id: customer.id }, data: { preferredCity: input.city } });

      const lead = await tx.acquisitionLead.create({
        data: {
          userId: customer.id,
          sellerName: input.sellerName,
          sellerPhone: input.sellerPhone,
          city: input.city,
          pincode: input.pincode,
          make: names.make,
          model: names.model,
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
      return Object.assign(lead, { customerAccount: accountSummary(resolved) });
    });
  }

  async updateSellerLeadStatus(actor: SalesActor, id: string, input: { status: AcquisitionLeadStatus; note?: string }) {
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, status: true, referenceCode: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    const allowed: Record<string, AcquisitionLeadStatus[]> = {
      SUBMITTED: ['QUALIFYING', 'CANCELLED'],
      QUALIFYING: ['INSPECTION_SCHEDULED', 'OFFER_PENDING', 'CANCELLED'],
      INSPECTION_SCHEDULED: ['OFFER_PENDING', 'CANCELLED'],
      OFFER_PENDING: ['OFFERED', 'REJECTED', 'CANCELLED'],
      OFFERED: ['ACCEPTED', 'OFFER_PENDING', 'REJECTED', 'CANCELLED'],
      REJECTED: ['OFFER_PENDING', 'OFFERED', 'CANCELLED'],
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

    async releaseSellerLead(actor: SalesActor, id: string) {
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, ...scope(actor) }, select: { id: true, city: true, referenceCode: true } });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    return this.db.$transaction(async tx => {
      const active = await tx.sellerLeadAssignment.findFirst({ where: { leadId: id, releasedAt: null } });
      if (!active) throw new HttpError(404, 'SELLER_LEAD_NOT_ASSIGNED');
      if (!actor.globalScope && !actor.roles.includes('OPERATIONS_MANAGER') && active.employeeId !== actor.userId) {
        throw new HttpError(403, 'PERMISSION_DENIED');
      }
      const updated = await tx.sellerLeadAssignment.update({
        where: { id: active.id },
        data: { releasedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_RELEASED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, previousEmployeeId: active.employeeId },
        },
      });
      return updated;
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
      // Written in the same transaction as the reassignment: the new owner is told, and the previous owner's alert stops being actionable.
      if (target.userId !== actor.userId) {
        await enqueueDomainEvent(tx, {
          eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: branch?.branchId ?? assignment.branchId ?? null, actorId: actor.userId,
          assigneeUserIds: [target.userId], payload: { referenceCode: lead.referenceCode }, dedupKey: `LEAD_ASSIGNED:${assignment.id}`,
        });
      }
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
        ...(actor.globalScope ? {} : { assignedEmployeeId: actor.userId }),
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
      where: { id, ...(actor.globalScope ? {} : { assignedEmployeeId: actor.userId }), status: { in: ['OPEN', 'IN_PROGRESS'] } },
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

  async inspectionRequests(actor: SalesActor, query: { page: number; limit: number; status?: InspectionRequestStatus }) {
    const where: Prisma.InspectionRequestWhereInput = {
      lead: scope(actor),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.inspectionRequest.count({ where }),
      this.db.inspectionRequest.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: { id: true, referenceCode: true, make: true, model: true, city: true, sellerName: true, sellerPhone: true },
          },
          branch: { select: { id: true, name: true, city: true } },
        },
      }),
    ]);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  async requestInspection(actor: SalesActor, id: string, input: {
    requestedDate?: Date;
    timeSlot?: string;
    locationType: 'HUB' | 'HOME';
    address?: string;
    notes?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id, ...scope(actor), status: { in: ['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'] } },
      select: { id: true, referenceCode: true, city: true },
    });
    if (!lead) throw new HttpError(409, 'INSPECTION_REQUEST_NOT_ELIGIBLE');

    const activeReq = await this.db.inspectionRequest.findFirst({
      where: { leadId: id, status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } },
    });
    if (activeReq) throw new HttpError(409, 'INSPECTION_REQUEST_ALREADY_ACTIVE');

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
      await tx.acquisitionLead.update({
        where: { id },
        data: {
          status: 'INSPECTION_SCHEDULED',
          inspectionDate: input.requestedDate,
          inspectionTimeSlot: input.timeSlot,
          inspectionLocationType: input.locationType,
          inspectionAddress: input.address,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_REQUESTED_BY_SALES',
          entityType: 'InspectionRequest',
          entityId: request.id,
          details: { leadId: id, referenceCode: lead.referenceCode, status: request.status },
        },
      });
      // Same transaction: the dispatch queue owner for this branch is told that an inspector is needed.
      await enqueueDomainEvent(tx, { eventType: 'INSPECTION_REQUESTED', aggregateId: request.id, branchId: branch?.id ?? null, actorId: actor.userId, payload: { referenceCode: lead.referenceCode }, dedupKey: `INSPECTION_REQUESTED:${request.id}` });
      return request;
    });
  }

  async updateInspectionSchedule(actor: SalesActor, id: string, input: {
    inspectionDate: Date;
    inspectionTimeSlot: string;
    inspectionLocationType: 'HUB' | 'HOME';
    inspectionAddress?: string;
    notes?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id, ...scope(actor) },
      select: { id: true, referenceCode: true, city: true, status: true },
    });
    if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');

    const branch = actor.branches.find(item => item.city.toLowerCase() === lead.city.toLowerCase());

    return this.db.$transaction(async tx => {
      const nextStatus = ['SUBMITTED', 'QUALIFYING'].includes(lead.status) ? 'INSPECTION_SCHEDULED' : undefined;
      const updatedLead = await tx.acquisitionLead.update({
        where: { id },
        data: {
          inspectionDate: input.inspectionDate,
          inspectionTimeSlot: input.inspectionTimeSlot,
          inspectionLocationType: input.inspectionLocationType,
          inspectionAddress: input.inspectionAddress,
          status: nextStatus,
        },
        select: leadSelect,
      });

      const existingReq = await tx.inspectionRequest.findFirst({
        where: { leadId: id, status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
      });

      let requestId: string;
      if (existingReq) {
        requestId = existingReq.id;
        await tx.inspectionRequest.update({
          where: { id: existingReq.id },
          data: {
            requestedDate: input.inspectionDate,
            timeSlot: input.inspectionTimeSlot,
            locationType: input.inspectionLocationType,
            address: input.inspectionAddress,
            notes: input.notes ?? existingReq.notes,
          },
        });

        const assignment = await tx.inspectionAssignment.findUnique({
          where: { requestId: existingReq.id },
        });
        if (assignment && assignment.status !== 'COMPLETED' && assignment.status !== 'CANCELLED') {
          const datePart = input.inspectionDate.toISOString().slice(0, 10);
          const hourPart = (input.inspectionTimeSlot.split('-')[0] || '10:00').trim();
          const scheduledAt = new Date(`${datePart}T${hourPart}:00.000Z`);
          await tx.inspectionAssignment.update({
            where: { id: assignment.id },
            data: {
              scheduledAt,
              locationType: input.inspectionLocationType,
              address: input.inspectionAddress,
              status: 'RESCHEDULED',
            },
          });
        }
      } else {
        const createdReq = await tx.inspectionRequest.create({
          data: {
            leadId: id,
            requestedByEmployeeId: actor.userId,
            branchId: branch?.id,
            requestedDate: input.inspectionDate,
            timeSlot: input.inspectionTimeSlot,
            locationType: input.inspectionLocationType,
            address: input.inspectionAddress,
            notes: input.notes,
            status: 'REQUESTED',
          },
        });
        requestId = createdReq.id;
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_INSPECTION_SCHEDULE_UPDATED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: {
            referenceCode: lead.referenceCode,
            inspectionDate: input.inspectionDate,
            inspectionTimeSlot: input.inspectionTimeSlot,
            inspectionLocationType: input.inspectionLocationType,
            requestId,
          },
        },
      });

      return updatedLead;
    });
  }

  async updateVehicleDetails(actor: SalesActor, id: string, input: {
    registrationNumber?: string;
    variant?: string;
    color?: string;
    registrationYear?: number;
    registrationCity?: string;
    odometerKm?: number;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id, ...scope(actor) },
      select: { id: true, referenceCode: true },
    });
    if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');

    const cleanReg = input.registrationNumber?.trim().toUpperCase();
    const updateData: Record<string, unknown> = {};
    if (cleanReg) updateData.registrationNumber = cleanReg;
    if (input.variant !== undefined) updateData.variant = input.variant.trim() || null;
    if (input.color !== undefined) updateData.color = input.color.trim() || null;
    if (input.registrationYear !== undefined) updateData.registrationYear = input.registrationYear;
    if (input.registrationCity !== undefined) updateData.registrationCity = input.registrationCity.trim() || null;
    if (input.odometerKm !== undefined) updateData.odometerKm = input.odometerKm;

    return this.db.$transaction(async tx => {
      const updated = await tx.acquisitionLead.update({
        where: { id },
        data: updateData as any,
        select: leadSelect,
      });

      const acqCase = await tx.acquisitionCase.findFirst({
        where: { leadId: id },
        include: { stockUnit: true },
      });
      if (acqCase?.stockUnit) {
        const stockUpdate: Record<string, unknown> = {};
        if (cleanReg) stockUpdate.registrationNumber = cleanReg;
        if (input.variant) stockUpdate.variant = input.variant.trim();
        if (input.odometerKm) stockUpdate.odometerKm = input.odometerKm;
        if (Object.keys(stockUpdate).length > 0) {
          await tx.vehicleStockUnit.update({
            where: { id: acqCase.stockUnit.id },
            data: stockUpdate as any,
          });
        }
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SELLER_LEAD_VEHICLE_DETAILS_UPDATED',
          entityType: 'AcquisitionLead',
          entityId: id,
          details: { referenceCode: lead.referenceCode, ...updateData },
        },
      });

      return updated;
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
        assignment: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            locationType: true,
            address: true,
          },
        },
        reports: {
          where: { status: 'APPROVED' },
          orderBy: { revision: 'desc' },
          take: 1,
          select: {
            id: true,
            revision: true,
            status: true,
            identity: true,
            reviewedAt: true,
            _count: { select: { defects: true, media: true } },
            reviewDecision: { select: { decision: true, createdAt: true } },
          },
        },
      },
    });
    const approvedReport = requests.find(r => r.reports.length > 0)?.reports[0];
    return {
      requests,
      latestStatus: requests[0]?.status || 'NOT_REQUESTED',
      approvedReport: approvedReport ? {
        id: approvedReport.id,
        revision: approvedReport.revision,
        status: approvedReport.status,
        identity: approvedReport.identity,
        reviewedAt: approvedReport.reviewedAt,
        defectsCount: approvedReport._count.defects,
        mediaCount: approvedReport._count.media,
      } : null,
    };
  }

  async valuations(actor: SalesActor, leadId: string) {
    await this.db.acquisitionLead.findFirst({ where: { id: leadId, ...scope(actor) } }) || (() => { throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND'); })();
    const items = await this.db.acquisitionValuation.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        inspectionReport: { select: { id: true, revision: true, status: true } },
        createdBy: { select: { user: { select: { displayName: true, email: true } } } },
        approvedBy: { select: { user: { select: { displayName: true, email: true } } } },
      },
    });
    return items.map(v => ({
      ...v,
      expectedResalePaise: v.expectedResalePaise.toString(),
      refurbishmentPaise: v.refurbishmentPaise.toString(),
      otherCostsPaise: v.otherCostsPaise.toString(),
      requiredMarginPaise: v.requiredMarginPaise.toString(),
      recommendedPurchasePaise: v.recommendedPurchasePaise.toString(),
    }));
  }

  async allValuations(actor: SalesActor, query: { page: number; limit: number; status?: AcquisitionValuationStatus }) {
    const where: Prisma.AcquisitionValuationWhereInput = {
      lead: scope(actor),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.acquisitionValuation.count({ where }),
      this.db.acquisitionValuation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, city: true, sellerName: true, sellerPhone: true, expectedPricePaise: true },
          },
          createdBy: { select: { user: { select: { displayName: true, email: true } } } },
          approvedBy: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
    ]);
    return {
      items: items.map(v => ({
        ...v,
        expectedResalePaise: v.expectedResalePaise.toString(),
        refurbishmentPaise: v.refurbishmentPaise.toString(),
        otherCostsPaise: v.otherCostsPaise.toString(),
        requiredMarginPaise: v.requiredMarginPaise.toString(),
        recommendedPurchasePaise: v.recommendedPurchasePaise.toString(),
        lead: {
          ...v.lead,
          expectedPricePaise: v.lead.expectedPricePaise ? v.lead.expectedPricePaise.toString() : null,
        },
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  async reviewRequests(actor: SalesActor) {
    const lScope = scope(actor);
    const [pendingValuations, pendingDiscounts, recentValuationDecisions, recentDiscountDecisions] = await Promise.all([
      this.db.acquisitionValuation.findMany({
        where: { lead: lScope, status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          lead: { select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, city: true, sellerName: true, sellerPhone: true, expectedPricePaise: true } },
          createdBy: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
      this.db.discountRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          quotation: {
            select: {
              id: true,
              listing: { select: { title: true } },
              customer: { select: { displayName: true, email: true, phone: true } },
            },
          },
          requestedBy: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
      this.db.acquisitionValuation.findMany({
        where: { lead: lScope, status: { in: ['APPROVED', 'REJECTED'] } },
        orderBy: { approvedAt: 'desc' },
        take: 10,
        include: {
          lead: { select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, city: true, sellerName: true, sellerPhone: true } },
          approvedBy: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
      this.db.discountRequest.findMany({
        where: { status: { in: ['APPROVED', 'REJECTED'] } },
        orderBy: { decidedAt: 'desc' },
        take: 10,
        include: {
          quotation: {
            select: {
              id: true,
              listing: { select: { title: true } },
              customer: { select: { displayName: true, email: true } },
            },
          },
          decidedBy: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
    ]);

    return {
      pendingValuations: pendingValuations.map(v => ({
        id: v.id,
        leadId: v.leadId,
        referenceCode: v.lead.referenceCode,
        vehicleTitle: `${v.lead.manufacturingYear} ${v.lead.make} ${v.lead.model}`,
        sellerName: v.lead.sellerName,
        sellerPhone: v.lead.sellerPhone,
        recommendedPurchasePaise: v.recommendedPurchasePaise.toString(),
        expectedResalePaise: v.expectedResalePaise.toString(),
        notes: v.notes,
        status: v.status,
        requestedBy: v.createdBy.user.displayName || v.createdBy.user.email,
        createdAt: v.createdAt.toISOString(),
      })),
      pendingDiscounts: pendingDiscounts.map(d => ({
        id: d.id,
        quotationId: d.quotationId,
        quotationNumber: `VM-QT-${d.quotationId.slice(0, 8).toUpperCase()}`,
        vehicleTitle: d.quotation.listing.title,
        customerName: d.quotation.customer.displayName || d.quotation.customer.email,
        requestedDiscountPaise: d.requestedDiscountPaise.toString(),
        proposedPricePaise: d.proposedPricePaise.toString(),
        reason: d.reason,
        status: d.status,
        requestedBy: d.requestedBy.user.displayName || d.requestedBy.user.email,
        createdAt: d.createdAt.toISOString(),
      })),
      recentDecisions: [
        ...recentValuationDecisions.map(v => ({
          id: v.id,
          type: 'VALUATION_OFFER' as const,
          referenceId: v.leadId,
          referenceCode: v.lead.referenceCode,
          title: `${v.lead.manufacturingYear} ${v.lead.make} ${v.lead.model}`,
          partyName: v.lead.sellerName,
          amountPaise: v.recommendedPurchasePaise.toString(),
          status: v.status,
          decisionNotes: v.notes,
          decidedBy: v.approvedBy?.user?.displayName || v.approvedBy?.user?.email || 'Admin',
          decidedAt: (v.approvedAt || v.updatedAt).toISOString(),
        })),
        ...recentDiscountDecisions.map(d => ({
          id: d.id,
          type: 'QUOTATION_DISCOUNT' as const,
          referenceId: d.quotationId,
          referenceCode: `VM-QT-${d.quotationId.slice(0, 8).toUpperCase()}`,
          title: d.quotation.listing.title,
          partyName: d.quotation.customer.displayName || d.quotation.customer.email,
          amountPaise: d.requestedDiscountPaise.toString(),
          status: d.status,
          decisionNotes: d.decisionNotes || d.reason,
          decidedBy: d.decidedBy?.user?.displayName || d.decidedBy?.user?.email || 'Admin',
          decidedAt: (d.decidedAt || d.updatedAt).toISOString(),
        })),
      ].sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()).slice(0, 15),
    };
  }

  async acquisitionOffers(actor: SalesActor, query: { page: number; limit: number; status?: AcquisitionOfferStatus }) {
    const where: Prisma.AcquisitionOfferWhereInput = {
      lead: scope(actor),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.acquisitionOffer.count({ where }),
      this.db.acquisitionOffer.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: { id: true, referenceCode: true, make: true, model: true, city: true, sellerName: true, sellerPhone: true },
          },
        },
      }),
    ]);
    return {
      items: items.map(o => ({
        ...o,
        offerAmountPaise: o.offerAmountPaise.toString(),
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
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

  /**
   * Sales asks for an offer to be sent to the seller. Nothing reaches the seller from here: this files a request that
   * Administration approves in the admin portal, and approving it is what issues the offer (see admin-store decide).
   */
  async proposeAcquisitionOffer(actor: SalesActor, leadId: string, input: {
    valuationId?: string;
    offerAmountPaise: bigint;
    validUntil?: Date;
    terms?: string;
    reason?: string;
  }) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id: leadId, ...scope(actor), status: { in: ['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED', 'OFFER_PENDING', 'OFFERED', 'REJECTED'] } },
      select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, sellerName: true, sellerPhone: true, expectedPricePaise: true, city: true, userId: true },
    });
    if (!lead) throw new HttpError(409, 'OFFER_PROPOSAL_NOT_ELIGIBLE');
    if (input.offerAmountPaise <= 0n) throw new HttpError(400, 'INVALID_OFFER_AMOUNT');

    // An offer is only ever priced from an inspection report that someone independent has approved.
    const report = await this.db.inspectionReport.findFirst({ where: { request: { leadId }, status: 'APPROVED' }, orderBy: { revision: 'desc' }, select: { id: true, revision: true } });
    if (!report) throw new HttpError(409, 'OFFER_REQUIRES_APPROVED_INSPECTION');
    const pending = await this.db.approvalRequest.findFirst({ where: { requestType: 'OFFER_REQUEST', status: 'PENDING', payload: { path: ['leadId'], equals: leadId } }, select: { id: true } });
    if (pending) throw new HttpError(409, 'OFFER_APPROVAL_ALREADY_PENDING', 'An offer for this seller is already waiting for administration approval.');

    const sellerAsk = lead.expectedPricePaise ?? input.offerAmountPaise;
    const vehicleTitle = `${lead.manufacturingYear} ${lead.make} ${lead.model}`;
    const result = await this.db.$transaction(async tx => {
      const valuation = await tx.acquisitionValuation.create({
        data: {
          leadId,
          inspectionReportId: report.id,
          expectedResalePaise: sellerAsk > input.offerAmountPaise ? sellerAsk : input.offerAmountPaise,
          refurbishmentPaise: 0n,
          otherCostsPaise: 0n,
          requiredMarginPaise: 0n,
          recommendedPurchasePaise: input.offerAmountPaise,
          notes: input.reason || 'Offer requested by Sales; awaiting administration approval.',
          status: 'PENDING_APPROVAL',
          createdById: actor.userId,
        },
      });
      const request = await tx.approvalRequest.create({
        data: {
          requestType: 'OFFER_REQUEST',
          requesterId: actor.userId,
          requiredPermission: 'approval.decide',
          scopeBranchIds: actor.branches.map(branch => branch.id),
          payload: {
            valuationId: valuation.id,
            leadId,
            referenceCode: lead.referenceCode,
            vehicleTitle,
            city: lead.city,
            sellerName: lead.sellerName,
            sellerPhone: lead.sellerPhone,
            recommendedPurchasePaise: input.offerAmountPaise.toString(),
            expectedResalePaise: sellerAsk.toString(),
            terms: input.terms,
            reason: input.reason,
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
      await tx.acquisitionLead.update({ where: { id: leadId }, data: { status: 'OFFER_PENDING' } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'ACQUISITION_OFFER_APPROVAL_REQUESTED',
          entityType: 'ApprovalRequest',
          entityId: request.id,
          details: { leadId, referenceCode: lead.referenceCode, valuationId: valuation.id, amountPaise: input.offerAmountPaise.toString(), reportRevision: report.revision },
        },
      });
      // Same transaction as the request: the approvers are told if and only if it was really filed. The proposer is never one of them.
      await enqueueDomainEvent(tx, {
        eventType: 'ACQUISITION_OFFER_APPROVAL_REQUESTED', aggregateId: request.id, branchId: actor.branches[0]?.id ?? null, actorId: actor.userId, excludeUserIds: [actor.userId],
        payload: { referenceCode: lead.referenceCode, vehicle: vehicleTitle }, dedupKey: `OFFER_APPROVAL:${request.id}`,
      });
      return { approvalRequestId: request.id, valuationId: valuation.id };
    });

    return {
      id: result.approvalRequestId,
      status: 'PENDING_ADMIN_APPROVAL' as const,
      valuationId: result.valuationId,
      offerAmountPaise: input.offerAmountPaise.toString(),
      message: 'Sent to administration for approval. The seller is told only after it is approved.',
    };
  }

  private async loadWalkInOffer(actor: SalesActor, leadId: string, offerId: string) {
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id: leadId, ...scope(actor) },
      select: { id: true, referenceCode: true, userId: true, status: true, sellerPhone: true, make: true, model: true, user: { select: { email: true, firebaseUid: true } } },
    });
    if (!lead) throw new HttpError(404, 'SELLER_LEAD_NOT_FOUND');
    // Sellers who have an app account must accept in the app; staff can never accept on their behalf.
    if (!isWalkInSeller(lead.user)) throw new HttpError(409, 'SELLER_MUST_ACCEPT_IN_APP');
    if (lead.status !== 'OFFERED') throw new HttpError(409, 'LEAD_NOT_AWAITING_SELLER_RESPONSE');
    const offer = await this.db.acquisitionOffer.findFirst({ where: { id: offerId, leadId } });
    if (!offer) throw new HttpError(404, 'ACQUISITION_OFFER_NOT_FOUND');
    if (offer.status !== 'OFFERED') throw new HttpError(409, 'OFFER_NOT_ACTIONABLE');
    if (offer.validUntil.getTime() <= Date.now()) throw new HttpError(410, 'OFFER_EXPIRED');
    return { lead, offer };
  }

  /** Step 1: text a one-time code to the phone number on the walk-in lead. Staff never see the code. */
  async startInPersonAcceptance(actor: SalesActor, leadId: string, offerId: string) {
    const secret = otpSecretFromEnv(process.env);
    const send = this.smsSender ?? smsSenderFromEnv(process.env);
    // Fail closed: a code that cannot be delivered (or hashed safely) must never exist.
    if (!secret || !send) throw new HttpError(503, 'SMS_NOT_CONFIGURED');
    const { lead, offer } = await this.loadWalkInOffer(actor, leadId, offerId);

    const now = new Date();
    const recent = await this.db.sellerOfferAcceptanceChallenge.findMany({
      where: { offerId, createdAt: { gt: new Date(now.getTime() - 60 * 60_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) throw new HttpError(429, 'OTP_RESEND_TOO_SOON');
    if (recent.length >= MAX_SENDS_PER_HOUR) throw new HttpError(429, 'OTP_SEND_LIMIT_REACHED');

    const id = crypto.randomUUID();
    const code = generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    // Only the newest code works: retire any earlier unused ones for this offer.
    await this.db.sellerOfferAcceptanceChallenge.updateMany({ where: { offerId, consumedAt: null }, data: { consumedAt: now } });
    await this.db.sellerOfferAcceptanceChallenge.create({
      data: { id, offerId, leadId, phone: lead.sellerPhone, codeHash: hashCode(code, id, secret), offerVersion: offer.version, createdById: actor.userId, expiresAt },
    });
    try {
      const rupees = (Number(offer.offerAmountPaise) / 100).toLocaleString('en-IN');
      await send(lead.sellerPhone, smsText(code, `${lead.make} ${lead.model}`, rupees));
    } catch (error) {
      await this.db.sellerOfferAcceptanceChallenge.deleteMany({ where: { id } });
      console.warn('[ACCEPTANCE_SMS_FAILED]', (error as Error)?.message);
      throw new HttpError(502, 'SMS_DELIVERY_FAILED');
    }
    await this.db.auditEvent.create({
      data: { actorId: actor.userId, action: 'SELLER_OFFER_ACCEPTANCE_CODE_SENT', entityType: 'AcquisitionOffer', entityId: offerId, details: { leadId, challengeId: id, phone: maskPhone(lead.sellerPhone) } },
    });
    return { challengeId: id, phoneMasked: maskPhone(lead.sellerPhone), expiresAt, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
  }

  /** Step 2: the seller gives the code they received; a correct code records the acceptance exactly like the app does. */
  async confirmInPersonAcceptance(actor: SalesActor, leadId: string, offerId: string, input: { challengeId: string; code: string }) {
    const secret = otpSecretFromEnv(process.env);
    if (!secret) throw new HttpError(503, 'SMS_NOT_CONFIGURED');
    const { lead, offer } = await this.loadWalkInOffer(actor, leadId, offerId);

    const challenge = await this.db.sellerOfferAcceptanceChallenge.findFirst({ where: { id: input.challengeId, offerId, leadId } });
    // Only the staff member who sent the code can complete it, so the audit trail names one witness.
    if (!challenge || challenge.createdById !== actor.userId) throw new HttpError(404, 'ACCEPTANCE_CODE_NOT_FOUND');
    if (challenge.offerVersion !== offer.version) throw new HttpError(409, 'OFFER_CHANGED_REQUEST_NEW_CODE');
    const now = new Date();
    const status = challengeStatus(challenge, now);
    if (status === 'USED') throw new HttpError(409, 'ACCEPTANCE_CODE_ALREADY_USED');
    if (status === 'EXPIRED') throw new HttpError(410, 'ACCEPTANCE_CODE_EXPIRED');
    if (status === 'LOCKED') throw new HttpError(429, 'ACCEPTANCE_CODE_LOCKED');

    // Count the attempt before checking it, atomically, so parallel guesses cannot beat the limit.
    const counted = await this.db.sellerOfferAcceptanceChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw new HttpError(429, 'ACCEPTANCE_CODE_LOCKED');
    if (!codeMatches(input.code, challenge.id, secret, challenge.codeHash)) {
      throw new HttpError(400, 'ACCEPTANCE_CODE_INVALID', `Incorrect code. ${Math.max(MAX_ATTEMPTS - challenge.attempts - 1, 0)} attempts left.`);
    }

    return this.db.$transaction(async tx => {
      const claimed = await tx.sellerOfferAcceptanceChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now } });
      if (claimed.count === 0) throw new HttpError(409, 'ACCEPTANCE_CODE_ALREADY_USED');
      const accepted = await tx.acquisitionOffer.updateMany({
        where: { id: offerId, leadId, status: 'OFFERED', version: offer.version },
        data: { status: 'ACCEPTED', acceptedAt: now, version: { increment: 1 } },
      });
      if (accepted.count === 0) throw new HttpError(409, 'OFFER_NOT_ACTIONABLE');
      await tx.acquisitionLead.update({ where: { id: leadId }, data: { status: 'ACCEPTED' } });
      const acquisitionCase = await tx.acquisitionCase.create({
        data: {
          leadId,
          offerId,
          sellerAcceptedByUserId: lead.userId,
          acceptedAt: now,
          documents: { create: [
            { documentType: 'SELLER_IDENTITY', status: 'REQUESTED' },
            { documentType: 'VEHICLE_REGISTRATION', status: 'REQUESTED' },
            { documentType: 'SELLER_AUTHORITY', status: 'REQUESTED' },
            { documentType: 'LIEN_OR_HYPOTHECATION', status: 'REQUESTED' },
            { documentType: 'PURCHASE_AGREEMENT', status: 'REQUESTED' },
          ] },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'ACQUISITION_OFFER_ACCEPTED',
          entityType: 'AcquisitionOffer',
          entityId: offerId,
          details: {
            acquisitionCaseId: acquisitionCase.id,
            source: 'IN_PERSON_OTP',
            challengeId: challenge.id,
            verifiedPhone: maskPhone(challenge.phone),
            witnessEmployeeId: actor.userId,
            offerVersion: offer.version,
          },
        },
      });
      await tx.auditEvent.create({
        data: { actorId: actor.userId, action: 'ACQUISITION_CASE_CREATED', entityType: 'AcquisitionCase', entityId: acquisitionCase.id, details: { leadId, offerId } },
      });
      return { id: offerId, status: 'ACCEPTED' as const, acceptedAt: now, acquisitionCaseId: acquisitionCase.id, acceptedVia: 'IN_PERSON_OTP' as const };
    }).then(async result => {
      await notifyOfferAccepted(this.notificationService, this.db as any, lead, 'IN_PERSON_OTP', result.acquisitionCaseId).catch(() => undefined);
      return result;
    });
  }

  async recordSellerOfferResponse(actor: SalesActor, leadId: string, offerId: string, input: {
    decision: 'ACCEPTED' | 'DECLINED';
    declineReason?: string;
  }) {
    if (input.decision === 'ACCEPTED') {
      throw new HttpError(403, 'SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION');
    }
    const lead = await this.db.acquisitionLead.findFirst({
      where: { id: leadId, ...scope(actor), status: 'OFFERED' },
      select: { id: true, referenceCode: true, userId: true },
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
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: input.declineReason,
        },
      });
      // Keep lead active in negotiation under OFFER_PENDING so sales team can issue a revised counter-offer
      await tx.acquisitionLead.update({
        where: { id: leadId },
        data: { status: 'OFFER_PENDING' },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'OFFER_DECLINED_BY_SELLER',
          entityType: 'AcquisitionOffer',
          entityId: offerId,
          details: { leadId, referenceCode: lead.referenceCode, decision: input.decision, reason: input.declineReason, version: offer.version },
        },
      });
      if (lead.userId) {
        await tx.notification.create({
          data: {
            userId: lead.userId,
            eventType: 'ACQUISITION_OFFER_DECLINED',
            title: 'Offer Response Recorded',
            body: `You declined our offer ${offer.version ? `(v${offer.version})` : ''}. Our team is reviewing whether a revised counter-offer can be presented.`,
            entityType: 'AcquisitionLead',
            entityId: leadId,
          },
        }).catch(() => undefined);
      }
      return updatedOffer;
    });
  }

  /** A buyer who walks into the showroom. They get an app account (or their existing one is used) and an enquiry on the car. */
  async createManualBuyerLead(actor: SalesActor, input: { buyerName: string; buyerPhone: string; buyerEmail: string; listingId: string; message?: string }) {
    const listing = await this.db.vehicleListing.findFirst({
      where: { id: input.listingId, status: { in: ['PUBLISHED', 'RESERVED'] }, ...listingScope(actor) },
      select: { id: true, title: true },
    });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_FOUND');
    return this.db.$transaction(async tx => {
      const resolved = await resolveWalkInCustomer(tx, {
        name: input.buyerName,
        phone: input.buyerPhone,
        email: input.buyerEmail,
        placeholderDomain: 'sales.vmotiv.in',
        context: 'your car enquiry, quotations and test drives',
      });
      // The same person asking about the same car again is one lead, not two.
      const open = await tx.purchaseEnquiry.findFirst({ where: { userId: resolved.user.id, listingId: listing.id, status: { not: 'CLOSED' } }, select: { id: true } });
      const enquiry = open
        ? await tx.purchaseEnquiry.findUniqueOrThrow({ where: { id: open.id }, select: buyerLeadSelect })
        : await tx.purchaseEnquiry.create({
            data: { userId: resolved.user.id, listingId: listing.id, message: input.message?.trim() || 'Walk-in enquiry at the showroom.' },
            select: buyerLeadSelect,
          });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: open ? 'MANUAL_BUYER_LEAD_REUSED' : 'MANUAL_BUYER_LEAD_CREATED',
          entityType: 'PurchaseEnquiry',
          entityId: enquiry.id,
          details: { listingId: listing.id, title: listing.title, customerId: resolved.user.id },
        },
      });
      return Object.assign(enquiry, { alreadyExisted: Boolean(open), customerAccount: accountSummary(resolved) });
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
    const [items, total] = await Promise.all([
      this.db.purchaseEnquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: buyerLeadSelect,
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
    const [items, total] = await Promise.all([
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
          reservations: {
            where: { status: { in: ['CONFIRMED', 'REQUESTED'] } },
            select: {
              id: true,
              status: true,
              expiresAt: true,
              notes: true,
              customer: {
                select: { id: true, displayName: true, email: true, phone: true },
              },
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
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

  async testDrives(actor: SalesActor, query: { page: number; limit: number; status?: TestDriveStatus; search?: string }) {
    const where: Prisma.TestDriveRequestWhereInput = {
      ...(actor.globalScope ? {} : { serviceCity: { in: actor.branches.map(branch => branch.city), mode: 'insensitive' } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
          { listing: { title: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    if (!actor.globalScope && !actor.branches.length) throw new HttpError(403, 'SALES_BRANCH_SCOPE_REQUIRED');
    const [items, total] = await Promise.all([
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
    enquiryId?: string;
    requestedDate?: Date;
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
    const customer = await this.db.user.findUnique({ where: { id: input.customerId }, select: { id: true, status: true } });
    if (!customer || customer.status !== 'ACTIVE') throw new HttpError(404, 'CUSTOMER_NOT_FOUND');
    if (input.enquiryId) {
      const enquiry = await this.db.purchaseEnquiry.findFirst({
        where: { id: input.enquiryId, userId: input.customerId, listingId: input.listingId },
        select: { id: true },
      });
      if (!enquiry) throw new HttpError(409, 'TEST_DRIVE_ENQUIRY_MISMATCH');
    }

    return this.db.$transaction(async tx => {
      if (input.enquiryId) { await tx.purchaseEnquiry.updateMany({ where: { id: input.enquiryId, status: { in: ['RECEIVED', 'IN_REVIEW'] } }, data: { status: 'CONTACTED' } }); }
      const td = await tx.testDriveRequest.create({
        data: {
          userId: input.customerId,
          listingId: input.listingId,
          requestedDate: input.requestedDate || new Date(),
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

  async updateTestDriveStatus(actor: SalesActor, id: string, input: { status: TestDriveStatus; customerNotes?: string; assignedEmployeeId?: string }) {
    const td = await this.db.testDriveRequest.findFirst({
      where: {
        id,
        ...(actor.globalScope ? {} : { serviceCity: { in: actor.branches.map(branch => branch.city), mode: 'insensitive' } }),
      },
      include: { listing: { select: { title: true } } },
    });
    if (!td) throw new HttpError(404, 'TEST_DRIVE_NOT_FOUND');
    const allowedTransitions: Partial<Record<TestDriveStatus, TestDriveStatus[]>> = {
      REQUESTED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
    };
    const sameStatus = td.status === input.status;
    // Changing who takes a drive that is already confirmed is allowed; nothing else may repeat a status.
    const reassign = sameStatus && input.status === 'CONFIRMED' && input.assignedEmployeeId && input.assignedEmployeeId !== td.assignedEmployeeId;
    if (sameStatus && !reassign) return td;
    if (!sameStatus && !allowedTransitions[td.status]?.includes(input.status)) {
      throw new HttpError(409, 'TEST_DRIVE_STATUS_TRANSITION_NOT_ALLOWED');
    }

    // Confirming a drive puts a named person on it (the person confirming, unless Sales picks someone else).
    let executiveId: string | undefined;
    if (input.status === 'CONFIRMED') {
      executiveId = input.assignedEmployeeId ?? td.assignedEmployeeId ?? actor.userId;
      const executive = await this.db.employee.findFirst({ where: { userId: executiveId, active: true }, select: { userId: true } });
      if (!executive) throw new HttpError(400, 'TEST_DRIVE_EXECUTIVE_NOT_AVAILABLE', 'That employee cannot be assigned to a test drive.');
    }

    const updated = await this.db.$transaction(async tx => {
      const saved = await tx.testDriveRequest.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.customerNotes ? { customerNotes: input.customerNotes } : {}),
          ...(executiveId && executiveId !== td.assignedEmployeeId ? { assignedEmployeeId: executiveId, assignedAt: new Date() } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: reassign ? 'TEST_DRIVE_EXECUTIVE_REASSIGNED' : 'TEST_DRIVE_STATUS_UPDATED',
          entityType: 'TestDriveRequest',
          entityId: id,
          details: { from: td.status, to: input.status, notes: input.customerNotes, assignedEmployeeId: executiveId },
        },
      });
      return saved;
    });

    // After the commit: the customer hears who will take them, and the assigned colleague is told.
    if (input.status === 'CONFIRMED') {
      const executive = await this.db.user.findUnique({ where: { id: executiveId! }, select: { displayName: true } }).catch(() => null);
      await this.notificationService?.dispatchDomainEvent({
        type: 'TEST_DRIVE_CONFIRMED',
        category: 'BUYING',
        priority: 'HIGH',
        recipientUserIds: [td.userId],
        title: 'Test drive confirmed',
        body: `${td.listing.title}: ${executive?.displayName || 'A V MOTIV specialist'} will take you on the drive.`,
        deepLink: `vmotiv://test-drives/${id}`,
        referenceId: id,
        entityType: 'TestDriveRequest',
      } as any).catch(() => undefined);
      if (executiveId && executiveId !== actor.userId) {
        await enqueueDomainEvent(this.db, {
          eventType: 'TEST_DRIVE_ASSIGNED', aggregateId: id, actorId: actor.userId, assigneeUserIds: [executiveId],
          payload: { vehicle: td.listing.title, slot: `${td.requestedDate.toISOString().slice(0, 10)}, ${td.timeSlot}` }, dedupKey: `TEST_DRIVE_ASSIGNED:${id}:${executiveId}`,
        }).catch(() => undefined);
      }
    }
    return updated;
  }

  async quotations(actor: SalesActor, query: { page: number; limit: number; listingId?: string; customerId?: string; status?: QuotationStatus }) {
    const where: Prisma.BuyerQuotationWhereInput = {
      ...(query.listingId ? { listingId: query.listingId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(actor.globalScope ? {} : { listing: { vehicle: { city: { in: actor.branches.map(b => b.city), mode: 'insensitive' } } } }),
    };
    const [items, total] = await Promise.all([
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
          customer: { select: { id: true, displayName: true, email: true, phone: true } },
          listing: { select: { id: true, title: true } },
          author: { select: { user: { select: { displayName: true } } } },
          discountRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              requestedDiscountPaise: true,
              proposedPricePaise: true,
              reason: true,
              decisionNotes: true,
              decidedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      this.db.buyerQuotation.count({ where }),
    ]);
    const mapped = items.map(item => ({
      ...item,
      quotationNumber: `VM-QT-${item.id.slice(0, 8).toUpperCase()}`,
      basePricePaise: item.basePricePaise.toString(),
      chargesPaise: item.chargesPaise.toString(),
      discountPaise: item.discountPaise.toString(),
      finalAmountPaise: item.finalAmountPaise.toString(),
      totalPricePaise: item.finalAmountPaise.toString(),
      latestDiscountRequest: item.discountRequests?.[0] ? {
        id: item.discountRequests[0].id,
        status: item.discountRequests[0].status,
        requestedDiscountPaise: item.discountRequests[0].requestedDiscountPaise.toString(),
        proposedPricePaise: item.discountRequests[0].proposedPricePaise.toString(),
        reason: item.discountRequests[0].reason,
        decisionNotes: item.discountRequests[0].decisionNotes,
        decidedAt: item.discountRequests[0].decidedAt?.toISOString() || null,
        createdAt: item.discountRequests[0].createdAt.toISOString(),
      } : null,
    }));
    return { items: mapped, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
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
    return {
      ...q,
      quotationNumber: `VM-QT-${q.id.slice(0, 8).toUpperCase()}`,
      basePricePaise: q.basePricePaise.toString(),
      chargesPaise: q.chargesPaise.toString(),
      discountPaise: q.discountPaise.toString(),
      finalAmountPaise: q.finalAmountPaise.toString(),
      totalPricePaise: q.finalAmountPaise.toString(),
      discountRequests: q.discountRequests.map(d => ({
        ...d,
        requestedDiscountPaise: d.requestedDiscountPaise.toString(),
        proposedPricePaise: d.proposedPricePaise.toString(),
      })),
    };
  }

  async createQuotation(actor: SalesActor, input: {
    listingId: string;
    customerId: string;
    enquiryId?: string;
    chargesPaise?: bigint;
    chargeBreakdown?: Record<string, unknown>;
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
    const finalAmount = listing.pricePaise + charges;
    if (finalAmount <= 0n) throw new HttpError(400, 'INVALID_QUOTATION_AMOUNT');

    return this.db.$transaction(async tx => {
      if (input.enquiryId) { await tx.purchaseEnquiry.updateMany({ where: { id: input.enquiryId, status: { in: ['RECEIVED', 'IN_REVIEW'] } }, data: { status: 'CONTACTED' } }); }
      const q = await tx.buyerQuotation.create({
        data: {
          listingId: input.listingId,
          customerId: input.customerId,
          employeeId: actor.userId,
          enquiryId: input.enquiryId,
          basePricePaise: listing.pricePaise,
          chargesPaise: charges,
          chargeBreakdown: input.chargeBreakdown as Prisma.InputJsonValue,
          discountPaise: 0n,
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

  async updateQuotation(actor: SalesActor, id: string, input: { chargesPaise?: bigint; chargeBreakdown?: Record<string, unknown>; validUntil?: Date; terms?: string }) {
    const quotation = await this.db.buyerQuotation.findFirst({ where: { id, listing: listingScope(actor) } });
    if (!quotation) throw new HttpError(404, 'QUOTATION_NOT_FOUND');
    if (quotation.status !== 'DRAFT') throw new HttpError(409, 'ONLY_DRAFT_QUOTATIONS_CAN_BE_EDITED');
    const charges = input.chargesPaise ?? quotation.chargesPaise;
    const finalAmount = quotation.basePricePaise + charges;
    return this.db.$transaction(async tx => {
      const updated = await tx.buyerQuotation.update({
        where: { id },
        data: {
          chargesPaise: charges,
          chargeBreakdown: input.chargeBreakdown as Prisma.InputJsonValue | undefined,
          validUntil: input.validUntil,
          terms: input.terms,
          discountPaise: 0n,
          finalAmountPaise: finalAmount,
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'RETAIL_QUOTATION_DRAFT_UPDATED', entityType: 'BuyerQuotation', entityId: id, details: { finalAmount: finalAmount.toString() } } });
      return updated;
    });
  }

  async submitQuotation(actor: SalesActor, id: string) {
    const q = await this.db.buyerQuotation.findUnique({
      where: { id },
      include: {
        customer: true,
        listing: true,
      },
    });
    if (!q) throw new HttpError(404, 'QUOTATION_NOT_FOUND');
    if (!['DRAFT', 'APPROVED'].includes(q.status)) throw new HttpError(409, 'QUOTATION_NOT_SENDABLE');

    return this.db.$transaction(async tx => {
      const updated = await tx.buyerQuotation.update({
        where: { id },
        data: { status: 'SENT' },
      });

      const quoteNumber = `VM-QT-${id.slice(0, 8).toUpperCase()}`;
      const finalPriceFormatted = `₹${(Number(q.finalAmountPaise) / 100).toLocaleString('en-IN')}`;
      const basePriceFormatted = `₹${(Number(q.basePricePaise) / 100).toLocaleString('en-IN')}`;
      const chargesFormatted = `₹${(Number(q.chargesPaise) / 100).toLocaleString('en-IN')}`;
      const discountFormatted = `₹${(Number(q.discountPaise) / 100).toLocaleString('en-IN')}`;

      await tx.emailOutbox.create({
        data: {
          userId: q.customerId,
          eventKey: `retail-quotation/${id}`,
          recipient: q.customer.email,
          templateVersion: 'retail-quotation-v1',
          subject: `Official Vehicle Quotation [${quoteNumber}] — ${q.listing.title}`,
          text: `Dear ${q.customer.displayName || 'Customer'},\n\nWe are pleased to present the official retail quotation for ${q.listing.title}.\n\nQuotation Details:\n  Quote Reference: ${quoteNumber}\n  Base Vehicle Price: ${basePriceFormatted}\n  Processing & Registration Charges: ${chargesFormatted}\n  Authorized Discount: ${discountFormatted}\n  Final On-Road Offer Price: ${finalPriceFormatted}\n  Validity: Until ${q.validUntil.toLocaleDateString('en-IN')}\n\nTerms & Inclusions:\n${q.terms || 'Standard 1-year warranty and transfer assistance included.'}\n\nYou can review, accept, or request further information directly in your V MOTIV app.\n\nWarm regards,\nV MOTIV Sales & Delivery Team`,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'RETAIL_QUOTATION_SENT',
          entityType: 'BuyerQuotation',
          entityId: id,
          details: { finalAmount: q.finalAmountPaise.toString(), quoteNumber },
        },
      });
      return updated;
    }).then(async updated => {
      // After the commit: the customer is told in the app, not only by email.
      await this.notificationService?.dispatchDomainEvent({
        type: 'RETAIL_QUOTATION_ISSUED',
        category: 'BUYING',
        priority: 'HIGH',
        recipientUserIds: [q.customerId],
        title: `Your quotation for ${q.listing.title}`,
        body: `Final price ₹${(Number(q.finalAmountPaise) / 100).toLocaleString('en-IN')}. Review it and accept or decline in the app.`,
        deepLink: `vmotiv://quotations/${id}`,
        referenceId: id,
        entityType: 'BuyerQuotation',
        metadata: { listingId: q.listingId },
      } as any).catch(() => undefined);
      return updated;
    });
  }

  async requestDiscount(actor: SalesActor, quotationId: string, input: {
    requestedDiscountPaise: bigint;
    reason: string;
  }) {
    const q = await this.db.buyerQuotation.findUnique({
      where: { id: quotationId },
      include: { listing: true, customer: true },
    });
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

      const discountApproval = await tx.approvalRequest.create({
        select: { id: true },
        data: {
          requestType: 'DISCOUNT_REQUEST',
          status: 'PENDING',
          requesterId: actor.userId,
          requiredPermission: 'commercial.discount.approve',
          scopeBranchIds: actor.branches.map(b => b.id),
          payload: {
            discountRequestId: req.id,
            quotationId,
            vehicleTitle: q.listing.title,
            customerName: q.customer.displayName || q.customer.email,
            customerEmail: q.customer.email,
            customerPhone: q.customer.phone,
            requestedDiscountPaise: input.requestedDiscountPaise.toString(),
            proposedPrice: proposedPrice.toString(),
            reason: input.reason,
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
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
      // Same transaction as the request. The person who asked cannot be told to approve their own request.
      await enqueueDomainEvent(tx, {
        eventType: 'DISCOUNT_APPROVAL_REQUESTED', aggregateId: discountApproval.id, branchId: actor.branches[0]?.id ?? null, actorId: actor.userId,
        excludeUserIds: [actor.userId], payload: { referenceCode: `VM-QT-${quotationId.slice(0, 8).toUpperCase()}`, vehicle: q.listing.title }, dedupKey: `DISCOUNT_APPROVAL:${discountApproval.id}`,
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

      // Keep linked ApprovalRequest record in sync if exists
      const linkedApproval = await tx.approvalRequest.findFirst({
        where: {
          requestType: 'DISCOUNT_REQUEST',
          payload: { path: ['discountRequestId'], equals: discountRequestId },
        },
      });
      if (linkedApproval && linkedApproval.status === 'PENDING') {
        await tx.approvalRequest.update({
          where: { id: linkedApproval.id },
          data: {
            status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            executedAt: new Date(),
          },
        });
        await tx.approvalDecision.create({
          data: {
            requestId: linkedApproval.id,
            actorId: actor.userId,
            decision: input.decision,
            reason: input.decisionNotes || 'Decided via Sales Portal',
            requestVersion: linkedApproval.version,
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
    const [items, total] = await Promise.all([
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
    const mapped = items.map(item => ({
      ...item,
      reservationNumber: `VM-RES-${item.id.slice(0, 8).toUpperCase()}`,
      listing: {
        ...item.listing,
        pricePaise: item.listing.pricePaise.toString(),
      },
    }));
    return { items: mapped, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
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
    const res = await this.db.vehicleReservation.findFirst({
      where: { id, status: { in: ['CONFIRMED', 'REQUESTED'] } },
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

  async releaseListingReservation(actor: SalesActor, listingId: string, reason?: string) {
    const listing = await this.db.vehicleListing.findFirst({
      where: { id: listingId, ...listingScope(actor) },
      select: { id: true, status: true, title: true },
    });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_FOUND');
    if (listing.status !== 'RESERVED') throw new HttpError(400, 'LISTING_NOT_RESERVED');

    const activeRes = await this.db.vehicleReservation.findFirst({
      where: { listingId, status: { in: ['CONFIRMED', 'REQUESTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return this.db.$transaction(async tx => {
      let releasedReservation = null;
      if (activeRes) {
        releasedReservation = await tx.vehicleReservation.update({
          where: { id: activeRes.id },
          data: { status: 'RELEASED', releasedAt: new Date(), notes: reason },
        });
      }

      const updatedListing = await tx.vehicleListing.update({
        where: { id: listingId },
        data: { status: 'PUBLISHED' },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_RESERVATION_RELEASED',
          entityType: 'VehicleListing',
          entityId: listingId,
          details: { listingId, reservationId: activeRes?.id, reason },
        },
      });

      return { listing: updatedListing, reservation: releasedReservation };
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
    const [items, total] = await Promise.all([
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
        emails: {
          select: { id: true, subject: true, text: true, templateVersion: true, state: true, attempts: true, createdAt: true, lastErrorCode: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        notifications: {
          select: { id: true, title: true, body: true, category: true, eventType: true, read: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!user) throw new HttpError(404, 'CUSTOMER_NOT_FOUND');
    return { ...user, emailOutbox: user.emails };
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
    ] = await Promise.all([
      (this.db.acquisitionLead as any).groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),
      (this.db.purchaseEnquiry as any).groupBy({
        by: ['status'],
        where: bWhere,
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),
      this.db.inspectionRequest.count(),
      this.db.acquisitionOffer.count(),
      (this.db.testDriveRequest as any).groupBy({
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

    // 4. Pending discount requests
    const pendingDiscounts = await this.db.discountRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        quotation: {
          select: {
            id: true,
            listing: { select: { title: true } },
            customer: { select: { displayName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 5. Recent Sent quotations
    const sentQuotations = await this.db.buyerQuotation.findMany({
      where: {
        status: 'SENT',
        ...(actor.globalScope ? {} : { listing: { vehicle: { city: { in: actor.branches.map(b => b.city), mode: 'insensitive' } } } }),
      },
      select: {
        id: true,
        validUntil: true,
        finalAmountPaise: true,
        customer: { select: { displayName: true, email: true } },
        listing: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 6. Pending acquisition valuations / offer requests
    const pendingValuations = await this.db.acquisitionValuation.findMany({
      where: { lead: scope(actor), status: 'PENDING_APPROVAL' },
      select: {
        id: true,
        recommendedPurchasePaise: true,
        lead: { select: { id: true, referenceCode: true, make: true, model: true, manufacturingYear: true, city: true, sellerName: true } },
        createdAt: true,
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    // 7. Customers who asked us to scrap a vehicle and have not been called yet
    const newScrapRequests = await this.db.scrapRequest.findMany({
      where: { status: 'NEW' },
      select: { id: true, requestNumber: true, make: true, model: true, manufacturingYear: true, city: true, contactPhone: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      unassignedLeads: unassigned,
      newScrapRequests,
      overdueTasks,
      pendingTestDrives: recentTestDrives,
      pendingDiscounts: pendingDiscounts.map(d => ({
        id: d.id,
        quotationId: d.quotationId,
        vehicleTitle: d.quotation.listing.title,
        customerName: d.quotation.customer.displayName || d.quotation.customer.email,
        requestedDiscountPaise: d.requestedDiscountPaise.toString(),
        createdAt: d.createdAt.toISOString(),
      })),
      pendingOfferReviews: pendingValuations.map(v => ({
        id: v.id,
        leadId: v.lead.id,
        referenceCode: v.lead.referenceCode,
        vehicleTitle: `${v.lead.manufacturingYear} ${v.lead.make} ${v.lead.model}`,
        sellerName: v.lead.sellerName,
        city: v.lead.city,
        recommendedPurchasePaise: v.recommendedPurchasePaise.toString(),
        createdAt: v.createdAt.toISOString(),
      })),
      sentQuotations: sentQuotations.map(s => ({
        id: s.id,
        quotationNumber: `VM-QT-${s.id.slice(0, 8).toUpperCase()}`,
        vehicleTitle: s.listing.title,
        customerName: s.customer.displayName || s.customer.email,
        finalPricePaise: s.finalAmountPaise.toString(),
        validUntil: s.validUntil.toISOString(),
      })),
      totalUnread: newScrapRequests.length + unassigned.length + overdueTasks.length + recentTestDrives.length + pendingDiscounts.length + pendingValuations.length + sentQuotations.length,
    };
  }

  async sendApprovedEmail(actor: SalesActor, input: {
    customerId: string;
    enquiryId?: string;
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
    const messageMap: Record<string, string> = {
      ENQUIRY_ACK: 'We have received your vehicle enquiry. A V MOTIV advisor will contact you with the next steps.',
      ADDITIONAL_DETAILS_REQUESTED: 'Our team needs a few more details before we can progress your request. Your advisor will explain what is needed.',
      INSPECTION_CONFIRMED: 'Your vehicle evaluation appointment has been scheduled. Please keep the vehicle and its available documents ready.',
      OFFER_COMMUNICATED: 'Your official purchase offer is ready for review in V MOTIV. Please contact your advisor if you would like to discuss it.',
      QUOTATION_SENT: 'Your official vehicle quotation is ready for review in V MOTIV. Please contact your advisor with any questions.',
      TEST_DRIVE_CONFIRMED: 'Your test-drive appointment has been confirmed. We look forward to welcoming you.',
    };
    const details = Object.entries(input.variables || {})
      .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim(), value.trim()] as const)
      .filter(([, value]) => value.length > 0)
      .map(([key, value]) => `• ${key.charAt(0).toUpperCase()}${key.slice(1)}: ${value}`);
    const detailBlock = details.length ? `\n\nDetails:\n${details.join('\n')}` : '';
    const emailBody = `Hello ${customer.displayName || 'Customer'},\n\n${messageMap[input.template] || 'This is an authorized update regarding your V MOTIV request.'}${detailBlock}\n\nBest regards,\nV MOTIV Sales Team`;

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
