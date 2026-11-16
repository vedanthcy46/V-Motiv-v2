// Vehicle scrapping: the customer's requests and the staff's lead handling (Phase 2).
//
// Every status change goes through `applyTransition`, which loads the case's records, works out the facts, and asks the state machine. A
// caller can only ask for a move; it never sets a status. Writes carry the case's `version`, so two people editing at once cannot both win.
//
// Not here yet (later phases): assessments, partner quotations, offers being created, pickups, custody, certificates, payments. The state
// machine already refuses the moves that need them, so those moves are simply unavailable until their phase exists.

import crypto from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpError } from '../errors.js';
import {
  QUESTIONNAIRE_VERSION,
  deriveBlockingFlags,
  normalizeRegistration,
  questionnaireDefinition,
  validateAnswers,
  validateOwnership,
  validatePickupAddress,
  validateVehicle,
  vehicleIsElectric,
  visibleQuestions,
  type Answers,
  type FieldError,
  type OwnershipInput,
  type PickupAddressInput,
  type VehicleInput,
} from './scrap-questionnaire.js';
import { PRICING_POLICY_KEY, computeIndicativeEstimate, parsePricingPolicy } from './scrap-valuation.js';
import { CUSTOMER_STATUS_TEXT, EVENT_KINDS, factsFromRecords, type ScrapCaseRecords } from './scrap-facts.js';
import {
  SCRAP_PERMISSIONS as P,
  availableTransitions,
  evaluateTransition,
  isLiveRequestStatus,
  type ScrapActor,
  type ScrapStatus,
} from './scrap-workflow.js';

type Db = PrismaClient | Prisma.TransactionClient;
type Any = any;

/** The problems with an input, field by field. The router sends them to the client as `fields`. */
export class ScrapValidationError extends HttpError {
  constructor(public fields: FieldError[]) {
    super(400, 'INVALID_INPUT', fields[0]?.message ?? 'Some details need fixing.');
  }
}

