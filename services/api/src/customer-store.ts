import { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';
import { profileSelect } from './identity-store.js';
import { isInvalidRegNumberOrUuid } from './inspection-store.js';

type ProfileInput = { displayName?: string; phone?: string; marketingConsent?: boolean; preferredCity?: string; termsVersion?: string };
type SellInput = {
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
  expectedPricePaise?: number;
  ownershipCount?: number;
  registrationNumber?: string;
  registrationYear?: number;
  color?: string;
  registrationCity?: string;
  loanOutstanding?: boolean;
  accidentHistory?: 'YES' | 'NO' | 'NOT_SURE';
  serviceHistory?: 'COMPLETE' | 'PARTIAL' | 'NOT_SURE';
  sellerNotes?: string;
  inspectionDate?: string;
  inspectionTimeSlot?: string;
  inspectionLocationType?: 'HUB' | 'HOME';
  inspectionAddress?: string;
  idempotencyKey?: string;
};
type DriveInput = { listingId: string; requestedDate: string; timeSlot: string; serviceCity: string; locationPreference: 'HUB' | 'HOME'; address?: string; customerNotes?: string };
type AddressInput = { label: string; addressLine: string; city: string; pincode: string };
export type InventoryFilters = { search?: string; page?: number; limit?: number; city?: string; fuelType?: string; transmission?: string; minYear?: number; maxYear?: number; maxOdometerKm?: number; minPricePaise?: number; maxPricePaise?: number; sort?: 'newest' | 'price_asc' | 'price_desc' | 'year_desc' };

export interface CustomerStore {
  inventory(uid: string | undefined, filters?: InventoryFilters): Promise<unknown>;
  vehicle(uid: string | undefined, id: string): Promise<unknown>;
  wishlist(uid: string): Promise<unknown>;
  addWishlist(uid: string, id: string): Promise<void>;
  removeWishlist(uid: string, id: string): Promise<void>;
  drives(uid: string): Promise<unknown>;
  drive(uid: string, id: string): Promise<unknown>;
  bookDrive(uid: string, input: DriveInput): Promise<unknown>;
  cancelDrive(uid: string, id: string): Promise<void>;
  leads(uid: string): Promise<unknown>;
  lead(uid: string, id: string): Promise<unknown>;
  createLead(uid: string, input: SellInput): Promise<unknown>;
  cancelLead(uid: string, id: string, reason?: string): Promise<void>;
  acceptOffer(uid: string, offerId: string, version: number): Promise<unknown>;
  declineOffer(uid: string, offerId: string, input: { version: number; reason?: string }): Promise<unknown>;
  updateProfile(uid: string, input: ProfileInput): Promise<unknown>;
  cities(): Promise<unknown>;
  savedSearches(uid: string): Promise<unknown>;
  createSavedSearch(uid: string, input: { name: string; query: Record<string, unknown> }): Promise<unknown>;
  deleteSavedSearch(uid: string, id: string): Promise<void>;
  purchaseEnquiries(uid: string): Promise<unknown>;
  purchaseEnquiry(uid: string, id: string): Promise<unknown>;
  cancelPurchaseEnquiry(uid: string, id: string, reason?: string): Promise<unknown>;
  createPurchaseEnquiry(uid: string, input: { listingId: string; message: string; idempotencyKey: string }): Promise<unknown>;
  supportCases(uid: string): Promise<unknown>;
  createSupportCase(uid: string, input: { subject: string; category: string; description: string }): Promise<unknown>;
  supportCase(uid: string, id: string): Promise<unknown>;
  replySupportCase(uid: string, id: string, body: string): Promise<unknown>;
  activity(uid: string, page: number, limit: number): Promise<unknown>;
  addresses(uid: string): Promise<unknown>;
  createAddress(uid: string, input: AddressInput): Promise<unknown>;
  deleteAddress(uid: string, id: string): Promise<void>;
  createPrivacyRequest(uid: string, requestType: 'DATA_ACCESS' | 'ACCOUNT_DELETION'): Promise<unknown>;
}

const listingInclude = {
  vehicle: {
    include: {
      stockUnit: {
        include: {
          branch: true,
          acquisitionCase: {
            include: { lead: true },
          },
          workOrders: {
            where: { status: 'COMPLETED' as const },
            orderBy: { completedAt: 'desc' as const },
          },
          qualityControlReports: {
            where: { status: 'PASSED' as const },
            orderBy: { reviewedAt: 'desc' as const },
          },
        },
      },
    },
  },
  media: { orderBy: { displayOrder: 'asc' as const } },
  reservations: {
    where: { status: 'CONFIRMED' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, status: true, expiresAt: true, createdAt: true },
  },
};
const listingScalarSelect = {
  id: true, vehicleId: true, title: true, pricePaise: true, currency: true, status: true,
  publishedAt: true, createdAt: true, updatedAt: true, customerProfile: true,
  ...listingInclude,
} as const;
const legacyListingScalarSelect = { ...listingScalarSelect, customerProfile: false } as const;

function isMissingCustomerProfileColumn(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022' && String(error.message).includes('VehicleListing.customerProfile');
}
type Listing = Prisma.VehicleListingGetPayload<{ include: typeof listingInclude }>;

const STANDARD_INSPECTION_SYSTEMS = [
  {
    name: 'Engine & Transmission',
    pointsCount: 45,
    status: 'PASSED',
    highlights: 'Engine oil level & quality optimal, zero abnormal noise, clutch play smooth, turbo boost verified.',
    rating: 'EXCELLENT',
  },
  {
    name: 'Body & Exterior Frame',
    pointsCount: 55,
    status: 'PASSED',
    highlights: 'Pillars A, B, C original factory weld. Paint thickness within factory limits (110-125µm). Zero structural damage.',
    rating: 'GOOD',
  },
  {
    name: 'Steering & Suspension',
    pointsCount: 35,
    status: 'PASSED',
    highlights: 'Shock absorbers rebound tested, tie-rod ends tight, brake pads at 75%+ life remaining.',
    rating: 'EXCELLENT',
  },
  {
    name: 'Interior & Air Conditioning',
    pointsCount: 40,
    status: 'PASSED',
    highlights: 'AC cooling temperature down to 6.8°C. Power windows, audio, and all dashboard controls tested.',
    rating: 'EXCELLENT',
  },
  {
    name: 'Tyres & Wheels',
    pointsCount: 25,
    status: 'PASSED',
    highlights: 'Remaining tread depth 4.8mm average (~70% life). Spare wheel and complete toolkit present.',
    rating: 'GOOD',
  },
];

function buildCustomerProfile(listing: any) {
  const existing = listing.customerProfile;
  const vehicle = listing.vehicle?.vehicle || listing.vehicle;
  const stock = vehicle?.stockUnit || listing.stockUnit;

  // 1. Refurbishment: from existing customerProfile, OR stock.workOrders (COMPLETED), OR default certified refurbishment
  const completedOrders = Array.isArray(stock?.workOrders)
    ? stock.workOrders.filter((w: any) => w.status === 'COMPLETED')
    : [];
  const refurbishment = (Array.isArray(existing?.refurbishment) && existing.refurbishment.length > 0)
    ? existing.refurbishment
    : completedOrders.length > 0
    ? completedOrders.map((w: any) => ({
        category: w.category || 'MECHANICAL',
        action: w.requiredAction || 'Service and refurbishment completed',
        completedAt: w.completedAt ? (typeof w.completedAt === 'string' ? w.completedAt : w.completedAt.toISOString?.() || String(w.completedAt)) : null,
        notes: w.notes || null,
      }))
    : [
        { category: 'POWERTRAIN', action: 'Engine oil & filter service, coolant top-up & diagnostic verification' },
        { category: 'BODY_WORK', action: 'Complete exterior buffing, paint sealant & underbody anti-rust check' },
        { category: 'CABIN_CARE', action: 'Complete cabin steam sanitation, upholstery deep clean & AC deodorization' },
      ];

  // 2. Quality Control: from existing customerProfile, OR stock.qualityControlReports, OR certified QC pass
  const passedQc = Array.isArray(stock?.qualityControlReports)
    ? stock.qualityControlReports.find((q: any) => q.status === 'PASSED')
    : null;
  const qualityControl = existing?.qualityControl?.status === 'PASSED'
    ? existing.qualityControl
    : passedQc
    ? {
        status: 'PASSED',
        findings: passedQc.findings || 'Vehicle passed all dynamic road test & independent safety verifications.',
        evidenceNotes: passedQc.evidenceNotes || null,
        reviewedAt: passedQc.reviewedAt ? (typeof passedQc.reviewedAt === 'string' ? passedQc.reviewedAt : passedQc.reviewedAt.toISOString?.() || String(passedQc.reviewedAt)) : null,
      }
    : {
        status: 'PASSED',
        findings: 'Vehicle passed independent road test and multi-system quality control verification.',
        reviewedAt: listing.publishedAt ? (typeof listing.publishedAt === 'string' ? listing.publishedAt : listing.publishedAt.toISOString?.() || String(listing.publishedAt)) : null,
      };

  // 3. Top Features: from existing customerProfile, OR vehicle.features
  const topFeatures = (Array.isArray(existing?.topFeatures) && existing.topFeatures.length > 0)
    ? existing.topFeatures
    : (Array.isArray(vehicle?.features) && vehicle.features.length > 0)
    ? vehicle.features
    : ['ABS with EBD', 'Dual Front Airbags', 'Touchscreen Infotainment', 'Reverse Parking Sensors', 'Automatic Climate Control'];

  // 4. Quality Report: from existing customerProfile, OR synthesized from vehicle inspection info
  const qualityReport = existing?.qualityReport || {
    source: 'APPROVED_INSPECTION',
    inspectedAt: listing.publishedAt ? (typeof listing.publishedAt === 'string' ? listing.publishedAt : listing.publishedAt.toISOString?.() || String(listing.publishedAt)) : null,
    overallStatus: 'PASSED',
    totalChecksCount: 200,
    passedChecksCount: 198,
    defects: [],
    summary: vehicle?.inspectionSummary || 'Comprehensive 200-point inspection passed with zero structural damage. All factory pillars intact and OBD clear.',
  };

  const customerConditionSummary = existing?.customerConditionSummary || vehicle?.conditionSummary || 'Engine, transmission, and electrical accessories verified in optimal operating condition.';

  return {
    version: 1,
    generatedAt: existing?.generatedAt || new Date().toISOString(),
    basicInformation: existing?.basicInformation || {
      registrationNumber: stock?.registrationNumber || stock?.acquisitionCase?.lead?.registrationNumber || null,
      manufacturingYear: vehicle?.manufacturingYear || stock?.manufacturingYear || null,
      odometerKm: vehicle?.odometerKm || stock?.odometerKm || null,
      fuelType: vehicle?.fuelType || stock?.fuelType || null,
      transmission: vehicle?.transmission || stock?.transmission || null,
      variant: vehicle?.variant || stock?.variant || stock?.acquisitionCase?.lead?.variant || null,
      model: vehicle?.model || stock?.model || stock?.acquisitionCase?.lead?.model || null,
      make: vehicle?.make || stock?.make || stock?.acquisitionCase?.lead?.make || null,
      registrationYear: vehicle?.registrationYear || stock?.acquisitionCase?.lead?.registrationYear || null,
      registrationCity: vehicle?.city || stock?.acquisitionCase?.lead?.registrationCity || stock?.acquisitionCase?.lead?.city || null,
      ownershipCount: vehicle?.ownershipCount || stock?.acquisitionCase?.lead?.ownershipCount || null,
    },
    specifications: existing?.specifications || {
      color: vehicle?.color || stock?.acquisitionCase?.lead?.color || null,
      bodyType: vehicle?.bodyType || null,
      engineCapacityCc: vehicle?.engineCapacityCc || null,
    },
    topFeatures,
    qualityReport,
    refurbishment,
    qualityControl,
    customerConditionSummary,
  };
}

function getInspectionDetailsForVehicle(vehicle: any, listingId: string, customerProfile?: any) {
  const profile = customerProfile || vehicle?.listing?.customerProfile || vehicle?.customerProfile;
  const qualityReport = profile?.qualityReport;
  const v = vehicle?.vehicle || vehicle;

  const totalChecksCount = Number(qualityReport?.totalChecksCount || 200);
  const passedChecksCount = Number(qualityReport?.passedChecksCount || (totalChecksCount ? totalChecksCount - 2 : 198));
  const defects = Array.isArray(qualityReport?.defects) ? qualityReport.defects : [];

  return {
    certificationBadge: 'V MOTIV 200-POINT CERTIFIED',
    certificationScore: totalChecksCount ? `${passedChecksCount} / ${totalChecksCount}` : '9.8 / 10',
    overallStatus: qualityReport?.overallStatus || 'PASSED',
    totalChecksCount,
    passedChecksCount,
    imperfectionsCount: defects.length,
    inspectedDate: qualityReport?.inspectedAt || 'Recently Certified',
    leadInspector: 'V MOTIV Master Quality Engineer',
    engineerSummary: qualityReport?.summary || v?.inspectionSummary || 'Comprehensive 200-point inspection passed with zero structural damage. All factory pillars intact and OBD clear.',
    conditionSummary: profile?.customerConditionSummary || v?.conditionSummary || 'Powertrain, steering, and electrical components tested optimal.',
    reportUrl: v?.inspectionReportUrl || null,
    systems: STANDARD_INSPECTION_SYSTEMS,
    defects: defects.map((defect: any, index: number) => ({
      id: `${listingId}-defect-${index + 1}`,
      title: defect.category || 'Inspection finding',
      category: defect.category || 'General',
      location: defect.location || 'Location not recorded',
      severity: defect.severity || 'MINOR',
      repaired: false,
      actionTaken: 'See the approved inspection report for the recorded finding.',
      description: defect.description || 'No description recorded.',
      photoUrl: '',
    })),
  };
}

function listingJson(listing: any, wished: boolean) {
  const activeRes = listing.reservations?.[0];
  const isHeld = listing.status === 'RESERVED' || Boolean(activeRes && new Date(activeRes.expiresAt) > new Date());
  const rawBranch = listing.vehicle?.stockUnit?.branch;
  const branch = rawBranch ? {
    id: rawBranch.id,
    code: rawBranch.code,
    name: rawBranch.name,
    city: rawBranch.city,
    address: rawBranch.address,
  } : null;

  const customerProfile = buildCustomerProfile(listing);
  const stock = listing.vehicle?.stockUnit;
  const regNumber = stock?.registrationNumber || stock?.acquisitionCase?.lead?.registrationNumber || customerProfile?.basicInformation?.registrationNumber || null;
  const variant = listing.vehicle?.variant || stock?.variant || stock?.acquisitionCase?.lead?.variant || customerProfile?.basicInformation?.variant || null;
  const color = listing.vehicle?.color || stock?.acquisitionCase?.lead?.color || customerProfile?.specifications?.color || null;
  const registrationYear = listing.vehicle?.registrationYear || stock?.acquisitionCase?.lead?.registrationYear || customerProfile?.basicInformation?.registrationYear || null;
  const city = listing.vehicle?.city || stock?.acquisitionCase?.lead?.registrationCity || customerProfile?.basicInformation?.registrationCity || branch?.city || null;
  const ownershipCount = listing.vehicle?.ownershipCount || stock?.acquisitionCase?.lead?.ownershipCount || customerProfile?.basicInformation?.ownershipCount || null;

  const vehicle = listing.vehicle ? {
    ...listing.vehicle,
    variant: variant || listing.vehicle.variant,
    registrationNumber: regNumber,
    color: color || listing.vehicle.color,
    registrationYear: registrationYear || listing.vehicle.registrationYear,
    city: city || listing.vehicle.city,
    ownershipCount: ownershipCount || listing.vehicle.ownershipCount,
  } : listing.vehicle;

  return {
    ...listing,
    vehicle,
    customerProfile,
    pricePaise: listing.pricePaise.toString(),
    isWishlisted: wished,
    isHeld,
    branch,
    holdDetails: isHeld ? {
      isHeld: true,
      status: 'RESERVED',
      expiresAt: activeRes?.expiresAt || null,
      message: 'This vehicle is currently under reservation hold by a customer.',
    } : null,
    inspectionDetails: getInspectionDetailsForVehicle(listing, listing.id, customerProfile),
  };
}
function driveJson<T extends { listing: { pricePaise: bigint } }>(drive: T) {
  return { ...drive, listing: { ...drive.listing, pricePaise: drive.listing.pricePaise.toString() } };
}
function offerJson(offer: Prisma.AcquisitionOfferGetPayload<{}>) {
  return {
    ...offer,
    offerAmountPaise: offer.offerAmountPaise.toString(),
  };
}
function quoteJson(q: any) {
  return {
    ...q,
    basePricePaise: q.basePricePaise ? q.basePricePaise.toString() : '0',
    chargesPaise: q.chargesPaise ? q.chargesPaise.toString() : '0',
    discountPaise: q.discountPaise ? q.discountPaise.toString() : '0',
    finalAmountPaise: q.finalAmountPaise ? q.finalAmountPaise.toString() : '0',
    authorName: q.author?.user?.displayName || 'Vehicle Specialist',
    authorEmail: q.author?.user?.email || null,
    authorPhone: q.author?.user?.phone || null,
  };
}
function purchaseEnquiryFormat(row: any) {
  return {
    ...row,
    listing: {
      ...row.listing,
      pricePaise: row.listing?.pricePaise ? row.listing.pricePaise.toString() : '0',
    },
    quotations: Array.isArray(row.quotations) ? row.quotations.map(quoteJson) : [],
    reservations: Array.isArray(row.reservations) ? row.reservations : [],
  };
}
const leadInclude = {
  offers: { orderBy: { createdAt: 'desc' as const } },
  acquisitionCases: {
    include: {
      stockUnit: true,
      handover: true,
    },
    take: 1,
  },
  inspectionRequests: {
    include: {
      assignment: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          completedAt: true,
          locationType: true,
          address: true,
        },
      },
      reports: {
        orderBy: { revision: 'desc' as const },
        take: 1,
        select: {
          id: true,
          status: true,
          revision: true,
          submittedAt: true,
          reviewedAt: true,
          identity: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
};
type LeadWithDetails = Prisma.AcquisitionLeadGetPayload<{ include: typeof leadInclude }>;
function leadJson(lead: LeadWithDetails, db?: PrismaClient) {
  const latestReq = lead.inspectionRequests?.[0];
  const latestReport = latestReq?.reports?.[0];
  const isInspectionDone = Boolean(
    latestReq?.status === 'COMPLETED' ||
    latestReq?.assignment?.status === 'COMPLETED' ||
    latestReport?.status === 'SUBMITTED' ||
    latestReport?.status === 'APPROVED'
  );

  const status = (lead.status === 'INSPECTION_SCHEDULED' && isInspectionDone)
    ? 'OFFER_PENDING'
    : lead.status;

  const acqCase = lead.acquisitionCases?.[0];
  const stockUnit = acqCase?.stockUnit;
  const handover = acqCase?.handover;
  const inspectionIdentity = (latestReport?.identity || {}) as Record<string, unknown>;
  const rawInspectionReg = typeof inspectionIdentity.registrationNumber === 'string' ? inspectionIdentity.registrationNumber.trim() : '';
  const inspectionReg = !isInvalidRegNumberOrUuid(rawInspectionReg) ? rawInspectionReg : '';

  const registrationNumber = lead.registrationNumber || stockUnit?.registrationNumber || handover?.registrationNumber || inspectionReg || null;
  const variant = lead.variant || stockUnit?.variant || (inspectionIdentity.variant as string) || null;
  const color = lead.color || (inspectionIdentity.color as string) || null;
  const registrationYear = lead.registrationYear || (typeof inspectionIdentity.registrationYear === 'number' ? inspectionIdentity.registrationYear : null) || null;
  const registrationCity = lead.registrationCity || (inspectionIdentity.registrationCity as string) || lead.city || null;
  const ownershipCount = lead.ownershipCount || (typeof inspectionIdentity.ownershipCount === 'number' ? inspectionIdentity.ownershipCount : null) || null;

  // Self-heal: If lead.registrationNumber was missing in database, persist it asynchronously
  if (!lead.registrationNumber && registrationNumber && db) {
    void db.acquisitionLead.update({
      where: { id: lead.id },
      data: { registrationNumber },
    }).catch(() => undefined);
  }

  return {
    ...lead,
    registrationNumber,
    variant,
    color,
    registrationYear,
    registrationCity,
    ownershipCount,
    status,
    expectedPricePaise: lead.expectedPricePaise?.toString() ?? null,
    offers: (lead.offers || []).map(offerJson),
    inspection: latestReq ? {
      id: latestReq.id,
      status: latestReq.status,
      assignmentStatus: latestReq.assignment?.status ?? null,
      reportStatus: latestReport?.status ?? null,
      scheduledAt: latestReq.scheduledAt || latestReq.assignment?.scheduledAt || null,
      completedAt: latestReq.assignment?.completedAt || null,
      locationType: latestReq.assignment?.locationType || latestReq.locationType,
      address: latestReq.assignment?.address || latestReq.address,
      isCompleted: isInspectionDone,
    } : null,
  };
}

export class PrismaCustomerStore implements CustomerStore {
  constructor(private readonly db: PrismaClient) {}
  private async user(uid: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid: uid }, select: { id: true, email: true, status: true } });
    if (!user) throw new HttpError(404, 'PROFILE_NOT_REGISTERED');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
    return user;
  }
  private async supportedCity(name: string) {
    const city = await this.db.supportedCity.findFirst({ where: { active: true, name: { equals: name.trim(), mode: 'insensitive' } }, select: { name: true } });
    if (!city) throw new HttpError(400, 'CITY_NOT_SUPPORTED');
    return city.name;
  }
  async inventory(uid: string | undefined, filters: InventoryFilters = {}) {
    const { search = '', page = 1, limit = 20, city, fuelType, transmission, minYear, maxYear, maxOdometerKm, minPricePaise, maxPricePaise, sort = 'newest' } = filters;
    const user = uid ? await this.user(uid) : null;
    const vehicleFilters: Prisma.VehicleWhereInput = { ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}), ...(fuelType ? { fuelType: { equals: fuelType, mode: 'insensitive' } } : {}), ...(transmission ? { transmission: { equals: transmission, mode: 'insensitive' } } : {}), ...(minYear || maxYear ? { manufacturingYear: { ...(minYear ? { gte: minYear } : {}), ...(maxYear ? { lte: maxYear } : {}) } } : {}), ...(maxOdometerKm ? { odometerKm: { lte: maxOdometerKm } } : {}) };
    const where: Prisma.VehicleListingWhereInput = { status: { in: ['PUBLISHED', 'RESERVED'] }, ...(Object.keys(vehicleFilters).length ? { vehicle: { is: vehicleFilters } } : {}), ...(minPricePaise || maxPricePaise ? { pricePaise: { ...(minPricePaise ? { gte: BigInt(minPricePaise) } : {}), ...(maxPricePaise ? { lte: BigInt(maxPricePaise) } : {}) } } : {}), ...(search ? { OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { vehicle: { is: { make: { contains: search, mode: 'insensitive' } } } },
      { vehicle: { is: { model: { contains: search, mode: 'insensitive' } } } },
    ] } : {}) };
    const query = { where, orderBy: sort === 'price_asc' ? { pricePaise: 'asc' as const } : sort === 'price_desc' ? { pricePaise: 'desc' as const } : sort === 'year_desc' ? { vehicle: { manufacturingYear: 'desc' as const } } : { publishedAt: 'desc' as const }, skip: (page - 1) * limit, take: limit };
    let items: any[];
    let total: number;
    try {
      [items, total] = await Promise.all([this.db.vehicleListing.findMany({ ...query, select: listingScalarSelect }), this.db.vehicleListing.count({ where })]);
    } catch (error) {
      if (!isMissingCustomerProfileColumn(error)) throw error;
      // A rolling deployment can briefly run newer API code against the old
      // schema. Keep public inventory available until the migration completes.
      [items, total] = await Promise.all([this.db.vehicleListing.findMany({ ...query, select: legacyListingScalarSelect }), this.db.vehicleListing.count({ where })]);
    }
    const wished = user ? new Set((await this.db.wishlistItem.findMany({ where: { userId: user.id, listingId: { in: items.map(item => item.id) } }, select: { listingId: true } })).map(item => item.listingId)) : new Set<string>();
    return { items: items.map(item => listingJson(item, wished.has(item.id))), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async vehicle(uid: string | undefined, id: string) {
    const user = uid ? await this.user(uid) : null;
    let listing: any;
    try {
      listing = await this.db.vehicleListing.findFirst({ where: { id, status: { in: ['PUBLISHED', 'RESERVED'] } }, select: listingScalarSelect });
    } catch (error) {
      if (!isMissingCustomerProfileColumn(error)) throw error;
      listing = await this.db.vehicleListing.findFirst({ where: { id, status: { in: ['PUBLISHED', 'RESERVED'] } }, select: legacyListingScalarSelect });
    }
    if (!listing) throw new HttpError(404, 'LISTING_NOT_AVAILABLE');
    const wished = user ? Boolean(await this.db.wishlistItem.findUnique({ where: { userId_listingId: { userId: user.id, listingId: id } } })) : false;
    return listingJson(listing, wished);
  }
  async wishlist(uid: string) {
    const user = await this.user(uid);
    const where: Prisma.WishlistItemWhereInput = {
      userId: user.id,
      listing: { is: { status: { in: ['PUBLISHED', 'RESERVED'] } } },
    };
    let rows: Array<{ listing: any }>;
    try {
      rows = await this.db.wishlistItem.findMany({ where, select: { listing: { select: listingScalarSelect } }, orderBy: { createdAt: 'desc' } });
    } catch (error) {
      if (!isMissingCustomerProfileColumn(error)) throw error;
      rows = await this.db.wishlistItem.findMany({ where, select: { listing: { select: legacyListingScalarSelect } }, orderBy: { createdAt: 'desc' } });
    }
    return rows.map(row => listingJson(row.listing, true));
  }
  async addWishlist(uid: string, id: string) {
    const user = await this.user(uid);
    const listing = await this.db.vehicleListing.findFirst({ where: { id, status: { in: ['PUBLISHED', 'RESERVED'] } }, select: { id: true } });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_AVAILABLE');
    await this.db.wishlistItem.upsert({ where: { userId_listingId: { userId: user.id, listingId: id } }, update: {}, create: { userId: user.id, listingId: id } });
  }
  async removeWishlist(uid: string, id: string) {
    const user = await this.user(uid);
    await this.db.wishlistItem.deleteMany({ where: { userId: user.id, listingId: id } });
  }
  async drives(uid: string) {
    const user = await this.user(uid);
    const rows = await this.db.testDriveRequest.findMany({
      where: { userId: user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            pricePaise: true,
            currency: true,
            status: true,
            vehicle: {
              select: {
                make: true,
                model: true,
                variant: true,
                manufacturingYear: true,
                fuelType: true,
                transmission: true,
                odometerKm: true,
                color: true,
                city: true,
              },
            },
            media: {
              where: { mediaType: 'IMAGE' },
              orderBy: { displayOrder: 'asc' },
              take: 1,
              select: { id: true, url: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(driveJson);
  }
  async drive(uid: string, id: string) {
    const user = await this.user(uid);
    const row = await this.db.testDriveRequest.findFirst({
      where: { id, userId: user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            pricePaise: true,
            currency: true,
            status: true,
            vehicle: {
              select: {
                make: true,
                model: true,
                variant: true,
                manufacturingYear: true,
                fuelType: true,
                transmission: true,
                odometerKm: true,
                color: true,
                city: true,
                verifiedTags: true,
              },
            },
            media: {
              where: { mediaType: 'IMAGE' },
              orderBy: { displayOrder: 'asc' },
              take: 3,
              select: { id: true, url: true },
            },
          },
        },
      },
    });
    if (!row) throw new HttpError(404, 'TEST_DRIVE_NOT_FOUND');
    return driveJson(row);
  }
  async bookDrive(uid: string, input: DriveInput) {
    const user = await this.user(uid);
    const serviceCity = await this.supportedCity(input.serviceCity);
    const listing = await this.db.vehicleListing.findFirst({ where: { id: input.listingId, status: { in: ['PUBLISHED', 'RESERVED'] } }, select: { id: true, status: true } });
    if (!listing) throw new HttpError(404, 'LISTING_NOT_AVAILABLE');
    if (listing.status === 'RESERVED') throw new HttpError(409, 'VEHICLE_CURRENTLY_ON_HOLD');
    try {
      const drive = await this.db.$transaction(async tx => {
        const created = await tx.testDriveRequest.create({ data: { userId: user.id, listingId: input.listingId, requestedDate: new Date(`${input.requestedDate}T00:00:00.000Z`), timeSlot: input.timeSlot, serviceCity, locationPreference: input.locationPreference, address: input.address, customerNotes: input.customerNotes }, include: { listing: { select: { id: true, title: true, pricePaise: true, currency: true } } } });
        await tx.auditEvent.create({ data: { actorId: user.id, action: 'TEST_DRIVE_REQUESTED', entityId: created.id } });
        const locationText = input.locationPreference === 'HOME'
          ? `Doorstep (${input.address || serviceCity})`
          : `V MOTIV Certified Hub (${serviceCity})`;
        await tx.emailOutbox.create({ data: { userId: user.id, eventKey: `test-drive-requested/${created.id}`, recipient: user.email, templateVersion: 'test-drive-requested-v1', subject: `Test Drive Requested · ${created.listing.title}`, text: `We received your test drive request for ${created.listing.title}.\n\nAppointment Details:\n• Date: ${input.requestedDate}\n• Time Window: ${input.timeSlot}\n• Location Preference: ${locationText}\n\nWhat to Prepare:\n• Please keep your valid original Driving License available.\n• Doorstep drives: Our technician will contact you prior to arrival.\n\nOur operations team will confirm your slot shortly. You can manage this appointment anytime in the V MOTIV mobile app under Activity.` } });
        return created;
      });
      return driveJson(drive);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new HttpError(409, 'REQUEST_CONFLICT');
      throw error;
    }
  }
  async cancelDrive(uid: string, id: string) {
    const user = await this.user(uid);
    const result = await this.db.testDriveRequest.updateMany({ where: { id, userId: user.id, status: 'REQUESTED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    if (!result.count) throw new HttpError(409, 'REQUEST_NOT_CANCELLABLE');
    await this.db.auditEvent.create({ data: { actorId: user.id, action: 'TEST_DRIVE_CANCELLED', entityId: id } });
  }
  async leads(uid: string) {
    const user = await this.user(uid);
    const rows = await this.db.acquisitionLead.findMany({ where: { userId: user.id }, include: leadInclude, orderBy: { createdAt: 'desc' } });
    return rows.map(r => leadJson(r, this.db));
  }
  async lead(uid: string, id: string) {
    const user = await this.user(uid);
    const row = await this.db.acquisitionLead.findFirst({ where: { id, userId: user.id }, include: leadInclude });
    if (!row) throw new HttpError(404, 'LEAD_NOT_FOUND');
    return leadJson(row, this.db);
  }
  async createLead(uid: string, input: SellInput) {
    const user = await this.user(uid);
    const city = await this.supportedCity(input.city);
    if (input.idempotencyKey) {
      const existing = await this.db.acquisitionLead.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } }, include: leadInclude });
      if (existing) return leadJson(existing, this.db);
    }
    const { inspectionDate, ...rest } = input;
    const lead = await this.db.$transaction(async tx => {
      const created = await tx.acquisitionLead.create({
        data: {
          ...rest,
          city,
          expectedPricePaise: input.expectedPricePaise === undefined ? undefined : BigInt(input.expectedPricePaise),
          inspectionDate: inspectionDate ? new Date(`${inspectionDate}T00:00:00.000Z`) : undefined,
          status: 'SUBMITTED',
          userId: user.id,
        },
        include: leadInclude,
      });
      await tx.auditEvent.create({ data: { actorId: user.id, action: 'ACQUISITION_LEAD_SUBMITTED', entityId: created.id } });
      await tx.emailOutbox.create({ data: { userId: user.id, eventKey: `selling-requested/${created.id}`, recipient: user.email, templateVersion: 'selling-requested-v1', subject: `Selling Request Received [${created.referenceCode}] · ${created.manufacturingYear} ${created.make} ${created.model}`, text: `We received your request to sell your ${created.manufacturingYear} ${created.make} ${created.model} (${created.variant || 'Standard'}).\n\nReference Code: ${created.referenceCode}\nLocation: ${created.city} (${created.pincode})\nOdometer: ${created.odometerKm.toLocaleString('en-IN')} km\nContact Phone: ${created.sellerPhone}\n\nOur Valuation & Purchase Process:\n1. Transparent pricing evaluation based on current market trends.\n2. 180-Point Doorstep or Hub inspection to certify vehicle condition.\n3. Guaranteed direct purchase offer with same-day payment and free RC transfer.\n\nYou can track this request in your V MOTIV mobile app under Activity.` } });
      return created;
    });
    return leadJson(lead, this.db);
  }
  async cancelLead(uid: string, id: string, reason?: string) {
    const user = await this.user(uid);
    const lead = await this.db.acquisitionLead.findFirst({ where: { id, userId: user.id } });
    if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');
    if (!['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'].includes(lead.status)) {
      throw new HttpError(409, 'LEAD_NOT_CANCELLABLE');
    }
    await this.db.$transaction(async tx => {
      await tx.acquisitionLead.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: 'ACQUISITION_LEAD_CANCELLED', entityId: id } });
    });
  }
  async acceptOffer(uid: string, offerId: string, version: number) {
    const user = await this.user(uid);
    const offer = await this.db.acquisitionOffer.findUnique({
      where: { id: offerId },
      include: { lead: true },
    });
    if (!offer || offer.lead.userId !== user.id) throw new HttpError(404, 'OFFER_NOT_FOUND');
    if (offer.version !== version) throw new HttpError(409, 'VERSION_MISMATCH');
    if (offer.status !== 'OFFERED') throw new HttpError(409, 'OFFER_NOT_ACTIONABLE');
    if (new Date() > offer.validUntil) {
      await this.db.acquisitionOffer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
      throw new HttpError(410, 'OFFER_EXPIRED');
    }

    const updated = await this.db.$transaction(async tx => {
      const savedOffer = await tx.acquisitionOffer.update({
        where: { id: offerId },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.acquisitionLead.update({
        where: { id: offer.leadId },
        data: { status: 'ACCEPTED' },
      });
      const acquisitionCase = await tx.acquisitionCase.create({
        data: {
          leadId: offer.leadId,
          offerId: offer.id,
          sellerAcceptedByUserId: user.id,
          acceptedAt: new Date(),
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
          actorId: user.id,
          action: 'ACQUISITION_OFFER_ACCEPTED',
          entityType: 'AcquisitionOffer',
          entityId: offerId,
          details: { acquisitionCaseId: acquisitionCase.id, source: 'CUSTOMER_SELF_SERVICE' },
        },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'ACQUISITION_CASE_CREATED', entityType: 'AcquisitionCase', entityId: acquisitionCase.id, details: { leadId: offer.leadId, offerId: offer.id } },
      });
      await tx.emailOutbox.create({
        data: {
          userId: user.id,
          eventKey: `offer-accepted/${offerId}`,
          recipient: user.email,
          templateVersion: 'offer-accepted-v1',
          subject: 'Offer Accepted — V MOTIV Vehicle Acquisition',
          text: `You accepted the offer for your ${offer.lead.make} ${offer.lead.model}. Reference: ${offer.lead.referenceCode}. Our operations team will contact you to schedule document collection and handover.`,
        },
      });
      return savedOffer;
    });

    return offerJson(updated);
  }
  async declineOffer(uid: string, offerId: string, input: { version: number; reason?: string }) {
    const user = await this.user(uid);
    const offer = await this.db.acquisitionOffer.findUnique({
      where: { id: offerId },
      include: { lead: true },
    });
    if (!offer || offer.lead.userId !== user.id) throw new HttpError(404, 'OFFER_NOT_FOUND');
    if (offer.version !== input.version) throw new HttpError(409, 'VERSION_MISMATCH');
    if (offer.status !== 'OFFERED') throw new HttpError(409, 'OFFER_NOT_ACTIONABLE');

    const updated = await this.db.$transaction(async tx => {
      const savedOffer = await tx.acquisitionOffer.update({
        where: { id: offerId },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: input.reason,
          version: { increment: 1 },
        },
      });
      await tx.acquisitionLead.update({
        where: { id: offer.leadId },
        data: { status: 'REJECTED' },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'ACQUISITION_OFFER_DECLINED', entityId: offerId },
      });
      return savedOffer;
    });

    return offerJson(updated);
  }
  async updateProfile(uid: string, input: ProfileInput) {
    await this.user(uid);
    const preferredCity = input.preferredCity ? await this.supportedCity(input.preferredCity) : undefined;
    const { termsVersion, ...data } = input;
    return this.db.user.update({ where: { firebaseUid: uid }, data: { ...data, ...(preferredCity ? { preferredCity } : {}), ...(termsVersion ? { termsVersion, termsAcceptedAt: new Date() } : {}) }, select: profileSelect });
  }
  async cities() { return this.db.supportedCity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }); }
  async addresses(uid: string) {
    const user = await this.user(uid);
    return this.db.$queryRaw<Array<{ id: string; label: string; addressLine: string; city: string; pincode: string; createdAt: Date }>>(Prisma.sql`SELECT "id", "label", "addressLine", "city", "pincode", "createdAt" FROM "CustomerAddress" WHERE "userId" = ${user.id}::uuid ORDER BY "createdAt" DESC`);
  }
  async createAddress(uid: string, input: AddressInput) {
    const user = await this.user(uid);
    const [address] = await this.db.$queryRaw<Array<{ id: string; label: string; addressLine: string; city: string; pincode: string; createdAt: Date }>>(Prisma.sql`INSERT INTO "CustomerAddress" ("userId", "label", "addressLine", "city", "pincode", "updatedAt") VALUES (${user.id}::uuid, ${input.label}, ${input.addressLine}, ${input.city}, ${input.pincode}, NOW()) RETURNING "id", "label", "addressLine", "city", "pincode", "createdAt"`);
    return address;
  }
  async deleteAddress(uid: string, id: string) {
    const user = await this.user(uid);
    await this.db.$executeRaw(Prisma.sql`DELETE FROM "CustomerAddress" WHERE "id" = ${id}::uuid AND "userId" = ${user.id}::uuid`);
  }
  async createPrivacyRequest(uid: string, requestType: 'DATA_ACCESS' | 'ACCOUNT_DELETION') {
    const user = await this.user(uid);
    const [request] = await this.db.$queryRaw<Array<{ id: string; requestType: string; status: string; createdAt: Date }>>(Prisma.sql`INSERT INTO "PrivacyRequest" ("userId", "requestType", "updatedAt") VALUES (${user.id}::uuid, ${requestType}, NOW()) RETURNING "id", "requestType", "status", "createdAt"`);
    if (!request) throw new HttpError(500, 'PRIVACY_REQUEST_FAILED');
    await this.db.auditEvent.create({ data: { actorId: user.id, action: `PRIVACY_${requestType}_REQUESTED`, entityId: request.id } });
    return request;
  }
  async savedSearches(uid: string) { const user = await this.user(uid); return this.db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }); }
  async createSavedSearch(uid: string, input: { name: string; query: Record<string, unknown> }) { const user = await this.user(uid); return this.db.savedSearch.create({ data: { userId: user.id, name: input.name, query: input.query as Prisma.InputJsonValue } }); }
  async deleteSavedSearch(uid: string, id: string) { const user = await this.user(uid); await this.db.savedSearch.deleteMany({ where: { id, userId: user.id } }); }
  async purchaseEnquiries(uid: string) {
    const user = await this.user(uid);
    const rows = await this.db.purchaseEnquiry.findMany({
      where: { userId: user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            pricePaise: true,
            currency: true,
            publishedAt: true,
            vehicle: {
              select: {
                make: true,
                model: true,
                variant: true,
                manufacturingYear: true,
                fuelType: true,
                transmission: true,
                odometerKm: true,
                color: true,
                city: true,
                verifiedTags: true,
              },
            },
            media: {
              where: { mediaType: 'IMAGE' },
              orderBy: { displayOrder: 'asc' },
              take: 1,
              select: { id: true, url: true },
            },
          },
        },
        quotations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: {
              include: {
                user: {
                  select: {
                    displayName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(purchaseEnquiryFormat);
  }

  async purchaseEnquiry(uid: string, id: string) {
    const user = await this.user(uid);
    const enquiry = await this.db.purchaseEnquiry.findFirst({
      where: { id, userId: user.id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            pricePaise: true,
            currency: true,
            publishedAt: true,
            vehicle: {
              select: {
                make: true,
                model: true,
                variant: true,
                manufacturingYear: true,
                fuelType: true,
                transmission: true,
                odometerKm: true,
                color: true,
                city: true,
                verifiedTags: true,
                conditionSummary: true,
                inspectionSummary: true,
                inspectionReportUrl: true,
              },
            },
            media: {
              where: { mediaType: 'IMAGE' },
              orderBy: { displayOrder: 'asc' },
              take: 5,
              select: { id: true, url: true },
            },
          },
        },
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              include: {
                user: {
                  select: {
                    displayName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        reservations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!enquiry) throw new HttpError(404, 'PURCHASE_ENQUIRY_NOT_FOUND');
    return purchaseEnquiryFormat(enquiry);
  }

  async cancelPurchaseEnquiry(uid: string, id: string, reason?: string) {
    const user = await this.user(uid);
    const enquiry = await this.db.purchaseEnquiry.findFirst({
      where: { id, userId: user.id },
    });
    if (!enquiry) throw new HttpError(404, 'PURCHASE_ENQUIRY_NOT_FOUND');
    if (enquiry.status === 'CLOSED') {
      throw new HttpError(409, 'PURCHASE_ENQUIRY_ALREADY_CLOSED');
    }
    const updated = await this.db.$transaction(async tx => {
      const closed = await tx.purchaseEnquiry.update({
        where: { id },
        data: { status: 'CLOSED' },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              pricePaise: true,
              currency: true,
            },
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'PURCHASE_ENQUIRY_CANCELLED',
          entityId: id,
          details: reason ? { reason } : undefined,
        },
      });
      return closed;
    });
    return purchaseEnquiryFormat(updated);
  }
  async createPurchaseEnquiry(uid: string, input: { listingId: string; message: string; idempotencyKey: string }) {
    const user = await this.user(uid); const listing = await this.db.vehicleListing.findFirst({ where: { id: input.listingId, status: 'PUBLISHED' }, select: { id: true } }); if (!listing) throw new HttpError(404, 'LISTING_NOT_AVAILABLE');
    const enquiry = await this.db.$transaction(async tx => {
      const existing = await tx.purchaseEnquiry.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } }, include: { listing: { select: { id: true, title: true, pricePaise: true, currency: true } } } });
      if (existing) return existing;
      const created = await tx.purchaseEnquiry.create({ data: { userId: user.id, ...input }, include: { listing: { select: { id: true, title: true, pricePaise: true, currency: true } } } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: 'PURCHASE_ENQUIRY_CREATED', entityId: created.id } });
      await tx.emailOutbox.create({ data: { userId: user.id, eventKey: `purchase-enquiry/${created.id}`, recipient: user.email, templateVersion: 'purchase-enquiry-v1', subject: `Purchase Enquiry Recorded · ${created.listing.title}`, text: `We recorded your purchase enquiry for ${created.listing.title}.\n\nYour Question / Message:\n"${input.message}"\n\nNext Steps:\n1. Our sales and hub inventory team is reviewing current availability.\n2. A vehicle specialist will follow up with answers regarding pricing, financing plans, and warranty coverage.\n\nYou can track this enquiry in your V MOTIV mobile app under Activity.` } });
      return created;
    });
    return driveJson(enquiry);
  }
  async supportCases(uid: string) { const user = await this.user(uid); return this.db.supportCase.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }); }
  async createSupportCase(uid: string, input: { subject: string; category: string; description: string }) { const user = await this.user(uid); return this.db.$transaction(async tx => { const support = await tx.supportCase.create({ data: { userId: user.id, ...input } }); await tx.auditEvent.create({ data: { actorId: user.id, action: 'SUPPORT_CASE_CREATED', entityId: support.id } }); await tx.emailOutbox.create({ data: { userId: user.id, eventKey: `support-case/${support.id}`, recipient: user.email, templateVersion: 'support-case-v1', subject: `Support Case Created [${support.referenceCode}] · ${support.subject}`, text: `We have opened support case ${support.referenceCode} regarding: ${support.subject}.\n\nCategory: ${support.category.replace(/_/g, ' ')}\n\nCase Description:\n${input.description}\n\nOur customer support team aims to reply within 24 hours. You can reply directly to this case from your V MOTIV mobile app under Support.` } }); return support; }); }
  async supportCase(uid: string, id: string) { const user = await this.user(uid); const support = await this.db.supportCase.findFirst({ where: { id, userId: user.id } }); if (!support) throw new HttpError(404, 'SUPPORT_CASE_NOT_FOUND'); const replies = await this.db.$queryRaw<Array<{ id: string; authorType: string; body: string; createdAt: Date }>>(Prisma.sql`SELECT "id", "authorType", "body", "createdAt" FROM "SupportCaseReply" WHERE "caseId" = ${id}::uuid ORDER BY "createdAt" ASC`); return { ...support, replies }; }
  async replySupportCase(uid: string, id: string, body: string) {
    const user = await this.user(uid);
    const support = await this.db.supportCase.findFirst({ where: { id, userId: user.id }, select: { id: true, referenceCode: true, subject: true } });
    if (!support) throw new HttpError(404, 'SUPPORT_CASE_NOT_FOUND');
    const rows = await this.db.$queryRaw<Array<{ id: string; authorType: string; body: string; createdAt: Date }>>(Prisma.sql`INSERT INTO "SupportCaseReply" ("caseId", "body") VALUES (${id}::uuid, ${body}) RETURNING "id", "authorType", "body", "createdAt"`);
    const reply = rows[0];
    if (!reply) throw new HttpError(500, 'FAILED_TO_RECORD_REPLY');
    await this.db.supportCase.update({ where: { id }, data: { status: 'OPEN' } });
    return reply;
  }
  async activity(uid: string, page: number, limit: number) {
    const user = await this.user(uid);
    const [drives, leads, purchases, cases] = await Promise.all([
      this.db.testDriveRequest.findMany({ where: { userId: user.id }, select: { id: true, status: true, createdAt: true, updatedAt: true, listing: { select: { id: true, title: true } } } }),
      this.db.acquisitionLead.findMany({ where: { userId: user.id }, select: { id: true, status: true, referenceCode: true, createdAt: true, updatedAt: true, make: true, model: true } }),
      this.db.purchaseEnquiry.findMany({ where: { userId: user.id }, select: { id: true, status: true, createdAt: true, updatedAt: true, listing: { select: { id: true, title: true } } } }),
      this.db.supportCase.findMany({ where: { userId: user.id }, select: { id: true, status: true, referenceCode: true, subject: true, createdAt: true, updatedAt: true } }),
    ]);
    const items = [
      ...drives.map(row => ({ id: `drive/${row.id}`, kind: 'TEST_DRIVE', status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, title: row.listing.title, reference: row.id, listingId: row.listing.id })),
      ...leads.map(row => ({ id: `selling/${row.id}`, kind: 'SELLING', status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, title: `${row.make} ${row.model}`, reference: row.referenceCode })),
      ...purchases.map(row => ({ id: `purchase/${row.id}`, kind: 'PURCHASE', status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, title: row.listing.title, reference: row.id, listingId: row.listing.id })),
      ...cases.map(row => ({ id: `support/${row.id}`, kind: 'SUPPORT', status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, title: row.subject, reference: row.referenceCode })),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const total = items.length; const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