export interface StaffContext {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

const MAX_DRAFTS = 5;
const MAX_OPEN_DISPUTES = 5;
const MAX_PAGE = 50;
export const DISPUTE_CATEGORIES = ['OFFER_DISCREPANCY', 'VIN_MISMATCH', 'VEHICLE_CONDITION_MISMATCH', 'WRONG_BENEFICIARY', 'CERTIFICATE_MISMATCH', 'PICKUP_DAMAGE', 'OTHER'] as const;
/** Staff-settable concerns that stop a case before assessment. Customer-declared ones are derived (see deriveBlockingFlags). */
export const STAFF_BLOCKING_FLAGS = ['STOLEN_VEHICLE_CONCERN', 'LEGAL_RESTRICTION', 'IDENTITY_MISMATCH', 'DOCUMENTS_INCONSISTENT'] as const;
const TERMINAL: ScrapStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const NOT_LIVE: ScrapStatus[] = ['DRAFT', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const SALES_VISIBLE: ScrapStatus[] = ['SUBMITTED', 'SALES_REVIEW', 'DOCUMENTS_REQUIRED', 'ASSESSMENT_PENDING'];
const REQUEST_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const asMoney = (value: bigint | null | undefined) => (value === null || value === undefined ? null : value.toString());

function newRequestNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  let suffix = '';
  for (let index = 0; index < 6; index += 1) suffix += REQUEST_NUMBER_ALPHABET[crypto.randomInt(REQUEST_NUMBER_ALPHABET.length)];
  return `SCR-${date}-${suffix}`;
}

/** What a draft holds while the customer is still answering. */
export interface DraftData {
  vehicle?: VehicleInput;
  answers?: Answers;
  ownership?: OwnershipInput;
  pickupAddress?: PickupAddressInput;
  questionnaireVersion?: number;
}

type Clearable<T> = { [K in keyof T]?: T[K] | null };

export interface DraftPatch {
  /** In every part of a patch, a field set to null is cleared. */
  vehicle?: Clearable<VehicleInput>;
  answers?: Answers;
  ownership?: Clearable<OwnershipInput>;
  pickupAddress?: Clearable<PickupAddressInput>;
}

/** Applies a patch to one part of a draft: new values replace old ones, and a value of null removes the field. */
function patchPart<T extends object>(current: T | undefined, patch: Clearable<T> | undefined): T {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as T;
}

function mergeDraft(current: DraftData, patch: DraftPatch): DraftData {
  return {
    vehicle: patchPart(current.vehicle, patch.vehicle),
    answers: patchPart(current.answers, patch.answers as Clearable<Answers>) as Answers,
    ownership: patchPart(current.ownership, patch.ownership),
    pickupAddress: patchPart(current.pickupAddress, patch.pickupAddress),
    questionnaireVersion: QUESTIONNAIRE_VERSION,
  };
}

/** Problems with a draft. A draft only has to be valid as far as it goes; a submission has to be complete. */
function draftProblems(draft: DraftData, complete: boolean): { errors: FieldError[]; cleaned: Answers } {
  const vehicle = draft.vehicle ?? {};
  const { cleaned, errors: answerErrors } = validateAnswers(draft.answers ?? {}, vehicle, { complete });
  const errors = [
    ...validateVehicle(vehicle, { complete }),
    ...answerErrors,
    ...validatePickupAddress(complete || Object.keys(draft.pickupAddress ?? {}).length ? draft.pickupAddress : undefined, { complete }),
    ...validateOwnership(complete || Object.keys(draft.ownership ?? {}).length ? draft.ownership : undefined, { complete }),
  ];
  return { errors, cleaned };
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

export class PrismaScrapStore {
  constructor(private readonly db: PrismaClient) {}

  private schemaReadyAt = 0;

  /**
   * The scrapping tables arrive with a database migration, and the host does not run migrations. Until it has been applied, say so plainly
   * instead of failing with a database error on every request. A positive answer is remembered; a negative one is rechecked every 30 s.
   */
  async assertSchemaReady(): Promise<void> {
    if (this.schemaReadyAt > 0) return;
    const rows = (await this.db.$queryRaw`SELECT to_regclass('"ScrapRequest"') IS NOT NULL AS ready`) as Array<{ ready: boolean }>;
    if (rows[0]?.ready) { this.schemaReadyAt = Date.now(); return; }
    throw new HttpError(503, 'SCRAP_SCHEMA_NOT_READY', 'Vehicle scrapping is not available yet: the database update for it has not been applied.');
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------------------------------------------------------------

  private async customerId(uid: string): Promise<string> {
    const user = await this.db.user.findFirst({ where: { firebaseUid: uid, status: 'ACTIVE' }, select: { id: true } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND');
    return user.id;
  }

  private async ownedRequest(uid: string, requestId: string) {
    if (!isUuid(requestId)) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    const customerId = await this.customerId(uid);
    // Someone else's request is reported as "not found", never as "forbidden": its existence is not revealed.
    const request = await this.db.scrapRequest.findFirst({ where: { id: requestId, customerId } });
    if (!request) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    return { request, customerId };
  }

  private async pricingPolicy(db: Db) {
    const row = await db.scrapPolicy.findUnique({ where: { key: PRICING_POLICY_KEY } });
    return parsePricingPolicy(row?.value ?? null);
  }

  /** Loads everything the state machine's facts are computed from, in parallel simple queries (no nested includes, no N+1). */
  private async loadRecords(db: Db, request: Any): Promise<ScrapCaseRecords> {
    const id = request.id as string;
    const [vehicle, partner, documents, assessments, quotes, offers, pickups, custodyEvents, certificates, obligations, disputes, events] = await Promise.all([
      db.scrapVehicleSnapshot.findUnique({ where: { requestId: id }, select: { vehicleCategory: true } }),
      request.partnerId ? db.scrapPartner.findUnique({ where: { id: request.partnerId } }) : Promise.resolve(null),
      db.scrapDocument.findMany({ where: { requestId: id }, select: { status: true } }),
      db.scrapAssessment.findMany({ where: { requestId: id, status: { not: 'SUPERSEDED' } }, orderBy: { version: 'desc' }, take: 1, select: { status: true } }),
      db.scrapPartnerQuote.findMany({ where: { requestId: id }, select: { status: true, validUntil: true } }),
      db.scrapOffer.findMany({ where: { requestId: id }, orderBy: { version: 'desc' }, take: 1 }),
      db.scrapPickup.findMany({ where: { requestId: id, status: { not: 'CANCELLED' } }, orderBy: { version: 'desc' }, take: 1 }),
      db.scrapCustodyEvent.findMany({ where: { requestId: id }, select: { action: true, toCustodianType: true } }),
      db.scrapCertificate.findMany({ where: { requestId: id }, select: { type: true, verificationState: true } }),
      db.scrapPaymentObligation.findMany({ where: { requestId: id }, select: { status: true } }),
      db.scrapDispute.findMany({ where: { requestId: id }, select: { status: true, category: true } }),
      db.scrapStatusEvent.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' }, select: { evidence: true } }),
    ]);
    const offer = (offers as Any[])[0] ?? null;
    const acceptance = offer ? await db.scrapOfferAcceptance.findUnique({ where: { offerId: offer.id }, select: { decision: true } }) : null;
    return {
      request: {
        status: request.status, holdFromStatus: request.holdFromStatus ?? null, blockingFlags: request.blockingFlags ?? [], ownershipDeclaredAt: request.ownershipDeclaredAt ?? null,
        city: request.city ?? null, paymentState: request.paymentState, registrationStatus: request.registrationStatus,
      },
      vehicleCategory: (vehicle as Any)?.vehicleCategory ?? null,
      partner: partner as Any,
      documents: documents as Any,
      assessment: (assessments as Any[])[0] ?? null,
      quotes: quotes as Any,
      offer: offer && { status: offer.status, approvedAt: offer.approvedAt, sentAt: offer.sentAt, expiresAt: offer.expiresAt, decision: (acceptance as Any)?.decision ?? null },
      pickup: ((pickups as Any[])[0] as Any) ?? null,
      custodyEvents: custodyEvents as Any,
      certificates: certificates as Any,
      obligations: obligations as Any,
      disputes: disputes as Any,
      events: (events as Any[]).map(event => ({ evidenceKind: (event.evidence as Any)?.kind ?? null })),
    };
  }

  /**
   * The only way a case changes status. Loads the case, works out its facts, asks the state machine, and then writes the new status, a
   * status event and an audit record in one step. `expectedVersion` (when given) must match, and the write is conditional on the version it
   * read, so a concurrent change makes this fail rather than overwrite it.
   */
  private async applyTransition(tx: Db, input: {
    requestId: string; to: ScrapStatus; actor: ScrapActor; actorUserId: string | null; reason?: string; evidence?: Record<string, unknown>; expectedVersion?: number;
  }) {
    const request = await tx.scrapRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    if (input.expectedVersion !== undefined && request.version !== input.expectedVersion) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This request was changed by someone else. Refresh and try again.');

    const facts = factsFromRecords(await this.loadRecords(tx, request));
    const from = request.status as ScrapStatus;
    const verdict = evaluateTransition({ from, to: input.to, actor: input.actor, facts, reason: input.reason });
    if (!verdict.ok) throw new HttpError(verdict.code === 'NOT_PERMITTED' ? 403 : verdict.code === 'REASON_REQUIRED' ? 400 : 409, verdict.code, verdict.message);

    const now = new Date();
    const data: Record<string, unknown> = { status: input.to, version: { increment: 1 } };
    if (input.to === 'SUBMITTED') data.submittedAt = now;
    if (input.to === 'ON_HOLD') { data.holdFromStatus = from; data.holdReason = input.reason ?? null; }
    if (from === 'ON_HOLD') { data.holdFromStatus = null; data.holdReason = null; }
    if (input.to === 'CANCELLED') { data.cancelledAt = now; data.cancelReason = input.reason ?? null; }
    if (input.to === 'COMPLETED') data.completedAt = now;
    if (input.to === 'REGISTRATION_UPDATE_PENDING' && request.registrationStatus === 'NOT_STARTED') data.registrationStatus = 'PENDING';

    const changed = await tx.scrapRequest.updateMany({ where: { id: request.id, version: request.version }, data: data as Any });
    if (changed.count === 0) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This request was changed by someone else. Refresh and try again.');

    await tx.scrapStatusEvent.create({
      data: {
        requestId: request.id, fromStatus: from, toStatus: input.to, actorId: input.actorUserId, actorType: input.actor.kind,
        reason: input.reason ?? null, evidence: (input.evidence ?? undefined) as Any, correlationId: crypto.randomUUID(),
      },
    });
    await tx.auditEvent.create({
      data: { actorId: input.actorUserId, action: 'SCRAP_STATUS_CHANGED', entityType: 'ScrapRequest', entityId: request.id, details: { from, to: input.to, actor: input.actor.kind, reason: input.reason ?? null } },
    });
    return (await tx.scrapRequest.findUnique({ where: { id: request.id } }))!;
  }

  private statusFields(status: ScrapStatus) {
    const text = CUSTOMER_STATUS_TEXT[status];
    return { status, statusLabel: text.label, statusDescription: text.description };
  }

  private estimateSummary(estimate: Any | null) {
    if (!estimate) return null;
    return {
      status: estimate.status,
      // "Quotation required" carries no figure and no reason the customer needs to see.
      minPaise: asMoney(estimate.minPaise), maxPaise: asMoney(estimate.maxPaise), currency: estimate.currency, expiresAt: estimate.expiresAt ?? null,
      calculationVersion: estimate.calculationVersion,
    };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Customer: draft, submit
  // ---------------------------------------------------------------------------------------------------------------------------------

  getQuestionnaire() {
    return questionnaireDefinition();
  }

  /** What the customer sees for a draft: their answers so far, which questions are currently shown, and what is still missing. */
  private draftView(request: Any) {
    const draft = (request.draftData ?? {}) as DraftData;
    const vehicle = draft.vehicle ?? {};
    return {
      id: request.id, requestNumber: request.requestNumber, version: request.version, customerVehicleId: request.customerVehicleId ?? null,
      ...this.statusFields('DRAFT'),
      draft: { vehicle, answers: draft.answers ?? {}, ownership: draft.ownership ?? {}, pickupAddress: draft.pickupAddress ?? {} },
      visibleQuestions: visibleQuestions(draft.answers ?? {}, vehicle).map(question => question.key),
      missing: draftProblems(draft, true).errors,
      createdAt: request.createdAt, updatedAt: request.updatedAt,
    };
  }

  async createDraft(uid: string, input: { customerVehicleId?: string; submissionKey?: string; draft?: DraftPatch }) {
    const customerId = await this.customerId(uid);

    if (input.submissionKey) {
      const existing = await this.db.scrapRequest.findFirst({ where: { customerId, submissionKey: input.submissionKey } });
      if (existing) return { created: false, request: existing.status === 'DRAFT' ? this.draftView(existing) : { id: existing.id, requestNumber: existing.requestNumber, ...this.statusFields(existing.status as ScrapStatus), version: existing.version } };
    }
    if ((await this.db.scrapRequest.count({ where: { customerId, status: 'DRAFT' } })) >= MAX_DRAFTS) {
      throw new HttpError(409, 'TOO_MANY_DRAFTS', `You already have ${MAX_DRAFTS} unfinished requests. Finish or delete one first.`);
    }

    let garageVehicle: VehicleInput = {};
    if (input.customerVehicleId) {
      if (!isUuid(input.customerVehicleId)) throw new HttpError(404, 'GARAGE_VEHICLE_NOT_FOUND');
      const car = await this.db.customerVehicle.findFirst({ where: { id: input.customerVehicleId, userId: customerId, isArchived: false } });
      if (!car) throw new HttpError(404, 'GARAGE_VEHICLE_NOT_FOUND');
      garageVehicle = {
        ...(car.registrationNumber ? { registrationNumber: car.registrationNumber } : {}), make: car.make, model: car.model, ...(car.variant ? { variant: car.variant } : {}),
        manufacturingYear: car.year, fuelType: (car.fuelType ?? '').toUpperCase(), ...(car.odometerKm !== null && car.odometerKm !== undefined ? { odometerKm: car.odometerKm } : {}),
        ...(car.vin ? { vin: car.vin } : {}),
      };
    }
    const draft = mergeDraft({ vehicle: garageVehicle }, input.draft ?? {});
    const { errors } = draftProblems(draft, false);
    if (errors.length) throw new ScrapValidationError(errors);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const request = await this.db.scrapRequest.create({
          data: {
            requestNumber: newRequestNumber(), customerId, customerVehicleId: input.customerVehicleId ?? null, status: 'DRAFT', submissionKey: input.submissionKey ?? null,
            draftData: draft as Any, registrationNormalized: draft.vehicle?.registrationNumber ? normalizeRegistration(draft.vehicle.registrationNumber) : null,
            city: draft.pickupAddress?.city?.trim() || null,
          },
        });
        return { created: true, request: this.draftView(request) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // either the generated request number collided (try another) or the same submission key raced in (return that one)
        const raced = input.submissionKey ? await this.db.scrapRequest.findFirst({ where: { customerId, submissionKey: input.submissionKey } }) : null;
        if (raced) return { created: false, request: this.draftView(raced) };
      }
    }
    throw new HttpError(503, 'SCRAP_REQUEST_NOT_CREATED', 'The request could not be created. Please try again.');
  }

  async updateDraft(uid: string, requestId: string, expectedVersion: number, patch: DraftPatch) {
    const { request } = await this.ownedRequest(uid, requestId);
    if (request.status !== 'DRAFT') throw new HttpError(409, 'SCRAP_NOT_EDITABLE', 'This request has been submitted and can no longer be edited.');
    if (request.version !== expectedVersion) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This draft was changed on another device. Refresh to see the latest answers.');

    const draft = mergeDraft((request.draftData ?? {}) as DraftData, patch);
    // Answers to questions that are no longer shown (because an earlier answer changed) are dropped, never kept silently.
    const shown = new Set(visibleQuestions(draft.answers ?? {}, draft.vehicle ?? {}).map(question => question.key));
    draft.answers = Object.fromEntries(Object.entries(draft.answers ?? {}).filter(([key]) => shown.has(key)));
    const { errors } = draftProblems(draft, false);
    if (errors.length) throw new ScrapValidationError(errors);

    try {
      const changed = await this.db.scrapRequest.updateMany({
        where: { id: request.id, version: request.version, status: 'DRAFT' },
        data: {
          draftData: draft as Any, version: { increment: 1 }, city: draft.pickupAddress?.city?.trim() || null,
          registrationNormalized: draft.vehicle?.registrationNumber ? normalizeRegistration(draft.vehicle.registrationNumber) : null,
        },
      });
      if (changed.count === 0) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This draft was changed on another device. Refresh to see the latest answers.');
    } catch (error) {
      if (isUniqueViolation(error)) throw new HttpError(409, 'SCRAP_REQUEST_ALREADY_ACTIVE', 'A request for this vehicle is already in progress.');
      throw error;
    }
    return this.draftView((await this.db.scrapRequest.findUnique({ where: { id: request.id } }))!);
  }

  async deleteDraft(uid: string, requestId: string) {
    const { request } = await this.ownedRequest(uid, requestId);
    if (request.status !== 'DRAFT') throw new HttpError(409, 'SCRAP_NOT_EDITABLE', 'Only an unsubmitted draft can be deleted.');
    await this.db.scrapRequest.deleteMany({ where: { id: request.id, status: 'DRAFT' } });
    return { deleted: true };
  }

  /**
   * Submits a draft. Safe to repeat: a second call (a double tap, a retry after a lost response) returns the request as it already is and
   * creates nothing new. The one-live-request-per-vehicle rule is checked here and also enforced by a unique index in the database.
   */
  async submit(uid: string, requestId: string) {
    const { request, customerId } = await this.ownedRequest(uid, requestId);
    if (request.status !== 'DRAFT') return { alreadySubmitted: true, request: await this.customerSummary(request) };

    const draft = (request.draftData ?? {}) as DraftData;
    const { errors, cleaned } = draftProblems(draft, true);
    if (errors.length) throw new ScrapValidationError(errors);

    const vehicle = draft.vehicle as Required<Pick<VehicleInput, 'registrationNumber' | 'make' | 'model' | 'manufacturingYear' | 'fuelType' | 'vehicleCategory'>> & VehicleInput;
    const ownership = draft.ownership as OwnershipInput;
    const registration = normalizeRegistration(vehicle.registrationNumber);

    const requirements = ((await this.db.scrapPolicy.findUnique({ where: { key: 'submission_requirements' } }))?.value ?? {}) as { minVehiclePhotos?: number };
    if ((requirements.minVehiclePhotos ?? 0) > 0) {
      const photos = await this.db.scrapDocument.count({ where: { requestId: request.id, documentType: 'VEHICLE_PHOTO', status: { in: ['UPLOADED', 'UNDER_REVIEW', 'ACCEPTED'] } } });
      if (photos < requirements.minVehiclePhotos!) {
        throw new ScrapValidationError([{ field: 'documents', message: `Please add at least ${requirements.minVehiclePhotos} photographs of the vehicle.` }]);
      }
    }

    const live = await this.db.scrapRequest.findFirst({ where: { registrationNormalized: registration, id: { not: request.id }, status: { notIn: NOT_LIVE } } });
    if (live) {
      throw new HttpError(409, 'SCRAP_REQUEST_ALREADY_ACTIVE', live.customerId === customerId
        ? `You already have a request for this vehicle in progress (${live.requestNumber}).`
        : 'A request for this vehicle is already in progress. If you believe this is a mistake, please contact support.');
    }

    try {
      await this.db.$transaction(async tx => {
        const now = new Date();
        await tx.scrapVehicleSnapshot.create({
          data: {
            requestId: request.id, registrationNumber: registration, make: vehicle.make.trim(), model: vehicle.model.trim(), variant: vehicle.variant?.trim() || null,
            manufacturingYear: vehicle.manufacturingYear, registrationYear: vehicle.registrationYear ?? null, fuelType: vehicle.fuelType.toUpperCase(),
            vehicleCategory: vehicle.vehicleCategory, odometerKm: vehicle.odometerKm ?? null, vin: vehicle.vin?.trim() || null, isElectric: vehicleIsElectric(vehicle),
          },
        });
        for (const [questionKey, answer] of Object.entries(cleaned)) {
          await tx.scrapConditionAnswer.create({ data: { requestId: request.id, questionKey, answer: answer as Any, questionnaireVersion: QUESTIONNAIRE_VERSION } });
        }

        const estimate = computeIndicativeEstimate(
          { vehicleCategory: vehicle.vehicleCategory, completeness: typeof cleaned.completeness === 'string' ? cleaned.completeness : null, towingRequired: cleaned.running_condition !== undefined && cleaned.running_condition !== 'DRIVABLE' },
          await this.pricingPolicy(tx), now,
        );
        await tx.scrapEstimate.create({
          data: {
            requestId: request.id, version: 1, status: estimate.status, calculationVersion: estimate.calculationVersion,
            sourceData: { ...estimate.sourceData, ...(estimate.reason ? { reason: estimate.reason } : {}) } as Any, adjustments: estimate.adjustments as Any,
            minPaise: estimate.minPaise ?? null, maxPaise: estimate.maxPaise ?? null, expiresAt: estimate.expiresAt ?? null,
          },
        });

        const changed = await tx.scrapRequest.updateMany({
          where: { id: request.id, version: request.version, status: 'DRAFT' },
          data: {
            ownershipDeclaration: { ...ownership, declaredAt: now.toISOString() } as Any, ownershipDeclaredAt: now, pickupAddress: draft.pickupAddress as Any,
            city: draft.pickupAddress!.city!.trim(), blockingFlags: deriveBlockingFlags(cleaned, ownership), registrationNormalized: registration, draftData: Prisma.DbNull,
            version: { increment: 1 },
          },
        });
        if (changed.count === 0) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This request was changed while it was being submitted. Please try again.');

        await this.applyTransition(tx, { requestId: request.id, to: 'SUBMITTED', actor: { kind: 'CUSTOMER' }, actorUserId: customerId });
        await this.applyTransition(tx, { requestId: request.id, to: 'SALES_REVIEW', actor: { kind: 'SYSTEM' }, actorUserId: null, reason: 'Submitted for review' });
      });
    } catch (error) {
      // Two submissions for the same vehicle at the same moment: the database accepts one and refuses the other.
      if (isUniqueViolation(error)) throw new HttpError(409, 'SCRAP_REQUEST_ALREADY_ACTIVE', 'A request for this vehicle is already in progress.');
      throw error;
    }
    return { alreadySubmitted: false, request: await this.customerSummary((await this.db.scrapRequest.findUnique({ where: { id: request.id } }))!) };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Customer: list, detail, cancel, dispute, offer response
  // ---------------------------------------------------------------------------------------------------------------------------------

  private async customerSummary(request: Any) {
    const [vehicle, estimate] = await Promise.all([
      this.db.scrapVehicleSnapshot.findUnique({ where: { requestId: request.id } }),
      this.db.scrapEstimate.findMany({ where: { requestId: request.id }, orderBy: { version: 'desc' }, take: 1 }),
    ]);
    return {
      id: request.id, requestNumber: request.requestNumber, version: request.version, ...this.statusFields(request.status as ScrapStatus),
      vehicle: vehicle && { registrationNumber: (vehicle as Any).registrationNumber, make: (vehicle as Any).make, model: (vehicle as Any).model, manufacturingYear: (vehicle as Any).manufacturingYear },
      estimate: this.estimateSummary((estimate as Any[])[0] ?? null),
      submittedAt: request.submittedAt ?? null, createdAt: request.createdAt, updatedAt: request.updatedAt,
    };
  }

  async listForCustomer(uid: string, opts: { cursor?: string; limit?: number; status?: ScrapStatus }) {
    const customerId = await this.customerId(uid);
    const limit = Math.min(MAX_PAGE, Math.max(1, opts.limit ?? 20));
    const rows = await this.db.scrapRequest.findMany({
      where: { customerId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(opts.cursor && isUuid(opts.cursor) ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const items = await Promise.all(page.map(row => (row.status === 'DRAFT' ? Promise.resolve({ id: row.id, requestNumber: row.requestNumber, version: row.version, ...this.statusFields('DRAFT'), updatedAt: row.updatedAt, createdAt: row.createdAt, vehicle: ((row.draftData as DraftData | null)?.vehicle ?? null) }) : this.customerSummary(row))));
    return { items, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  }

  async getForCustomer(uid: string, requestId: string) {
    const { request } = await this.ownedRequest(uid, requestId);
    if (request.status === 'DRAFT') return this.draftView(request);

    const records = await this.loadRecords(this.db, request);
    const [vehicle, answers, documents, estimates, events, offers, pickups, certificates, obligations, disputes, partner] = await Promise.all([
      this.db.scrapVehicleSnapshot.findUnique({ where: { requestId: request.id } }),
      this.db.scrapConditionAnswer.findMany({ where: { requestId: request.id } }),
      this.db.scrapDocument.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.db.scrapEstimate.findMany({ where: { requestId: request.id }, orderBy: { version: 'desc' }, take: 1 }),
      this.db.scrapStatusEvent.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.db.scrapOffer.findMany({ where: { requestId: request.id }, orderBy: { version: 'desc' }, take: 1 }),
      this.db.scrapPickup.findMany({ where: { requestId: request.id, status: { not: 'CANCELLED' } }, orderBy: { version: 'desc' }, take: 1 }),
      this.db.scrapCertificate.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.db.scrapPaymentObligation.findMany({ where: { requestId: request.id } }),
      this.db.scrapDispute.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'desc' } }),
      request.partnerId ? this.db.scrapPartner.findUnique({ where: { id: request.partnerId }, select: { legalName: true } }) : Promise.resolve(null),
    ]);
    const offer = (offers as Any[])[0] ?? null;
    // The customer sees an offer only once it has been sent to them. A draft or an offer waiting for internal approval is not shown.
    const visibleOffer = offer && ['SENT_TO_CUSTOMER', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(offer.status) ? offer : null;
    const pickup = (pickups as Any[])[0] ?? null;

    return {
      id: request.id, requestNumber: request.requestNumber, version: request.version, ...this.statusFields(request.status as ScrapStatus),
      holdNotice: request.status === 'ON_HOLD' ? 'Your request is paused while we resolve something. We will contact you if we need anything from you.' : null,
      vehicle: vehicle && { ...(vehicle as Any), identitySource: undefined, identityVerifiedById: undefined, identityStatus: (vehicle as Any).identityVerifiedAt ? 'CHECKED_BY_V_MOTIV' : 'AS_DECLARED_BY_YOU' },
      answers: Object.fromEntries((answers as Any[]).map(answer => [answer.questionKey, answer.answer])),
      pickupAddress: request.pickupAddress ?? null,
      estimate: this.estimateSummary((estimates as Any[])[0] ?? null),
      // Only what the customer needs: no storage keys, no reviewer names, no internal notes.
      documents: (documents as Any[]).map(document => ({ id: document.id, documentType: document.documentType, status: document.status, rejectionReason: document.status === 'REJECTED' ? document.rejectionReason : null })),
      offer: visibleOffer && {
        id: visibleOffer.id, version: visibleOffer.version, status: visibleOffer.status, customerPayoutPaise: asMoney(visibleOffer.customerPayoutPaise), currency: visibleOffer.currency,
        payerType: visibleOffer.payerType, facilityName: (partner as Any)?.legalName ?? null, expiresAt: visibleOffer.expiresAt, terms: visibleOffer.terms ?? null,
        decision: records.offer?.decision ?? null,
      },
      pickup: pickup && { status: pickup.status, windowStart: pickup.windowStart, windowEnd: pickup.windowEnd, address: pickup.address, customerConfirmedAt: pickup.customerConfirmedAt, agentName: pickup.agentName ?? null, transportProvider: pickup.transportProvider ?? null },
      // The real verification state, and by what method. A manual document check is never presented as a government verification.
      certificates: (certificates as Any[]).map(certificate => ({
        type: certificate.type, officialReference: certificate.officialReference, issuedAt: certificate.issuedAt, verificationState: certificate.verificationState,
        verificationMethod: certificate.verificationState === 'VERIFIED' ? certificate.verificationMethod : null,
      })),
      registrationStatus: request.registrationStatus,
      payment: {
        state: request.paymentState,
        obligations: (obligations as Any[]).map(obligation => ({ payerType: obligation.payerType, amountPaise: asMoney(obligation.amountPaise), currency: obligation.currency, status: obligation.status })),
      },
      disputes: (disputes as Any[]).map(dispute => ({ id: dispute.id, category: dispute.category, status: dispute.status, createdAt: dispute.createdAt })),
      timeline: (events as Any[]).filter(event => event.fromStatus !== event.toStatus).map(event => ({
        at: event.createdAt, status: event.toStatus, label: CUSTOMER_STATUS_TEXT[event.toStatus as ScrapStatus].label,
        // A customer's own reason is theirs to see; a staff member's internal note is not.
        note: event.actorType === 'CUSTOMER' ? event.reason : null,
      })),
      createdAt: request.createdAt, updatedAt: request.updatedAt, submittedAt: request.submittedAt ?? null,
    };
  }

  async cancel(uid: string, requestId: string, input: { reason: string; expectedVersion?: number }) {
    const { request, customerId } = await this.ownedRequest(uid, requestId);
    await this.db.$transaction(tx => this.applyTransition(tx, { requestId: request.id, to: 'CANCELLED', actor: { kind: 'CUSTOMER' }, actorUserId: customerId, reason: input.reason, expectedVersion: input.expectedVersion }));
    return this.customerSummary((await this.db.scrapRequest.findUnique({ where: { id: request.id } }))!);
  }

  async raiseDispute(uid: string, requestId: string, input: { category: string; description: string }) {
    const { request, customerId } = await this.ownedRequest(uid, requestId);
    if (!(DISPUTE_CATEGORIES as readonly string[]).includes(input.category)) throw new ScrapValidationError([{ field: 'category', message: 'Choose what the concern is about.' }]);
    const description = input.description.trim();
    if (description.length < 10 || description.length > 2000) throw new ScrapValidationError([{ field: 'description', message: 'Please describe the concern in 10 to 2000 characters.' }]);
    if (request.status === 'DRAFT') throw new HttpError(409, 'SCRAP_NOT_SUBMITTED', 'There is nothing to dispute on a request that has not been submitted.');
    if ((await this.db.scrapDispute.count({ where: { requestId: request.id, status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } } })) >= MAX_OPEN_DISPUTES) {
      throw new HttpError(409, 'TOO_MANY_OPEN_DISPUTES', 'You already have several open concerns on this request. Our team is working on them.');
    }
    const dispute = await this.db.$transaction(async tx => {
      const created = await tx.scrapDispute.create({ data: { requestId: request.id, raisedById: customerId, raisedByType: 'CUSTOMER', category: input.category, description } });
      await tx.auditEvent.create({ data: { actorId: customerId, action: 'SCRAP_DISPUTE_RAISED', entityType: 'ScrapRequest', entityId: request.id, details: { disputeId: created.id, category: input.category } } });
      // A case still moving is paused so nothing advances while the concern is open (the guards would refuse anyway).
      const current = (await tx.scrapRequest.findUnique({ where: { id: request.id } }))!;
      if (!TERMINAL.includes(current.status as ScrapStatus) && current.status !== 'ON_HOLD') {
        await this.applyTransition(tx, { requestId: request.id, to: 'ON_HOLD', actor: { kind: 'SYSTEM' }, actorUserId: null, reason: `Customer raised a concern: ${input.category}` });
      }
      return created;
    });
    return { id: dispute.id, category: dispute.category, status: dispute.status, createdAt: dispute.createdAt };
  }

  /** The customer's decision on the current offer. Repeating the same decision returns the same result; a different one is refused. */
  async respondToOffer(uid: string, requestId: string, input: { offerId: string; decision: 'ACCEPTED' | 'REJECTED'; note?: string; networkAddress?: string; device?: Record<string, unknown> }) {
    const { request, customerId } = await this.ownedRequest(uid, requestId);
    if (!isUuid(input.offerId)) throw new HttpError(404, 'SCRAP_OFFER_NOT_FOUND');
    const offer = await this.db.scrapOffer.findFirst({ where: { id: input.offerId, requestId: request.id } });
    if (!offer) throw new HttpError(404, 'SCRAP_OFFER_NOT_FOUND');

    const earlier = await this.db.scrapOfferAcceptance.findUnique({ where: { offerId: offer.id } });
    if (earlier) {
      if (earlier.decision === input.decision) return { repeated: true, request: await this.customerSummary(request) };
      throw new HttpError(409, 'OFFER_ALREADY_DECIDED', 'You have already responded to this offer.');
    }
    if ((await this.db.scrapOffer.count({ where: { requestId: request.id, version: { gt: offer.version } } })) > 0) throw new HttpError(409, 'OFFER_SUPERSEDED', 'This offer has been replaced by a newer one.');
    if (request.status !== 'OFFER_PENDING_CUSTOMER' || offer.status !== 'SENT_TO_CUSTOMER') throw new HttpError(409, 'OFFER_NOT_OPEN', 'This offer is not open for a response.');
    if (offer.expiresAt.getTime() <= Date.now()) {
      await this.db.scrapOffer.updateMany({ where: { id: offer.id, status: 'SENT_TO_CUSTOMER' }, data: { status: 'EXPIRED' } });
      throw new HttpError(409, 'OFFER_EXPIRED', 'This offer has expired. We will get a new quotation for you.');
    }

    await this.db.$transaction(async tx => {
      await tx.scrapOfferAcceptance.create({
        data: {
          offerId: offer.id, customerId, decision: input.decision, termsVersion: offer.termsVersion ?? null, note: input.note?.trim() || null, deviceInfo: (input.device ?? undefined) as Any,
          // A short hash, not the address itself.
          networkHash: input.networkAddress ? crypto.createHash('sha256').update(input.networkAddress).digest('hex').slice(0, 16) : null,
        },
      });
      await tx.scrapOffer.updateMany({ where: { id: offer.id, status: 'SENT_TO_CUSTOMER' }, data: { status: input.decision } });
      await this.applyTransition(tx, { requestId: request.id, to: input.decision === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'REJECTED', actor: { kind: 'CUSTOMER' }, actorUserId: customerId, reason: input.note?.trim() || undefined, evidence: { offerId: offer.id, offerVersion: offer.version } });
    });
    return { repeated: false, request: await this.customerSummary((await this.db.scrapRequest.findUnique({ where: { id: request.id } }))!) };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------------------------------------------------------------

  /** Who is asking, from the database. Permissions are the ones granted through the platform's existing role system; the client supplies none. */
  async staffContext(uid: string): Promise<StaffContext> {
    const employee = await this.db.employee.findFirst({
      where: { active: true, status: 'ACTIVE', user: { firebaseUid: uid, status: 'ACTIVE' } },
      include: {
        user: { select: { email: true } },
        roleAssignments: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!employee) throw new HttpError(403, 'SCRAP_ACCESS_DENIED');
    const primary = await this.db.role.findUnique({ where: { key: employee.role }, include: { permissions: { include: { permission: true } } } });
    const roles = [...new Set([employee.role, ...employee.roleAssignments.map(item => item.role.key)])];
    const permissions = [
      ...new Set([
        ...employee.permissions,
        ...(primary?.permissions.map(item => item.permission.key) ?? []),
        ...employee.roleAssignments.flatMap(item => item.role.permissions.map(permission => permission.permission.key)),
      ]),
    ].filter(key => key.startsWith('scrap.'));
    if (permissions.length === 0) throw new HttpError(403, 'SCRAP_ACCESS_DENIED');
    return { userId: employee.userId, email: employee.user.email, roles, permissions };
  }

  private staffActor(ctx: StaffContext): ScrapActor {
    return { kind: 'STAFF', permissions: ctx.permissions };
  }

  private need(ctx: StaffContext, permission: string) {
    if (!ctx.permissions.includes(permission)) throw new HttpError(403, 'PERMISSION_DENIED', 'You do not have permission to do that.');
  }

  /** Sales sees the leads assigned to them or not yet assigned, up to assessment. Operations and administrators see every case. */
  private staffScope(ctx: StaffContext): Record<string, unknown> {
    const broad = [P.assignPartner, P.reviewAssessment, P.assignAssessment, P.holdCase, P.verifyCertificate].some(permission => ctx.permissions.includes(permission));
    if (broad || ctx.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role))) return { status: { not: 'DRAFT' } };
    return { status: { in: SALES_VISIBLE }, OR: [{ salesAssigneeId: ctx.userId }, { salesAssigneeId: null }] };
  }

  private async staffRequest(ctx: StaffContext, requestId: string) {
    this.need(ctx, P.readRequests);
    if (!isUuid(requestId)) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    const request = await this.db.scrapRequest.findFirst({ where: { id: requestId, ...this.staffScope(ctx) } });
    if (!request) throw new HttpError(404, 'SCRAP_REQUEST_NOT_FOUND');
    return request;
  }

  async listForStaff(ctx: StaffContext, opts: { status?: ScrapStatus; search?: string; assignedToMe?: boolean; cursor?: string; limit?: number }) {
    this.need(ctx, P.readRequests);
    const limit = Math.min(MAX_PAGE, Math.max(1, opts.limit ?? 25));
    const search = opts.search?.trim();
    const scope = this.staffScope(ctx);
    const rows = await this.db.scrapRequest.findMany({
      where: {
        ...scope,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.assignedToMe ? { salesAssigneeId: ctx.userId } : {}),
        ...(search ? { AND: [{ OR: [{ requestNumber: { contains: search.toUpperCase() } }, ...(normalizeRegistration(search).length >= 3 ? [{ registrationNormalized: { contains: normalizeRegistration(search) } }] : [])] }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(opts.cursor && isUuid(opts.cursor) ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const ids = page.map(row => row.id);
    const customerIds = [...new Set(page.map(row => row.customerId))];
    // Two queries for the whole page, not one per row.
    const [vehicles, customers] = await Promise.all([
      ids.length ? this.db.scrapVehicleSnapshot.findMany({ where: { requestId: { in: ids } } }) : Promise.resolve([]),
      customerIds.length ? this.db.user.findMany({ where: { id: { in: customerIds } }, select: { id: true, displayName: true, email: true, phone: true } }) : Promise.resolve([]),
    ]);
    const vehicleByRequest = new Map((vehicles as Any[]).map(vehicle => [vehicle.requestId, vehicle]));
    const customerById = new Map((customers as Any[]).map(customer => [customer.id, customer]));
    return {
      items: page.map(row => ({
        id: row.id, requestNumber: row.requestNumber, status: row.status, version: row.version, blockingFlags: row.blockingFlags, city: row.city, salesAssigneeId: row.salesAssigneeId,
        submittedAt: row.submittedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
        vehicle: ((v: Any) => v && { registrationNumber: v.registrationNumber, make: v.make, model: v.model, manufacturingYear: v.manufacturingYear, vehicleCategory: v.vehicleCategory })(vehicleByRequest.get(row.id)),
        customer: ((c: Any) => c && { id: c.id, name: c.displayName, email: c.email, phone: c.phone })(customerById.get(row.customerId)),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async getForStaff(ctx: StaffContext, requestId: string) {
    const request = await this.staffRequest(ctx, requestId);
    const records = await this.loadRecords(this.db, request);
    const facts = factsFromRecords(records);
    const [vehicle, answers, documents, estimates, events, customer] = await Promise.all([
      this.db.scrapVehicleSnapshot.findUnique({ where: { requestId: request.id } }),
      this.db.scrapConditionAnswer.findMany({ where: { requestId: request.id } }),
      this.db.scrapDocument.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.db.scrapEstimate.findMany({ where: { requestId: request.id }, orderBy: { version: 'desc' }, take: 1 }),
      this.db.scrapStatusEvent.findMany({ where: { requestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.db.user.findUnique({ where: { id: request.customerId }, select: { id: true, displayName: true, email: true, phone: true } }),
    ]);
    return {
      id: request.id, requestNumber: request.requestNumber, version: request.version, status: request.status, holdFromStatus: request.holdFromStatus, holdReason: request.holdReason,
      blockingFlags: request.blockingFlags, ownershipDeclaration: request.ownershipDeclaration, pickupAddress: request.pickupAddress, salesAssigneeId: request.salesAssigneeId,
      paymentState: request.paymentState, registrationStatus: request.registrationStatus,
      customer, vehicle, answers: Object.fromEntries((answers as Any[]).map(answer => [answer.questionKey, answer.answer])),
      documents: (documents as Any[]).map(document => ({ id: document.id, documentType: document.documentType, status: document.status, rejectionReason: document.rejectionReason, reviewedAt: document.reviewedAt })),
      estimate: this.estimateSummary((estimates as Any[])[0] ?? null),
      timeline: (events as Any[]).map(event => ({ at: event.createdAt, from: event.fromStatus, to: event.toStatus, actorType: event.actorType, actorId: event.actorId, reason: event.reason, kind: (event.evidence as Any)?.kind ?? null })),
      // What this person could do next and, where something stands in the way, what is missing. Computed from the same rules that enforce it.
      nextSteps: availableTransitions(request.status as ScrapStatus, this.staffActor(ctx), facts),
      facts: { qualifiedBySales: facts.qualifiedBySales, openDocumentRequests: facts.openDocumentRequests, requiredDocumentsAccepted: facts.requiredDocumentsAccepted },
    };
  }

  /** Records that sales has (or no longer has) qualified the lead, and takes ownership of it if nobody has. */
  async qualifyLead(ctx: StaffContext, requestId: string, input: { qualified: boolean; note: string }) {
    this.need(ctx, P.qualifyLead);
    const request = await this.staffRequest(ctx, requestId);
    if (request.status !== 'SALES_REVIEW') throw new HttpError(409, 'NOT_IN_SALES_REVIEW', 'A lead can only be qualified while it is in sales review.');
    if (!input.note?.trim()) throw new HttpError(400, 'NOTE_REQUIRED', 'Add a note about what you checked.');
    await this.db.$transaction(async tx => {
      const changed = await tx.scrapRequest.updateMany({
        where: { id: request.id, version: request.version },
        data: { version: { increment: 1 }, ...(request.salesAssigneeId ? {} : { salesAssigneeId: ctx.userId }) },
      });
      if (changed.count === 0) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This request was changed by someone else. Refresh and try again.');
      await tx.scrapStatusEvent.create({
        data: { requestId: request.id, fromStatus: 'SALES_REVIEW', toStatus: 'SALES_REVIEW', actorId: ctx.userId, actorType: 'STAFF', reason: input.note.trim(), evidence: { kind: input.qualified ? EVENT_KINDS.leadQualified : EVENT_KINDS.leadQualificationRevoked } },
      });
      await tx.auditEvent.create({ data: { actorId: ctx.userId, action: input.qualified ? 'SCRAP_LEAD_QUALIFIED' : 'SCRAP_LEAD_QUALIFICATION_REVOKED', entityType: 'ScrapRequest', entityId: request.id, details: { note: input.note.trim() } } });
    });
    return this.getForStaff(ctx, request.id);
  }

  /** Asks the customer for documents and moves the case to "documents required". Nothing is asked for that is not named here. */
  async requestDocuments(ctx: StaffContext, requestId: string, input: { documentTypes: string[]; note?: string }) {
    this.need(ctx, P.reviewDocuments);
    const request = await this.staffRequest(ctx, requestId);
    const types = [...new Set(input.documentTypes.map(type => type.trim().toUpperCase()).filter(Boolean))];
    if (types.length === 0) throw new HttpError(400, 'DOCUMENT_TYPES_REQUIRED', 'Name at least one document to ask for.');
    await this.db.$transaction(async tx => {
      const existing = await tx.scrapDocument.findMany({ where: { requestId: request.id }, select: { documentType: true, status: true } });
      for (const type of types) {
        if ((existing as Any[]).some(document => document.documentType === type && !['REJECTED', 'EXPIRED'].includes(document.status))) continue; // already asked for or received
        await tx.scrapDocument.create({ data: { requestId: request.id, documentType: type, status: 'REQUESTED' } });
      }
      await this.applyTransition(tx, { requestId: request.id, to: 'DOCUMENTS_REQUIRED', actor: this.staffActor(ctx), actorUserId: ctx.userId, reason: input.note?.trim() || `Documents requested: ${types.join(', ')}`, expectedVersion: request.version });
    });
    return this.getForStaff(ctx, request.id);
  }

  async reviewDocument(ctx: StaffContext, documentId: string, input: { decision: 'ACCEPT' | 'REJECT'; reason?: string }) {
    this.need(ctx, P.reviewDocuments);
    if (!isUuid(documentId)) throw new HttpError(404, 'SCRAP_DOCUMENT_NOT_FOUND');
    const document = await this.db.scrapDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new HttpError(404, 'SCRAP_DOCUMENT_NOT_FOUND');
    await this.staffRequest(ctx, document.requestId); // the same visibility rules as the case itself
    if (!['UPLOADED', 'UNDER_REVIEW'].includes(document.status)) throw new HttpError(409, 'DOCUMENT_NOT_REVIEWABLE', 'Only a document that has been provided can be reviewed.');
    if (input.decision === 'REJECT' && !input.reason?.trim()) throw new HttpError(400, 'REASON_REQUIRED', 'Say why the document is not acceptable, so the customer knows what to fix.');
    const changed = await this.db.scrapDocument.updateMany({
      where: { id: document.id, status: { in: ['UPLOADED', 'UNDER_REVIEW'] } },
      data: { status: input.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED', reviewedById: ctx.userId, reviewedAt: new Date(), rejectionReason: input.decision === 'REJECT' ? input.reason!.trim() : null },
    });
    if (changed.count === 0) throw new HttpError(409, 'DOCUMENT_NOT_REVIEWABLE', 'This document was already reviewed.');
    await this.db.auditEvent.create({ data: { actorId: ctx.userId, action: input.decision === 'ACCEPT' ? 'SCRAP_DOCUMENT_ACCEPTED' : 'SCRAP_DOCUMENT_REJECTED', entityType: 'ScrapDocument', entityId: document.id, details: { requestId: document.requestId, documentType: document.documentType } } });
    return { id: document.id, status: input.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' };
  }

  /** Sets or clears a concern that stops the case before assessment. Always with a note; the change is on the case's timeline. */
  async setBlockingFlag(ctx: StaffContext, requestId: string, input: { flag: string; action: 'SET' | 'CLEAR'; note: string }) {
    const request = await this.staffRequest(ctx, requestId);
    const allowed = input.action === 'SET' ? [P.qualifyLead, P.rejectCase] : [P.qualifyLead, P.holdCase];
    if (!allowed.some(permission => ctx.permissions.includes(permission))) throw new HttpError(403, 'PERMISSION_DENIED', 'You do not have permission to do that.');
    if (!input.note?.trim()) throw new HttpError(400, 'NOTE_REQUIRED', 'Add a note explaining the change.');
    const known = [...STAFF_BLOCKING_FLAGS, 'NOT_REGISTERED_OWNER', 'UNDER_FINANCE', 'PENDING_DUES', 'LEGAL_DISPUTE_DECLARED', 'INSURANCE_TOTAL_LOSS_PENDING'] as string[];
    if (!known.includes(input.flag)) throw new ScrapValidationError([{ field: 'flag', message: 'This is not a recognised concern.' }]);
    if (input.action === 'SET' && !(STAFF_BLOCKING_FLAGS as readonly string[]).includes(input.flag)) throw new ScrapValidationError([{ field: 'flag', message: 'This concern comes from the customer\'s own declaration and cannot be set by hand.' }]);
    if (TERMINAL.includes(request.status as ScrapStatus)) throw new HttpError(409, 'CASE_CLOSED', 'This case is closed.');
    const next = input.action === 'SET' ? [...new Set([...request.blockingFlags, input.flag])] : request.blockingFlags.filter(flag => flag !== input.flag);
    await this.db.$transaction(async tx => {
      const changed = await tx.scrapRequest.updateMany({ where: { id: request.id, version: request.version }, data: { blockingFlags: next, version: { increment: 1 } } });
      if (changed.count === 0) throw new HttpError(409, 'SCRAP_VERSION_CONFLICT', 'This request was changed by someone else. Refresh and try again.');
      await tx.scrapStatusEvent.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: request.status, actorId: ctx.userId, actorType: 'STAFF', reason: input.note.trim(), evidence: { kind: input.action === 'SET' ? 'FLAG_SET' : 'FLAG_CLEARED', flag: input.flag } } });
      await tx.auditEvent.create({ data: { actorId: ctx.userId, action: input.action === 'SET' ? 'SCRAP_FLAG_SET' : 'SCRAP_FLAG_CLEARED', entityType: 'ScrapRequest', entityId: request.id, details: { flag: input.flag, note: input.note.trim() } } });
    });
    return this.getForStaff(ctx, request.id);
  }

  /** Any status change a person asks for. The state machine decides; the answer says what is missing when the answer is no. */
  async transition(ctx: StaffContext, requestId: string, input: { to: ScrapStatus; expectedVersion: number; reason?: string }) {
    const request = await this.staffRequest(ctx, requestId);
    await this.db.$transaction(tx => this.applyTransition(tx, { requestId: request.id, to: input.to, actor: this.staffActor(ctx), actorUserId: ctx.userId, reason: input.reason, expectedVersion: input.expectedVersion }));
    return this.getForStaff(ctx, request.id);
  }
}

export { isLiveRequestStatus };
