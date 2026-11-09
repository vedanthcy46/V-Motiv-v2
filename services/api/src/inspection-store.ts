import { type InspectionAnswerStatus, type InspectionDefectSeverity, Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';
import { notifyReadyForPayment } from './acquisition-events.js';
import { listingGaps, listingGapMessage } from './listing-readiness.js';
import { originalPriceAfterChange } from './price-drop.js';
import { inferBodyType, refreshMasterBodyTypes, resolveBodyType } from './body-types.js';
import { INSPECTOR_INELIGIBILITY_MESSAGES, inspectorIneligibility } from './inspector-eligibility.js';
import { knownTemplateItem, templateFor, currentTemplate, isItemApplicable, type InspectionTemplateItem } from './inspection-template.js';
import { InspectionMediaService } from './inspection-media.js';
import type { NotificationService } from './notification/index.js';

export type InspectionActor = {
  userId: string;
  email: string;
  roles: string[];
  branchIds: string[];
  branchCities: string[];
};

const checkRole = (actor: InspectionActor, allowed: string[]) => {
  if (!actor.roles.some(item => allowed.includes(item))) {
    throw new HttpError(403, 'INSPECTION_ACCESS_DENIED');
  }
};

const inspectorRoles = ['INSPECTOR', 'SUPER_ADMIN', 'ADMIN'];
const operationsRoles = ['OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const inventoryRoles = ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const financeRoles = ['FINANCE', 'ADMIN', 'SUPER_ADMIN'];
const costApproverRoles = ['PRICING_APPROVER', 'ADMIN', 'SUPER_ADMIN'];
const qcRoles = ['INSPECTION_REVIEWER', 'ADMIN', 'SUPER_ADMIN'];
const reviewerRoles = ['INSPECTION_REVIEWER', 'ADMIN', 'SUPER_ADMIN'];
const listingRoles = ['LISTING_EXECUTIVE', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const publishRoles = ['PRICING_APPROVER', 'LISTING_EXECUTIVE', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const stockReadRoles = [...inventoryRoles, ...qcRoles, ...listingRoles, ...publishRoles];

export function isInvalidRegNumberOrUuid(val: unknown): boolean {
  if (!val || typeof val !== 'string') return true;
  const s = val.trim();
  if (!s) return true;
  // Standard UUID (8-4-4-4-12 hex format)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // Compact 32-hex UUID
  if (/^[0-9a-f]{32}$/i.test(s)) return true;
  // System internal reference codes
  if (/^(SL-|VM-|REF-|LEAD-)/i.test(s)) return true;
  // Indian registration plates are at most 14 characters and never contain 3+ hyphens
  if (s.length > 14 || (s.match(/-/g) || []).length >= 3) return true;
  return false;
}

const documentTerminalStatuses = ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'];
// A document can be verified (or rejected) straight from "requested" or "received": checking it IS the review, so staff no
// longer click through Received and Under review first. The intermediate states remain available for those who use them.
const documentTransitions: Record<string, string[]> = {
  NOT_REQUESTED: ['REQUESTED'],
  REQUESTED: ['RECEIVED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'MISMATCH', 'WAIVED_BY_AUTHORIZED_POLICY'],
  RECEIVED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'MISMATCH', 'WAIVED_BY_AUTHORIZED_POLICY'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'EXPIRED', 'MISMATCH', 'RECEIVED'],
  REJECTED: ['RECEIVED'],
  EXPIRED: ['RECEIVED'],
  MISMATCH: ['RECEIVED'],
  VERIFIED: [],
  WAIVED_BY_AUTHORIZED_POLICY: [],
};

const assignmentDetail = {
  id: true,
  status: true,
  scheduledAt: true,
  locationType: true,
  address: true,
  instructions: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  reports: {
    select: {
      id: true,
      status: true,
      revision: true,
      submittedAt: true,
      reviewedAt: true,
    },
    orderBy: { revision: 'desc' as const },
    take: 1,
  },
  request: {
    select: {
      id: true,
      status: true,
      branchId: true,
      lead: {
        select: {
          id: true,
          referenceCode: true,
          registrationNumber: true,
          sellerName: true,
          sellerPhone: true,
          city: true,
          make: true,
          model: true,
          variant: true,
          manufacturingYear: true,
          fuelType: true,
          transmission: true,
          odometerKm: true,
          inspectionAddress: true,
        },
      },
    },
  },
} satisfies Prisma.InspectionAssignmentSelect;

export class PrismaInspectionStore {
  private mediaService: InspectionMediaService;

  constructor(
    private db: PrismaClient,
    mediaService?: InspectionMediaService,
    private notificationService?: NotificationService
  ) {
    this.mediaService = mediaService || new InspectionMediaService();
  }

  async actor(uid: string): Promise<InspectionActor> {
    const employee = await this.db.employee.findFirst({
      where: {
        active: true,
        status: 'ACTIVE',
        user: { firebaseUid: uid, status: 'ACTIVE' },
      },
      include: {
        user: true,
        roleAssignments: { include: { role: true } },
        branchAssignments: { include: { branch: true } },
      },
    });

    if (!employee) {
      throw new HttpError(403, 'INSPECTION_ACCESS_DENIED');
    }

    const roles = [...new Set([employee.role, ...employee.roleAssignments.map(item => item.role.key)])];
    const branchIds = employee.branchAssignments.filter(item => item.branch.active).map(item => item.branchId);
    const branchCities = employee.branchAssignments.filter(item => item.branch.active).map(item => item.branch.city);

    return {
      userId: employee.userId,
      email: employee.user.email,
      roles,
      branchIds,
      branchCities,
    };
  }

  // --- Inspector Operations ---

  async assignments(
    actor: InspectionActor,
    query?: { sort?: string; status?: string; search?: string }
  ) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');

    // Default: newest assigned first (createdAt DESC, id DESC) as required
    let orderBy: Prisma.InspectionAssignmentOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
    if (query?.sort === 'appointment_asc') {
      orderBy = [{ scheduledAt: 'asc' }, { id: 'desc' }];
    } else if (query?.sort === 'appointment_desc') {
      orderBy = [{ scheduledAt: 'desc' }, { id: 'desc' }];
    } else if (query?.sort === 'oldest_assigned') {
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
    } else if (query?.sort === 'updated_desc') {
      orderBy = [{ updatedAt: 'desc' }, { id: 'desc' }];
    }

    let statusCondition: Prisma.InspectionAssignmentWhereInput = {};
    if (query?.status === 'ASSIGNED') {
      statusCondition = { status: 'ASSIGNED' };
    } else if (query?.status === 'IN_PROGRESS') {
      statusCondition = {
        OR: [
          { status: { in: ['CONFIRMED', 'RESCHEDULED'] } },
          { reports: { some: { status: 'DRAFT' } } },
        ],
      };
    } else if (query?.status === 'REWORK_REQUIRED' || query?.status === 'REWORK') {
      statusCondition = {
        reports: { some: { status: 'REWORK_REQUIRED' } },
      };
    } else if (query?.status === 'REVIEW') {
      statusCondition = {
        reports: { some: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } },
      };
    } else if (query?.status === 'COMPLETED') {
      statusCondition = {
        status: 'COMPLETED',
      };
    }

    const searchCondition: Prisma.InspectionAssignmentWhereInput = query?.search?.trim()
      ? {
          request: {
            lead: {
              OR: [
                { make: { contains: query.search.trim(), mode: 'insensitive' } },
                { model: { contains: query.search.trim(), mode: 'insensitive' } },
                { referenceCode: { contains: query.search.trim(), mode: 'insensitive' } },
                { registrationNumber: { contains: query.search.trim(), mode: 'insensitive' } },
                { sellerName: { contains: query.search.trim(), mode: 'insensitive' } },
                { city: { contains: query.search.trim(), mode: 'insensitive' } },
              ],
            },
          },
        }
      : {};

    const baseWhere: Prisma.InspectionAssignmentWhereInput = isElevated
      ? (query?.status ? {} : {
          OR: [
            { inspectorId: actor.userId },
            { status: { in: ['ASSIGNED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED'] } },
            { reports: { some: { status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED', 'SUBMITTED', 'APPROVED'] } } } },
          ],
        })
      : {
          inspectorId: actor.userId,
          ...(query?.status ? {} : {
            OR: [
              { status: { in: ['ASSIGNED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED'] } },
              { reports: { some: { inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED', 'SUBMITTED', 'APPROVED'] } } } },
            ],
          }),
        };

    return this.db.inspectionAssignment.findMany({
      where: {
        AND: [
          baseWhere,
          statusCondition,
          searchCondition,
        ],
      },
      orderBy,
      select: assignmentDetail,
    });
  }

  async assignment(actor: InspectionActor, id: string) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');
    const value = await this.db.inspectionAssignment.findFirst({
      where: isElevated ? { id } : { id, inspectorId: actor.userId },
      select: assignmentDetail,
    });
    if (!value) throw new HttpError(404, 'INSPECTION_ASSIGNMENT_NOT_FOUND');
    return value;
  }

  async start(actor: InspectionActor, id: string) {
    const assignment = await this.assignment(actor, id);

    return this.db.$transaction(async tx => {
      // 1. Check if a report already exists for this assignment (whether DRAFT, SUBMITTED, etc.)
      const existing = await tx.inspectionReport.findFirst({
        where: { assignmentId: id },
        orderBy: { revision: 'desc' },
        include: {
          answers: true,
          defects: true,
          media: true,
          parentReport: {
            select: {
              id: true,
              revision: true,
              status: true,
              reviewDecision: { select: { decision: true, reason: true, createdAt: true } },
            },
          },
        },
      });

      if (existing) {
        // If this is a rework revision whose media has not been copied from parent, copy now
        if (existing.media.length === 0 && existing.parentReportId) {
          const parentMedia = await tx.inspectionMedia.findMany({
            where: { reportId: existing.parentReportId },
          });
          if (parentMedia.length > 0) {
            await tx.inspectionMedia.createMany({
              data: parentMedia.map(m => ({
                reportId: existing.id,
                logicalMediaId: m.logicalMediaId,
                storageKey: m.storageKey,
                mimeType: m.mimeType,
                byteSize: m.byteSize,
                checksumSha256: m.checksumSha256,
                capturedAt: m.capturedAt,
              })),
            });
            existing.media = await tx.inspectionMedia.findMany({
              where: { reportId: existing.id },
            });
          }
        }

        // If this report belongs to the assignment and was reassigned to the current inspector,
        // synchronize inspectorId on the active draft so the assigned inspector has full ownership
        if (existing.inspectorId !== actor.userId && ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'].includes(existing.status)) {
          const updated = await tx.inspectionReport.update({
            where: { id: existing.id },
            data: { inspectorId: actor.userId },
            include: {
              answers: true,
              defects: true,
              media: true,
              parentReport: {
                select: {
                  id: true,
                  revision: true,
                  status: true,
                  reviewDecision: { select: { decision: true, reason: true, createdAt: true } },
                },
              },
            },
          });
          return updated;
        }
        return existing;
      }

      // 2. If no report exists yet, ensure the assignment is in a startable status
      if (!['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'].includes(assignment.status)) {
        throw new HttpError(409, 'INSPECTION_NOT_STARTABLE');
      }

      const template = currentTemplate();
      const report = await tx.inspectionReport.create({
        data: {
          requestId: assignment.request.id,
          assignmentId: id,
          inspectorId: actor.userId,
          revision: 1,
          templateKey: template.key,
          templateVersion: template.version,
          identity:
            assignment.request.lead.registrationNumber && !isInvalidRegNumberOrUuid(assignment.request.lead.registrationNumber)
              ? { registrationNumber: assignment.request.lead.registrationNumber.trim() }
              : {},
          startedAt: new Date(),
        },
        include: {
          answers: true,
          defects: true,
          media: true,
        },
      });

      await tx.inspectionAssignment.update({
        where: { id },
        data: { startedAt: new Date(), status: 'CONFIRMED' },
      });

      await tx.inspectionRequest.update({
        where: { id: assignment.request.id },
        data: { status: 'IN_PROGRESS' },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_STARTED',
          entityType: 'InspectionReport',
          entityId: report.id,
          details: { assignmentId: id, requestId: assignment.request.id, revision: report.revision },
        },
      });

      return report;
    });
  }

  async report(actor: InspectionActor, id: string) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');
    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id }
        : {
            id,
            OR: [
              { inspectorId: actor.userId },
              { assignment: { inspectorId: actor.userId } },
            ],
          },
      include: {
        answers: true,
        defects: true,
        media: true,
        reviewDecision: true,
        parentReport: {
          select: {
            id: true,
            revision: true,
            status: true,
            reviewDecision: { select: { decision: true, reason: true, createdAt: true } },
          },
        },
        assignment: { select: assignmentDetail },
      },
    });

    if (!report) throw new HttpError(404, 'INSPECTION_REPORT_NOT_FOUND');
    if (report.identity && typeof report.identity === 'object') {
      const iden = report.identity as Record<string, unknown>;
      if (typeof iden.registrationNumber === 'string' && isInvalidRegNumberOrUuid(iden.registrationNumber)) {
        iden.registrationNumber = '';
      }
    }
    return report;
  }

  async saveDraft(
    actor: InspectionActor,
    id: string,
    input: {
      recordVersion?: number;
      identity: Record<string, unknown>;
      answers: Array<{ itemKey: string; status: InspectionAnswerStatus; value?: unknown; notes?: string }>;
      defects: Array<{ category: string; severity: InspectionDefectSeverity; description: string; location?: string; photoUrl?: string }>;
    }
  ) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');

    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } }
        : {
            id,
            status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            OR: [
              { inspectorId: actor.userId },
              { assignment: { inspectorId: actor.userId } },
            ],
          },
    });

    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_EDITABLE');

    if (!templateFor(report.templateKey, report.templateVersion)) {
      throw new HttpError(409, 'INSPECTION_TEMPLATE_UNAVAILABLE');
    }

    if (input.answers.some(answer => !knownTemplateItem(report.templateKey, report.templateVersion, answer.itemKey))) {
      throw new HttpError(400, 'INSPECTION_TEMPLATE_ITEM_INVALID');
    }

    if (typeof input.recordVersion === 'number' && report.recordVersion !== input.recordVersion) {
      throw new HttpError(409, 'INSPECTION_REPORT_VERSION_CONFLICT');
    }

    const draftIdentity = { ...(input.identity || {}) } as Record<string, unknown>;
    if (typeof draftIdentity.registrationNumber === 'string' && isInvalidRegNumberOrUuid(draftIdentity.registrationNumber)) {
      draftIdentity.registrationNumber = '';
    }
    const defectPhotosMap = { ...((draftIdentity.defectPhotos as Record<string, string>) || {}) };
    input.defects.forEach((defect, idx) => {
      if (defect.photoUrl) {
        defectPhotosMap[String(idx)] = defect.photoUrl;
      }
    });
    draftIdentity.defectPhotos = defectPhotosMap;

    return this.db.$transaction(async tx => {
      await tx.inspectionAnswer.deleteMany({ where: { reportId: id } });
      await tx.inspectionDefect.deleteMany({ where: { reportId: id } });

      const updated = await tx.inspectionReport.update({
        where: { id },
        data: {
          identity: draftIdentity as Prisma.InputJsonValue,
          recordVersion: { increment: 1 },
          answers: {
            create: input.answers.map(answer => ({
              itemKey: answer.itemKey,
              status: answer.status,
              ...(answer.value === undefined
                ? {}
                : { value: answer.value === null ? Prisma.JsonNull : (answer.value as Prisma.InputJsonValue) }),
              notes: answer.notes,
            })),
          },
          defects: {
            create: input.defects.map(defect => ({
              category: defect.category,
              severity: defect.severity,
              description: defect.description,
              location: defect.location,
            })),
          },
        },
        include: { answers: true, defects: true },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_DRAFT_SAVED',
          entityType: 'InspectionReport',
          entityId: id,
          details: { revision: report.revision, answerCount: input.answers.length, defectCount: input.defects.length },
        },
      });

      return updated;
    });
  }

  template(actor: InspectionActor, key: string, version: number) {
    checkRole(actor, [...inspectorRoles, ...operationsRoles, ...reviewerRoles]);
    const template = templateFor(key, version);
    if (!template) throw new HttpError(404, 'INSPECTION_TEMPLATE_NOT_FOUND');
    return template;
  }

  async submit(actor: InspectionActor, id: string, recordVersion?: number) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');

    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } }
        : {
            id,
            status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            OR: [
              { inspectorId: actor.userId },
              { assignment: { inspectorId: actor.userId } },
            ],
          },
      include: {
        answers: true,
        defects: true,
        media: true,
        request: { include: { lead: true } },
      },
    });

    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_SUBMITTABLE');
    if (typeof recordVersion === 'number' && report.recordVersion !== recordVersion) {
      throw new HttpError(409, 'INSPECTION_REPORT_VERSION_CONFLICT');
    }

    const identity = (report.identity || {}) as Record<string, unknown>;
    const registrationNumber = typeof identity.registrationNumber === 'string' ? identity.registrationNumber.trim() : '';
    const odometerKm = typeof identity.odometerKm === 'number' ? identity.odometerKm : Number(identity.odometerKm);

    if (!registrationNumber || isInvalidRegNumberOrUuid(registrationNumber) || !Number.isFinite(odometerKm) || odometerKm <= 0) {
      throw new HttpError(400, 'INSPECTION_IDENTITY_INCOMPLETE');
    }

    const template = templateFor(report.templateKey, report.templateVersion);
    if (!template) throw new HttpError(409, 'INSPECTION_TEMPLATE_UNAVAILABLE');

    const fuelType = report.request.lead.fuelType;
    const answeredKeys = new Map(report.answers.map(a => [a.itemKey, a]));

    // Verify all applicable required template items are answered
    for (const item of template.items as InspectionTemplateItem[]) {
      if (!item.required) continue;
      if (!isItemApplicable(item, fuelType)) continue;

      const answer = answeredKeys.get(item.key);
      if (!answer) {
        throw new HttpError(400, `MISSING_REQUIRED_CHECK:${item.key}`);
      }

      // If marked NOT_TESTED or NOT_APPLICABLE, verify notes/reason was provided
      if (['NOT_TESTED', 'NOT_APPLICABLE'].includes(answer.status) && (!answer.notes || !answer.notes.trim())) {
        throw new HttpError(400, `REASON_REQUIRED_FOR_UNTESTED:${item.key}`);
      }
    }

    const submitted = await this.db.$transaction(async tx => {
      const updated = await tx.inspectionReport.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          recordVersion: { increment: 1 },
        },
      });

      await tx.inspectionAssignment.update({
        where: { id: report.assignmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await tx.inspectionRequest.update({
        where: { id: report.requestId },
        data: { status: 'COMPLETED' },
      });

      if (report.request?.leadId) {
        const leadUpdateData: Record<string, unknown> = { status: 'OFFER_PENDING' };
        if (registrationNumber) {
          leadUpdateData.registrationNumber = registrationNumber;
        }
        await tx.acquisitionLead.updateMany({
          where: {
            id: report.request.leadId,
            status: { in: ['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'] },
          },
          data: leadUpdateData as any,
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_REPORT_SUBMITTED',
          entityType: 'InspectionReport',
          entityId: id,
          details: { revision: report.revision, defectCount: report.defects.length, mediaCount: report.media.length },
        },
      });

      return updated;
    });

    // Notify the review queue AFTER the report is safely committed. Doing this inside the transaction meant one slow or
    // failing notification query (many reviewers x devices) aborted or timed out the whole submission (INTERNAL_ERROR).
    if (this.notificationService) {
      try {
        const vehicleTitle = `${report.request?.lead?.make || ''} ${report.request?.lead?.model || ''}`.trim() || 'Vehicle';
        const refCode = report.request?.lead?.referenceCode || id.slice(0, 8);
        await this.notificationService.dispatchDomainEvent({
          type: 'INSPECTION_REPORT_SUBMITTED',
          category: 'INSPECTION',
          priority: 'NORMAL',
          recipientRoles: ['INSPECTION_REVIEWER', 'REVIEWER', 'SUPER_ADMIN'],
          branchId: report.request?.branchId || undefined,
          title: `Report Submitted: ${vehicleTitle}`,
          body: `Inspector submitted report revision v${report.revision} for ${vehicleTitle} (${refCode}). Ready for verification.`,
          actionUrl: `/inspection-review?reportId=${id}`,
          referenceId: id,
          entityType: 'InspectionReport',
          metadata: { targetApp: 'REVIEW', reportId: id, revision: report.revision },
          emailTemplate: 'inspection-requested-v1',
          emailSubject: `Inspection Report Submitted for Review: ${vehicleTitle} [${refCode}]`,
          emailBody: `A completed inspection report revision v${report.revision} has been submitted for ${vehicleTitle} (${refCode}) and is awaiting verification in the review queue.

Please sign in to the Inspection Review Portal to examine the checklist, defect photos, and digital sign-off.`,
        });
      } catch (error) {
        console.warn('[INSPECTION_SUBMIT_NOTIFY_FAILED]', id, (error as Error)?.message);
      }
    }
    // Media lives in Cloudinary once submitted, so local fallback files can go (best effort, never blocks).
    void Promise.resolve()
      .then(() => this.mediaService.cleanupReportLocalMedia(id))
      .catch(err => console.warn('[LOCAL_MEDIA_CLEANUP_ON_SUBMIT_WARNING]', err));
    return submitted;
  }

  // --- Private Media Handling ---

  async initiateMediaUpload(
    actor: InspectionActor,
    reportId: string,
    input: { logicalMediaId: string; mimeType: string }
  ) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');
    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id: reportId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } }
        : {
            id: reportId,
            status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            OR: [
              { inspectorId: actor.userId },
              { assignment: { inspectorId: actor.userId } },
            ],
          },
    });
    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_EDITABLE');

    return {
      reportId,
      logicalMediaId: input.logicalMediaId,
      uploadUrl: `/api/v2/inspector/reports/${reportId}/media/${encodeURIComponent(input.logicalMediaId)}/upload`,
      maxSizeBytes: 15 * 1024 * 1024,
    };
  }

  async uploadMedia(
    actor: InspectionActor,
    reportId: string,
    logicalMediaId: string,
    buffer: Buffer,
    mimeType: string,
    clientChecksum?: string,
    capturedAt?: Date
  ) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');
    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id: reportId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } }
        : {
            id: reportId,
            status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            OR: [
              { inspectorId: actor.userId },
              { assignment: { inspectorId: actor.userId } },
            ],
          },
    });
    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_EDITABLE');

    const stored = await this.mediaService.storeMedia({
      reportId,
      logicalMediaId,
      buffer,
      mimeType,
      clientChecksum,
    });

    const media = await this.db.inspectionMedia.upsert({
      where: {
        reportId_logicalMediaId: { reportId, logicalMediaId },
      },
      create: {
        reportId,
        logicalMediaId,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        capturedAt: capturedAt || new Date(),
      },
      update: {
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        capturedAt: capturedAt || new Date(),
      },
    });

    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'INSPECTION_MEDIA_UPLOADED',
        entityType: 'InspectionMedia',
        entityId: media.id,
        details: { reportId, logicalMediaId, checksumSha256: stored.checksumSha256, byteSize: stored.byteSize },
      },
    });

    return media;
  }

  async readMediaContent(actor: InspectionActor, reportId: string, mediaId: string) {
    const report = await this.db.inspectionReport.findFirst({
      where: { id: reportId },
      include: { request: true },
    });
    if (!report) throw new HttpError(404, 'INSPECTION_REPORT_NOT_FOUND');

    const isAuthorInspector = report.inspectorId === actor.userId && actor.roles.includes('INSPECTOR');
    const isAuthorizedReviewer = actor.roles.some(r => reviewerRoles.includes(r)) &&
      (actor.roles.includes('SUPER_ADMIN') || (report.request.branchId ? actor.branchIds.includes(report.request.branchId) : true));

    if (!isAuthorInspector && !isAuthorizedReviewer) {
      throw new HttpError(403, 'MEDIA_ACCESS_DENIED');
    }

    const media = await this.db.inspectionMedia.findFirst({
      where: {
        reportId,
        OR: [{ id: mediaId }, { logicalMediaId: mediaId }],
      },
    });
    if (!media) throw new HttpError(404, 'MEDIA_NOT_FOUND');

    return this.mediaService.readMedia(media.storageKey);
  }

  // --- Operations Management ---

  async operationRequests(actor: InspectionActor) {
    checkRole(actor, operationsRoles);
    const requests = await this.db.inspectionRequest.findMany({
      where: actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            referenceCode: true,
            sellerName: true,
            sellerPhone: true,
            city: true,
            make: true,
            model: true,
            variant: true,
            manufacturingYear: true,
            registrationNumber: true,
            fuelType: true,
            transmission: true,
            color: true,
            registrationYear: true,
            registrationCity: true,
            ownershipCount: true,
            odometerKm: true,
            inspectionDate: true,
            inspectionTimeSlot: true,
            inspectionLocationType: true,
            inspectionAddress: true,
          },
        },
        assignment: {
          select: {
            id: true,
            status: true,
            inspectorId: true,
            scheduledAt: true,
            locationType: true,
            address: true,
            inspector: { select: { user: { select: { displayName: true, email: true } } } },
          },
        },
        reports: {
          select: {
            id: true,
            revision: true,
            status: true,
            identity: true,
            submittedAt: true,
          },
          orderBy: { revision: 'desc' },
        },
      },
    });

    return requests.map(r => {
      const latestReport = r.reports?.[0];
      const iden = (latestReport?.identity || {}) as Record<string, unknown>;
      const rawReportReg = typeof iden.registrationNumber === 'string' ? iden.registrationNumber.trim() : '';
      const reportReg = !isInvalidRegNumberOrUuid(rawReportReg) ? rawReportReg : '';
      const registrationNumber = r.lead.registrationNumber || reportReg || null;
      const variant = r.lead.variant || (iden.variant as string) || null;
      const color = r.lead.color || (iden.color as string) || null;
      const registrationYear = r.lead.registrationYear || (typeof iden.registrationYear === 'number' ? iden.registrationYear : null) || null;
      const registrationCity = r.lead.registrationCity || (iden.registrationCity as string) || r.lead.city || null;
      return {
        ...r,
        lead: {
          ...r.lead,
          registrationNumber,
          variant,
          color,
          registrationYear,
          registrationCity,
        },
      };
    });
  }

  async operationsDashboard(actor: InspectionActor) {
    checkRole(actor, operationsRoles);
    const requestScope = actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } };
    const stockScope = actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role)) ? {} : { branchId: { in: actor.branchIds } };

    const [
      unassigned,
      scheduled,
      inProgress,
      completed,
      docRequired,
      settlementReady,
      handoverReady,
      acqCompleted,
      acqOnHold,
      stkReceived,
      stkRefurbPending,
      stkInRefurb,
      stkQcPending,
      stkListingPrep,
      stkListingReady,
      stkListed,
      stkReserved,
      stkSold,
      pendingCostApprovals,
      recentEvents,
    ] = await Promise.all([
      this.db.inspectionRequest.count({ where: { ...requestScope, assignment: null, status: 'REQUESTED' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'SCHEDULED' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'IN_PROGRESS' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'COMPLETED' } }),
      this.db.acquisitionCase.count({ where: { status: 'DOCUMENTATION_REQUIRED' } }),
      this.db.acquisitionCase.count({ where: { status: 'SETTLEMENT_READY' } }),
      this.db.acquisitionCase.count({ where: { status: 'HANDOVER_READY' } }),
      this.db.acquisitionCase.count({ where: { status: 'COMPLETED' } }),
      this.db.acquisitionCase.count({ where: { status: 'ON_HOLD' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'RECEIVED' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'REFURBISHMENT_PENDING' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'IN_REFURBISHMENT' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'QC_PENDING' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'LISTING_PREPARATION' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'LISTING_READY' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'LISTED' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'RESERVED' } }),
      this.db.vehicleStockUnit.count({ where: { ...stockScope, status: 'SOLD' } }),
      this.db.refurbishmentCostApproval.count({ where: { status: 'PENDING' } }),
      this.db.auditEvent.findMany({
        where: {
          action: {
            in: [
              'INSPECTION_ASSIGNED', 'INSPECTION_RESCHEDULED', 'INSPECTION_COMPLETED',
              'ACQUISITION_CASE_CREATED', 'ACQUISITION_DOCUMENT_STATUS_UPDATED',
              'ACQUISITION_SETTLEMENT_STATUS_UPDATED', 'VEHICLE_HANDOVER_RECORDED',
              'ACQUISITION_COMPLETED', 'VEHICLE_STOCK_INWARD_CREATED',
              'REFURBISHMENT_WORK_ORDER_CREATED', 'REFURBISHMENT_COST_APPROVAL_DECIDED',
              'REFURBISHMENT_WORK_ORDER_COMPLETED', 'QUALITY_CONTROL_DECIDED',
              'VEHICLE_LISTING_PREPARED', 'VEHICLE_LISTING_PUBLISHED', 'VEHICLE_DELIVERED_TO_BUYER',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          details: true,
          createdAt: true,
          actor: { select: { email: true, displayName: true } },
        },
      }),
    ]);

    return {
      unassigned,
      scheduled,
      inProgress,
      completed,
      acquisitions: {
        documentationRequired: docRequired,
        settlementReady,
        handoverReady,
        completed: acqCompleted,
        onHold: acqOnHold,
      },
      stock: {
        received: stkReceived,
        refurbishmentPending: stkRefurbPending,
        inRefurbishment: stkInRefurb,
        qcPending: stkQcPending,
        listingPreparation: stkListingPrep,
        listingReady: stkListingReady,
        listed: stkListed,
        reserved: stkReserved,
        sold: stkSold,
      },
      refurbishment: {
        pendingCostApprovals,
      },
      recentEvents,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Best-effort hand-off notification to the next team (never fails the action that caused it). */
  private async notifyTeam(tx: Prisma.TransactionClient | PrismaClient, event: { type: any; roles: string[]; permissions?: string[]; title: string; body: string; actionUrl: string; referenceId: string; entityType: string; branchId?: string | null }) {
    if (!this.notificationService) return;
    await this.notificationService.dispatchDomainEvent({
      type: event.type,
      category: 'OPERATIONS',
      priority: 'NORMAL',
      recipientRoles: event.roles,
      recipientPermissions: event.permissions,
      branchId: event.branchId || undefined,
      title: event.title,
      body: event.body,
      actionUrl: event.actionUrl,
      referenceId: event.referenceId,
      entityType: event.entityType,
      metadata: { targetApp: 'OPS' },
    }, tx as Prisma.TransactionClient).catch(() => undefined);
  }

  private acquisitionCaseScope(actor: InspectionActor, id?: string): Prisma.AcquisitionCaseWhereInput {
    return {
      ...(id ? { id } : {}),
      ...(actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN')
        ? {}
        : { OR: [
            { lead: { inspectionRequests: { some: { branchId: { in: actor.branchIds } } } } },
            // Walk-in and manually entered leads have no inspection request; they belong to the branch that took them.
            { lead: { assignments: { some: { branchId: { in: actor.branchIds } } } } },
            { handover: { is: { branchId: { in: actor.branchIds } } } },
          ] }),
    };
  }

  async acquisitionCases(actor: InspectionActor) {
    checkRole(actor, operationsRoles);
    const cases = await this.db.acquisitionCase.findMany({
      where: this.acquisitionCaseScope(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        lead: { select: { id: true, referenceCode: true, sellerName: true, sellerPhone: true, city: true, make: true, model: true, variant: true, manufacturingYear: true, registrationNumber: true, fuelType: true, transmission: true, color: true, registrationYear: true, registrationCity: true, ownershipCount: true, odometerKm: true } },
        offer: {
          select: {
            id: true,
            offerAmountPaise: true,
            validUntil: true,
            acceptedAt: true,
            version: true,
            valuation: {
              select: {
                inspectionReport: {
                  select: { identity: true },
                },
              },
            },
          },
        },
        documents: { orderBy: { documentType: 'asc' } },
        settlement: true,
        handover: true,
        stockUnit: true,
      },
    });

    return cases.map(c => {
      const iden = (c.offer?.valuation?.inspectionReport?.identity || {}) as Record<string, unknown>;
      const rawReg = typeof iden.registrationNumber === 'string' ? iden.registrationNumber.trim() : '';
      const inspectionReg = !isInvalidRegNumberOrUuid(rawReg) ? rawReg : '';
      const resolvedReg = c.lead.registrationNumber || c.handover?.registrationNumber || inspectionReg || null;
      const resolvedVariant = c.lead.variant || (iden.variant as string) || null;
      const resolvedColor = c.lead.color || (iden.color as string) || null;
      const resolvedRegYear = c.lead.registrationYear || (typeof iden.registrationYear === 'number' ? iden.registrationYear : null) || null;
      const resolvedRegCity = c.lead.registrationCity || (iden.registrationCity as string) || c.lead.city || null;

      if (!c.lead.registrationNumber && resolvedReg) {
        void this.db.acquisitionLead.update({ where: { id: c.lead.id }, data: { registrationNumber: resolvedReg } }).catch(() => undefined);
      }
      return {
        ...c,
        lead: {
          ...c.lead,
          registrationNumber: resolvedReg,
          variant: resolvedVariant,
          color: resolvedColor,
          registrationYear: resolvedRegYear,
          registrationCity: resolvedRegCity,
        },
      };
    });
  }

  async updateAcquisitionDocument(actor: InspectionActor, caseId: string, input: { documentType: string; status: string; notes?: string; expectedVersion?: number }) {
    checkRole(actor, operationsRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({ where: this.acquisitionCaseScope(actor, caseId), select: { id: true, status: true } });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (['COMPLETED', 'CANCELLED'].includes(acquisitionCase.status)) throw new HttpError(409, 'ACQUISITION_CASE_NOT_ACTIONABLE');

    const outbox: Array<() => Promise<unknown>> = [];
    const __result = await this.db.$transaction(async tx => {
      const existing = await tx.acquisitionDocumentReview.findUnique({ where: { acquisitionCaseId_documentType: { acquisitionCaseId: caseId, documentType: input.documentType } } });
      if (!existing) {
        if (input.status !== 'REQUESTED') throw new HttpError(409, 'DOCUMENT_MUST_BE_REQUESTED_FIRST');
        const created = await tx.acquisitionDocumentReview.create({ data: { acquisitionCaseId: caseId, documentType: input.documentType, status: 'REQUESTED', notes: input.notes, reviewedByEmployeeId: actor.userId, reviewedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_DOCUMENT_REQUESTED', entityType: 'AcquisitionDocumentReview', entityId: created.id, details: { acquisitionCaseId: caseId, documentType: input.documentType } } });
        return created;
      }
      if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) throw new HttpError(409, 'DOCUMENT_VERSION_CONFLICT');
      const validTransitions = documentTransitions[existing.status] ?? [];
      if (!validTransitions.includes(input.status)) throw new HttpError(409, 'INVALID_DOCUMENT_TRANSITION');
      const updated = await tx.acquisitionDocumentReview.update({
        where: { id: existing.id },
        data: { status: input.status as never, notes: input.notes, reviewedByEmployeeId: actor.userId, reviewedAt: new Date(), version: { increment: 1 } },
      });
      const documents = await tx.acquisitionDocumentReview.findMany({ where: { acquisitionCaseId: caseId }, select: { status: true } });
      const documentsReady = documents.length > 0 && documents.every(document => documentTerminalStatuses.includes(document.status));
      let newlyReady = false;
      if (documentsReady) {
        newlyReady = acquisitionCase.status !== 'SETTLEMENT_READY';
        await tx.acquisitionCase.update({ where: { id: caseId }, data: { status: 'SETTLEMENT_READY', version: { increment: 1 } } });
      }
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_DOCUMENT_STATUS_UPDATED', entityType: 'AcquisitionDocumentReview', entityId: updated.id, details: { acquisitionCaseId: caseId, documentType: input.documentType, from: existing.status, to: input.status } } });
      if (newlyReady) {
        const lead = await tx.acquisitionCase.findUnique({ where: { id: caseId }, select: { lead: { select: { id: true, referenceCode: true, make: true, model: true } } } });
        // Finance is told the moment the last document is verified, so the payout can be prepared without waiting.
        if (lead) outbox.push(() => notifyReadyForPayment(this.notificationService, lead.lead, caseId).catch(() => undefined));
      }
      return updated;
    });
    for (const send of outbox) await send();
    return __result;
  }

  async updateAcquisitionSettlement(actor: InspectionActor, caseId: string, input: { status: string; transactionReference?: string; notes?: string; expectedVersion?: number }) {
    checkRole(actor, financeRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({
      where: this.acquisitionCaseScope(actor, caseId),
      include: { offer: { select: { offerAmountPaise: true } }, settlement: true },
    });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.status !== 'SETTLEMENT_READY' && input.status !== 'CANCELLED') throw new HttpError(409, 'DOCUMENTATION_NOT_READY');
    const allowed: Record<string, string[]> = { NOT_READY: ['READY_FOR_PAYMENT'], READY_FOR_PAYMENT: ['PAYMENT_PENDING', 'CANCELLED'], PAYMENT_PENDING: ['PAYMENT_VERIFIED', 'PAYMENT_FAILED'], PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'], PAYMENT_VERIFIED: [], CANCELLED: [] };
    const prior = acquisitionCase.settlement?.status || 'NOT_READY';
    const allowedTransitions = allowed[prior] ?? [];
    if (!allowedTransitions.includes(input.status)) throw new HttpError(409, 'INVALID_SETTLEMENT_TRANSITION');
    if (input.status === 'PAYMENT_VERIFIED' && !input.transactionReference?.trim()) throw new HttpError(400, 'PAYMENT_REFERENCE_REQUIRED');
    if (input.expectedVersion !== undefined && acquisitionCase.settlement && acquisitionCase.settlement.version !== input.expectedVersion) throw new HttpError(409, 'SETTLEMENT_VERSION_CONFLICT');

    return this.db.$transaction(async tx => {
      const settlement = await tx.acquisitionSettlement.upsert({
        where: { acquisitionCaseId: caseId },
        create: { acquisitionCaseId: caseId, status: input.status as never, approvedConsiderationPaise: acquisitionCase.offer.offerAmountPaise, transactionReference: input.transactionReference, notes: input.notes, verifiedByEmployeeId: input.status === 'PAYMENT_VERIFIED' ? actor.userId : null, verifiedAt: input.status === 'PAYMENT_VERIFIED' ? new Date() : null },
        update: { status: input.status as never, transactionReference: input.transactionReference, notes: input.notes, verifiedByEmployeeId: input.status === 'PAYMENT_VERIFIED' ? actor.userId : undefined, verifiedAt: input.status === 'PAYMENT_VERIFIED' ? new Date() : undefined, version: { increment: 1 } },
      });
      await tx.acquisitionCase.update({ where: { id: caseId }, data: { settlementStatus: input.status as never, version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_SETTLEMENT_STATUS_UPDATED', entityType: 'AcquisitionSettlement', entityId: settlement.id, details: { acquisitionCaseId: caseId, from: prior, to: input.status, transactionReference: input.status === 'PAYMENT_VERIFIED' ? input.transactionReference : undefined } } });
      return settlement;
    });
  }

  async recordVehicleHandover(actor: InspectionActor, caseId: string, input: { branchId?: string; status: string; location: string; observedAt: Date; registrationNumber?: string; odometerKm?: number; mainKeysReceived?: number; spareKeysReceived?: number; documentsReceived?: boolean; accessoriesNotes?: string; conditionNotes?: string; exceptionNotes?: string; expectedVersion?: number }) {
    checkRole(actor, operationsRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({
      where: this.acquisitionCaseScope(actor, caseId),
      include: {
        handover: true,
        stockUnit: true,
        documents: { select: { status: true } },
        offer: {
          select: {
            offerAmountPaise: true,
            valuation: {
              select: {
                inspectionReport: {
                  select: { identity: true },
                },
              },
            },
          },
        },
        lead: {
          select: {
            id: true,
            city: true,
            registrationNumber: true,
            make: true,
            model: true,
            variant: true,
            manufacturingYear: true,
            fuelType: true,
            transmission: true,
            odometerKm: true,
            color: true,
            registrationYear: true,
            registrationCity: true,
            ownershipCount: true,
          },
        },
      },
    });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.status === 'COMPLETED') throw new HttpError(409, 'ACQUISITION_CASE_COMPLETED');
    const documentsReady = acquisitionCase.documents.length > 0 && acquisitionCase.documents.every(document => documentTerminalStatuses.includes(document.status));
    if (input.status === 'RECEIVED' && (!documentsReady || acquisitionCase.settlementStatus !== 'PAYMENT_VERIFIED')) throw new HttpError(409, 'HANDOVER_PREREQUISITES_INCOMPLETE');
    if (input.status === 'RECEIVED' && !input.documentsReceived) throw new HttpError(409, 'HANDOVER_DOCUMENTS_REQUIRED');
    if (input.expectedVersion !== undefined && acquisitionCase.handover && acquisitionCase.handover.version !== input.expectedVersion) throw new HttpError(409, 'HANDOVER_VERSION_CONFLICT');

    // A confirmed physical handover is the stock-inward event. Previously the
    // case stopped at HANDOVER_READY and required two hidden manual actions,
    // leaving verified vehicles absent from inventory and the listing pipeline.
    const isAdmin = actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role));
    const branchId = input.branchId || acquisitionCase.handover?.branchId || (actor.branchIds.length === 1 ? actor.branchIds[0] : undefined);
    if (input.status === 'RECEIVED' && !branchId) throw new HttpError(400, 'HANDOVER_BRANCH_REQUIRED');
    if (branchId && !isAdmin && !actor.branchIds.includes(branchId)) throw new HttpError(403, 'HANDOVER_BRANCH_ACCESS_DENIED');
    const branch = branchId
      ? await this.db.branch.findFirst({ where: { id: branchId, active: true }, select: { id: true, name: true } })
      : null;
    if (input.status === 'RECEIVED' && !branch) throw new HttpError(400, 'INVALID_BRANCH');

    const outbox: Array<() => Promise<unknown>> = [];
    const __result = await this.db.$transaction(async tx => {
      const inspectionIdentity = (acquisitionCase.offer?.valuation?.inspectionReport?.identity || {}) as Record<string, unknown>;
      const rawInspectionReg = typeof inspectionIdentity.registrationNumber === 'string' ? inspectionIdentity.registrationNumber.trim() : '';
      const inspectionReg = !isInvalidRegNumberOrUuid(rawInspectionReg) ? rawInspectionReg : '';
      const resolvedReg = input.registrationNumber?.trim() || acquisitionCase.handover?.registrationNumber || acquisitionCase.lead.registrationNumber || inspectionReg || null;
      const resolvedVariant = acquisitionCase.lead.variant || (inspectionIdentity.variant as string) || null;
      const resolvedColor = acquisitionCase.lead.color || (inspectionIdentity.color as string) || null;
      const resolvedRegYear = acquisitionCase.lead.registrationYear || (typeof inspectionIdentity.registrationYear === 'number' ? inspectionIdentity.registrationYear : null) || null;
      const resolvedRegCity = acquisitionCase.lead.registrationCity || (inspectionIdentity.registrationCity as string) || acquisitionCase.lead.city || null;

      const leadUpdate: Record<string, unknown> = {};
      if (resolvedReg && !acquisitionCase.lead.registrationNumber) leadUpdate.registrationNumber = resolvedReg;
      if (resolvedVariant && !acquisitionCase.lead.variant) leadUpdate.variant = resolvedVariant;
      if (resolvedColor && !acquisitionCase.lead.color) leadUpdate.color = resolvedColor;
      if (resolvedRegYear && !acquisitionCase.lead.registrationYear) leadUpdate.registrationYear = resolvedRegYear;
      if (resolvedRegCity && !acquisitionCase.lead.registrationCity) leadUpdate.registrationCity = resolvedRegCity;
      if (Object.keys(leadUpdate).length > 0) {
        await tx.acquisitionLead.update({ where: { id: acquisitionCase.lead.id }, data: leadUpdate as any }).catch(() => undefined);
      }

      const handover = await tx.vehicleHandover.upsert({
        where: { acquisitionCaseId: caseId },
        create: { acquisitionCaseId: caseId, branchId, custodianEmployeeId: actor.userId, status: input.status as never, location: input.location, observedAt: input.observedAt, registrationNumber: resolvedReg || undefined, odometerKm: input.odometerKm, mainKeysReceived: input.mainKeysReceived || 0, spareKeysReceived: input.spareKeysReceived || 0, documentsReceived: input.documentsReceived || false, accessoriesNotes: input.accessoriesNotes, conditionNotes: input.conditionNotes, exceptionNotes: input.exceptionNotes },
        update: { branchId, custodianEmployeeId: actor.userId, status: input.status as never, location: input.location, observedAt: input.observedAt, registrationNumber: resolvedReg || undefined, odometerKm: input.odometerKm, mainKeysReceived: input.mainKeysReceived, spareKeysReceived: input.spareKeysReceived, documentsReceived: input.documentsReceived, accessoriesNotes: input.accessoriesNotes, conditionNotes: input.conditionNotes, exceptionNotes: input.exceptionNotes, version: { increment: 1 } },
      });
      const automaticallyCompleted = input.status === 'RECEIVED';
      await tx.acquisitionCase.update({
        where: { id: caseId },
        data: {
          custodyStatus: input.status as never,
          status: input.status === 'DISPUTED' || input.status === 'REJECTED' ? 'ON_HOLD' : automaticallyCompleted ? 'COMPLETED' : undefined,
          completedAt: automaticallyCompleted ? new Date() : undefined,
          completionNotes: automaticallyCompleted ? 'Completed automatically when payment-verified physical custody was recorded.' : undefined,
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'VEHICLE_HANDOVER_RECORDED', entityType: 'VehicleHandover', entityId: handover.id, details: { acquisitionCaseId: caseId, status: input.status, location: input.location } } });
      if (!automaticallyCompleted || acquisitionCase.stockUnit) return { handover, stockUnit: acquisitionCase.stockUnit, automaticallyCompleted };

      const stockCode = `VM-STK-${acquisitionCase.caseReference.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const stockUnit = await tx.vehicleStockUnit.create({
        data: {
          stockCode,
          acquisitionCaseId: caseId,
          branchId: branch!.id,
          receivedByEmployeeId: actor.userId,
          physicalLocation: input.location || branch!.name,
          registrationNumber: resolvedReg,
          make: acquisitionCase.lead.make,
          model: acquisitionCase.lead.model,
          variant: resolvedVariant,
          manufacturingYear: acquisitionCase.lead.manufacturingYear,
          fuelType: acquisitionCase.lead.fuelType,
          transmission: acquisitionCase.lead.transmission,
          odometerKm: input.odometerKm ?? acquisitionCase.handover?.odometerKm ?? acquisitionCase.lead.odometerKm,
          acquisitionCostPaise: acquisitionCase.offer.offerAmountPaise,
          notes: input.conditionNotes,
        },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_COMPLETED', entityType: 'AcquisitionCase', entityId: caseId, details: { automatic: true, reason: 'PAYMENT_VERIFIED_HANDOVER_RECEIVED' } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'VEHICLE_STOCK_INWARD_CREATED', entityType: 'VehicleStockUnit', entityId: stockUnit.id, details: { acquisitionCaseId: caseId, stockCode: stockUnit.stockCode, branchId: stockUnit.branchId, automatic: true } } });
      outbox.push(() => this.notifyTeam(this.db, {
        type: 'VEHICLE_STOCK_INWARD',
        roles: ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'LISTING_EXECUTIVE'],
        title: `Car received: ${acquisitionCase.lead.make} ${acquisitionCase.lead.model}`,
        body: `${acquisitionCase.lead.make} ${acquisitionCase.lead.model} (${stockCode}) is in stock at ${branch!.name}. Plan any repairs, then prepare the listing.`,
        actionUrl: '/operations?tab=inventory',
        referenceId: stockUnit.id,
        entityType: 'VehicleStockUnit',
        branchId: branch!.id,
      }));
      return { handover, stockUnit, automaticallyCompleted };
    });
    for (const send of outbox) await send();
    return __result;
  }

  async completeAcquisition(actor: InspectionActor, caseId: string, input: { expectedVersion: number; completionNotes?: string }) {
    checkRole(actor, operationsRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({ where: this.acquisitionCaseScope(actor, caseId), include: { documents: { select: { status: true } }, handover: true } });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.version !== input.expectedVersion) throw new HttpError(409, 'ACQUISITION_CASE_VERSION_CONFLICT');
    const documentsReady = acquisitionCase.documents.length > 0 && acquisitionCase.documents.every(document => documentTerminalStatuses.includes(document.status));
    if (!documentsReady || acquisitionCase.settlementStatus !== 'PAYMENT_VERIFIED' || acquisitionCase.custodyStatus !== 'RECEIVED' || !acquisitionCase.handover?.documentsReceived) throw new HttpError(409, 'ACQUISITION_COMPLETION_PREREQUISITES_INCOMPLETE');
    const completed = await this.db.$transaction(async tx => {
      const updated = await tx.acquisitionCase.update({ where: { id: caseId }, data: { status: 'COMPLETED', completedAt: new Date(), completionNotes: input.completionNotes, version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_COMPLETED', entityType: 'AcquisitionCase', entityId: caseId, details: { completionNotes: input.completionNotes } } });
      return updated;
    });
    return completed;
  }

  async stockInward(actor: InspectionActor, caseId: string, input: { branchId?: string; physicalLocation: string; notes?: string }) {
    checkRole(actor, operationsRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({
      where: this.acquisitionCaseScope(actor, caseId),
      include: {
        offer: {
          select: {
            offerAmountPaise: true,
            valuation: {
              select: {
                inspectionReport: {
                  select: { identity: true },
                },
              },
            },
          },
        },
        lead: {
          select: {
            id: true,
            city: true,
            registrationNumber: true,
            make: true,
            model: true,
            variant: true,
            manufacturingYear: true,
            fuelType: true,
            transmission: true,
            odometerKm: true,
            color: true,
            registrationYear: true,
            registrationCity: true,
            ownershipCount: true,
          },
        },
        handover: { select: { branchId: true, registrationNumber: true, odometerKm: true } },
      },
    });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.status !== 'COMPLETED') throw new HttpError(409, 'STOCK_INWARD_REQUIRES_COMPLETED_ACQUISITION');
    const isAdmin = actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role));
    const branchId = input.branchId || acquisitionCase.handover?.branchId || (actor.branchIds.length === 1 ? actor.branchIds[0] : undefined);
    if (!branchId) throw new HttpError(400, 'STOCK_BRANCH_REQUIRED');
    if (!isAdmin && !actor.branchIds.includes(branchId)) throw new HttpError(403, 'STOCK_BRANCH_ACCESS_DENIED');
    const branch = await this.db.branch.findFirst({ where: { id: branchId, active: true }, select: { id: true } });
    if (!branch) throw new HttpError(400, 'INVALID_BRANCH');
    const stockCode = `VM-STK-${acquisitionCase.caseReference.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const inspectionIdentity = (acquisitionCase.offer?.valuation?.inspectionReport?.identity || {}) as Record<string, unknown>;
    const inspectionReg = typeof inspectionIdentity.registrationNumber === 'string' ? inspectionIdentity.registrationNumber.trim() : '';
    const resolvedReg = acquisitionCase.handover?.registrationNumber || acquisitionCase.lead.registrationNumber || inspectionReg || null;
    const resolvedVariant = acquisitionCase.lead.variant || (inspectionIdentity.variant as string) || null;

    try {
      return await this.db.$transaction(async tx => {
        if (resolvedReg && !acquisitionCase.lead.registrationNumber) {
          await tx.acquisitionLead.update({ where: { id: acquisitionCase.lead.id }, data: { registrationNumber: resolvedReg } });
        }
        const stock = await tx.vehicleStockUnit.create({
          data: {
            stockCode,
            acquisitionCaseId: caseId,
            branchId,
            receivedByEmployeeId: actor.userId,
            physicalLocation: input.physicalLocation,
            registrationNumber: resolvedReg,
            make: acquisitionCase.lead.make,
            model: acquisitionCase.lead.model,
            variant: resolvedVariant,
            manufacturingYear: acquisitionCase.lead.manufacturingYear,
            fuelType: acquisitionCase.lead.fuelType,
            transmission: acquisitionCase.lead.transmission,
            odometerKm: acquisitionCase.handover?.odometerKm || acquisitionCase.lead.odometerKm,
            acquisitionCostPaise: acquisitionCase.offer.offerAmountPaise,
            notes: input.notes,
          },
        });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'VEHICLE_STOCK_INWARD_CREATED', entityType: 'VehicleStockUnit', entityId: stock.id, details: { acquisitionCaseId: caseId, stockCode: stock.stockCode, branchId: stock.branchId } } });
        return stock;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new HttpError(409, 'STOCK_INWARD_ALREADY_CREATED');
      throw error;
    }
  }

  async stockUnits(actor: InspectionActor) {
    await refreshMasterBodyTypes(this.db as any);
    checkRole(actor, stockReadRoles);
    const units = await this.db.vehicleStockUnit.findMany({
      where: this.stockScope(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        workOrders: {
          include: {
            costApproval: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        qualityControlReports: {
          orderBy: { createdAt: 'desc' },
        },
        vehicle: {
          include: {
            listing: {
              include: {
                media: {
                  orderBy: { displayOrder: 'asc' },
                },
              },
            },
          },
        },
        acquisitionCase: {
          select: {
            id: true,
            caseReference: true,
            status: true,
            settlementStatus: true,
            custodyStatus: true,
            handover: {
              select: { registrationNumber: true, location: true, odometerKm: true },
            },
            offer: {
              select: {
                valuation: {
                  select: {
                    inspectionReport: {
                      select: { identity: true },
                    },
                  },
                },
              },
            },
            lead: {
              select: {
                id: true,
                referenceCode: true,
                sellerName: true,
                sellerPhone: true,
                city: true,
                registrationNumber: true,
                variant: true,
                color: true,
                registrationYear: true,
                registrationCity: true,
                ownershipCount: true,
              },
            },
          },
        },
      },
    });

    const soldUnitIds = units.filter(u => u.status === 'SOLD').map(u => u.id);
    const deliveryEvents = soldUnitIds.length > 0
      ? await this.db.auditEvent.findMany({
          where: { entityType: 'VehicleStockUnit', entityId: { in: soldUnitIds }, action: 'VEHICLE_DELIVERED_TO_BUYER' },
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { displayName: true, email: true } } },
        })
      : [];
    const deliveryMap = new Map(deliveryEvents.map(e => [e.entityId, e]));

    return units.map(u => {
      const lead = u.acquisitionCase?.lead;
      const handover = u.acquisitionCase?.handover;
      const inspectionIdentity = (u.acquisitionCase?.offer?.valuation?.inspectionReport?.identity || {}) as Record<string, unknown>;
      const inspectionReg = typeof inspectionIdentity.registrationNumber === 'string' ? inspectionIdentity.registrationNumber.trim() : '';
      const registrationNumber = u.registrationNumber || handover?.registrationNumber || lead?.registrationNumber || inspectionReg || null;
      const variant = u.variant || u.vehicle?.variant || lead?.variant || (inspectionIdentity.variant as string) || null;
      const color = u.vehicle?.color || (lead as any)?.color || (inspectionIdentity.color as string) || null;
      const registrationYear = u.vehicle?.registrationYear || (lead as any)?.registrationYear || null;
      const registrationCity = u.vehicle?.city || (lead as any)?.registrationCity || (lead as any)?.city || null;
      const ownershipCount = u.vehicle?.ownershipCount || (lead as any)?.ownershipCount || null;
      // Shown in the Operations stock list; falls back to the catalogue so older stock is never blank.
      const bodyType = u.vehicle?.bodyType || inferBodyType(u.make, u.model);
      // What the listing still lacks (the price is set when publishing, so it is not counted here).
      const gaps = listingGaps({
        title: u.vehicle?.listing?.title,
        photoCount: u.vehicle?.listing?.media?.length ?? 0,
        color,
        registrationNumber,
        conditionSummary: u.vehicle?.conditionSummary,
        branchId: u.branchId,
      });

      // Self-heal: If database record had null registrationNumber or variant, persist resolved fields asynchronously
      if (!u.registrationNumber && registrationNumber) {
        void this.db.vehicleStockUnit.update({ where: { id: u.id }, data: { registrationNumber } }).catch(() => undefined);
      }
      if (!u.variant && variant) {
        void this.db.vehicleStockUnit.update({ where: { id: u.id }, data: { variant } }).catch(() => undefined);
      }

      const deliveryEvent = deliveryMap.get(u.id);
      const deliveryRecord = deliveryEvent ? {
        buyerName: (deliveryEvent.details as any)?.buyerName || 'N/A',
        buyerPhone: (deliveryEvent.details as any)?.buyerPhone || 'N/A',
        odometerKm: (deliveryEvent.details as any)?.odometerKm ?? u.odometerKm,
        deliveredAt: deliveryEvent.createdAt,
        deliveredBy: deliveryEvent.actor?.displayName || deliveryEvent.actor?.email || 'Operations Staff',
      } : null;
      return {
        ...u,
        registrationNumber,
        variant,
        bodyType,
        listingGaps: gaps,
        color,
        registrationYear,
        registrationCity,
        ownershipCount,
        deliveryRecord,
      };
    });
  }

  async updateStockVehicleSpecs(actor: InspectionActor, stockId: string, input: { registrationNumber?: string; variant?: string; bodyType?: string; color?: string; odometerKm?: number }) {
    await refreshMasterBodyTypes(this.db as any);
    checkRole(actor, operationsRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      include: { acquisitionCase: { select: { leadId: true } }, vehicle: { select: { id: true, bodyType: true } } },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');

    return this.db.$transaction(async tx => {
      const reg = input.registrationNumber?.trim().toUpperCase();
      const updatedStock = await tx.vehicleStockUnit.update({
        where: { id: stockId },
        data: {
          ...(reg !== undefined ? { registrationNumber: reg || null } : {}),
          ...(input.variant !== undefined ? { variant: input.variant.trim() || null } : {}),
          ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
        },
      });

      if (stock.vehicle?.id) {
        await tx.vehicle.update({
          where: { id: stock.vehicle.id },
          data: {
            ...(input.variant?.trim() ? { variant: input.variant.trim() } : {}),
            ...(input.color !== undefined ? { color: input.color.trim() || null } : {}),
            ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
            // A blank choice means "work it out from the model"; an explicit choice always wins.
            ...(input.bodyType !== undefined || !stock.vehicle.bodyType
              ? { bodyType: resolveBodyType({ bodyType: input.bodyType, make: stock.make, model: stock.model }) }
              : {}),
          },
        }).catch(() => undefined);
      }

      if (stock.acquisitionCase?.leadId) {
        await tx.acquisitionLead.update({
          where: { id: stock.acquisitionCase.leadId },
          data: {
            ...(reg !== undefined ? { registrationNumber: reg || null } : {}),
            ...(input.variant !== undefined ? { variant: input.variant.trim() || null } : {}),
            ...(input.color !== undefined ? { color: input.color.trim() || null } : {}),
            ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
          },
        }).catch(() => undefined);
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_STOCK_SPECS_UPDATED',
          entityType: 'VehicleStockUnit',
          entityId: stockId,
          details: { stockCode: stock.stockCode, ...input },
        },
      });

      return updatedStock;
    });
  }

  private stockScope(actor: InspectionActor, id?: string): Prisma.VehicleStockUnitWhereInput {
    return {
      ...(id ? { id } : {}),
      ...(actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role)) ? {} : {
        OR: [
          { branchId: { in: actor.branchIds } },
          { branchId: null, receivedByEmployeeId: actor.userId },
        ],
      }),
    };
  }

  async createWorkOrder(actor: InspectionActor, stockId: string, input: { category: string; requiredAction: string; assignedProvider?: string; estimatedCostPaise?: bigint; notes?: string }) {
    checkRole(actor, inventoryRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({ where: this.stockScope(actor, stockId), select: { id: true, status: true } });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (!['RECEIVED', 'REFURBISHMENT_PENDING', 'IN_REFURBISHMENT'].includes(stock.status)) throw new HttpError(409, 'STOCK_NOT_REFURBISHMENT_ELIGIBLE');
    return this.db.$transaction(async tx => {
      const workOrder = await tx.refurbishmentWorkOrder.create({ data: { stockUnitId: stockId, createdByEmployeeId: actor.userId, category: input.category, requiredAction: input.requiredAction, assignedProvider: input.assignedProvider, estimatedCostPaise: input.estimatedCostPaise, notes: input.notes } });
      await tx.vehicleStockUnit.update({ where: { id: stockId }, data: { status: 'REFURBISHMENT_PENDING', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_WORK_ORDER_CREATED', entityType: 'RefurbishmentWorkOrder', entityId: workOrder.id, details: { stockUnitId: stockId, category: input.category, estimatedCostPaise: input.estimatedCostPaise?.toString() } } });
      return workOrder;
    });
  }

  async submitWorkOrderCost(actor: InspectionActor, workOrderId: string, input: { expectedVersion: number; estimatedCostPaise: bigint; reason: string }) {
    checkRole(actor, inventoryRoles);
    const workOrder = await this.db.refurbishmentWorkOrder.findFirst({ where: { id: workOrderId, stockUnit: this.stockScope(actor) }, include: { costApproval: true } });
    if (!workOrder) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');
    if (workOrder.version !== input.expectedVersion) throw new HttpError(409, 'WORK_ORDER_VERSION_CONFLICT');
    if (workOrder.status !== 'DRAFT') throw new HttpError(409, 'WORK_ORDER_NOT_SUBMITTABLE');
    const outbox: Array<() => Promise<unknown>> = [];
    const approval = await this.db.$transaction(async tx => {
      // Use upsert so that re-submission after a REJECTED cost approval replaces the old record
      const created = await tx.refurbishmentCostApproval.upsert({
        where: { workOrderId },
        create: { workOrderId, requestedByEmployeeId: actor.userId, reason: input.reason },
        update: {
          requestedByEmployeeId: actor.userId,
          reason: input.reason,
          status: 'PENDING',
          decidedByEmployeeId: null,
          decidedAt: null,
          version: { increment: 1 },
        },
      });
      await tx.refurbishmentWorkOrder.update({ where: { id: workOrderId }, data: { estimatedCostPaise: input.estimatedCostPaise, status: 'PENDING_COST_APPROVAL', version: { increment: 1 } } });
      outbox.push(() => this.notifyTeam(this.db, { type: 'REFURBISHMENT_COST_APPROVAL_REQUESTED', roles: ['PRICING_APPROVER', 'ADMIN'], title: 'Repair cost needs approval', body: `A repair estimate of ₹${Number(input.estimatedCostPaise / 100n).toLocaleString('en-IN')} is waiting for approval: ${input.reason}`, actionUrl: '/operations?tab=refurbishment', referenceId: workOrderId, entityType: 'RefurbishmentWorkOrder' }));
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_COST_APPROVAL_REQUESTED', entityType: 'RefurbishmentCostApproval', entityId: created.id, details: { workOrderId, estimatedCostPaise: input.estimatedCostPaise.toString() } } });
      return created;
    });
    for (const send of outbox) await send();
    return approval;
  }

  async decideWorkOrderCost(actor: InspectionActor, workOrderId: string, input: { expectedVersion: number; decision: 'APPROVE' | 'REJECT'; reason: string }) {
    checkRole(actor, costApproverRoles);
    const workOrder = await this.db.refurbishmentWorkOrder.findFirst({ where: { id: workOrderId, stockUnit: this.stockScope(actor) }, include: { costApproval: true } });
    if (!workOrder?.costApproval) throw new HttpError(404, 'COST_APPROVAL_NOT_FOUND');
    if (workOrder.costApproval.version !== input.expectedVersion) throw new HttpError(409, 'COST_APPROVAL_VERSION_CONFLICT');
    if (workOrder.costApproval.status !== 'PENDING') throw new HttpError(409, 'COST_APPROVAL_NOT_PENDING');
    if (workOrder.costApproval.requestedByEmployeeId === actor.userId) throw new HttpError(403, 'COST_SELF_APPROVAL_DENIED');
    return this.db.$transaction(async tx => {
      const approval = await tx.refurbishmentCostApproval.update({ where: { id: workOrder.costApproval!.id }, data: { status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedByEmployeeId: actor.userId, decidedAt: new Date(), reason: input.reason, version: { increment: 1 } } });
      await tx.refurbishmentWorkOrder.update({ where: { id: workOrderId }, data: { status: input.decision === 'APPROVE' ? 'APPROVED' : 'DRAFT', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_COST_APPROVAL_DECIDED', entityType: 'RefurbishmentCostApproval', entityId: approval.id, details: { workOrderId, decision: input.decision } } });
      return approval;
    });
  }

  async startWorkOrder(actor: InspectionActor, workOrderId: string, expectedVersion: number) {
    checkRole(actor, inventoryRoles);
    const workOrder = await this.db.refurbishmentWorkOrder.findFirst({ where: { id: workOrderId, stockUnit: this.stockScope(actor) } });
    if (!workOrder) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');
    if (workOrder.version !== expectedVersion) throw new HttpError(409, 'WORK_ORDER_VERSION_CONFLICT');
    if (workOrder.status !== 'APPROVED') throw new HttpError(409, 'WORK_ORDER_NOT_APPROVED');
    return this.db.$transaction(async tx => {
      const updated = await tx.refurbishmentWorkOrder.update({ where: { id: workOrderId }, data: { status: 'IN_PROGRESS', startedAt: new Date(), version: { increment: 1 } } });
      await tx.vehicleStockUnit.update({ where: { id: workOrder.stockUnitId }, data: { status: 'IN_REFURBISHMENT', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_WORK_ORDER_STARTED', entityType: 'RefurbishmentWorkOrder', entityId: workOrderId, details: { stockUnitId: workOrder.stockUnitId } } });
      return updated;
    });
  }

  async completeWorkOrder(actor: InspectionActor, workOrderId: string, input: { expectedVersion: number; actualCostPaise?: bigint; notes?: string }) {
    checkRole(actor, inventoryRoles);
    const workOrder = await this.db.refurbishmentWorkOrder.findFirst({ where: { id: workOrderId, stockUnit: this.stockScope(actor) } });
    if (!workOrder) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');
    if (workOrder.version !== input.expectedVersion) throw new HttpError(409, 'WORK_ORDER_VERSION_CONFLICT');
    if (workOrder.status !== 'IN_PROGRESS') throw new HttpError(409, 'WORK_ORDER_NOT_IN_PROGRESS');
    return this.db.$transaction(async tx => {
      const updated = await tx.refurbishmentWorkOrder.update({ where: { id: workOrderId }, data: { status: 'COMPLETED', actualCostPaise: input.actualCostPaise, notes: input.notes, completedAt: new Date(), version: { increment: 1 } } });
      await tx.vehicleStockUnit.update({ where: { id: workOrder.stockUnitId }, data: { status: 'QC_PENDING', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_WORK_ORDER_COMPLETED', entityType: 'RefurbishmentWorkOrder', entityId: workOrderId, details: { stockUnitId: workOrder.stockUnitId, actualCostPaise: input.actualCostPaise?.toString() } } });
      return updated;
    });
  }

  async startQualityControl(actor: InspectionActor, stockId: string, input: { workOrderId?: string; findings?: string; evidenceNotes?: string }) {
    checkRole(actor, qcRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      select: {
        id: true,
        status: true,
        workOrders: { select: { id: true, status: true, createdByEmployeeId: true } },
        qualityControlReports: { select: { status: true } },
      },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    const hasCompletedWorkOrder = stock.workOrders.some(workOrder => workOrder.status === 'COMPLETED');
    const hasPassedQualityControl = stock.qualityControlReports.some(report => report.status === 'PASSED');
    const hasQualityControlInProgress = stock.qualityControlReports.some(report => report.status === 'IN_PROGRESS');
    const receivedWithoutRepair = stock.status === 'RECEIVED' && stock.workOrders.length === 0;
    // A completed repair without a passing QC report must be actionable from
    // the QC queue, whatever non-terminal workflow state an older/manual
    // transition left it in. Keep published/reserved/sold/retired stock out.
    const isRecoverableStaleStatus =
      !['LISTED', 'RESERVED', 'SOLD', 'RETIRED'].includes(stock.status) &&
      hasCompletedWorkOrder &&
      !hasPassedQualityControl;
    if (hasQualityControlInProgress) throw new HttpError(409, 'QC_ALREADY_IN_PROGRESS');
    if (stock.status !== 'QC_PENDING' && !isRecoverableStaleStatus && !receivedWithoutRepair) throw new HttpError(409, 'STOCK_NOT_QC_ELIGIBLE');
    const selectedWorkOrderId = input.workOrderId || stock.workOrders.find(workOrder => workOrder.status === 'COMPLETED')?.id;
    const workOrder = selectedWorkOrderId ? await this.db.refurbishmentWorkOrder.findFirst({ where: { id: selectedWorkOrderId, stockUnitId: stockId } }) : null;
    if (input.workOrderId && !workOrder) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');
    if (workOrder && workOrder.status !== 'COMPLETED') throw new HttpError(409, 'WORK_ORDER_NOT_COMPLETED');
    if (workOrder?.createdByEmployeeId === actor.userId) throw new HttpError(403, 'QC_SELF_REVIEW_DENIED');
    return this.db.$transaction(async tx => {
      if (isRecoverableStaleStatus || receivedWithoutRepair) {
        await tx.vehicleStockUnit.update({ where: { id: stockId }, data: { status: 'QC_PENDING', version: { increment: 1 } } });
      }
      const report = await tx.qualityControlReport.create({ data: { stockUnitId: stockId, workOrderId: selectedWorkOrderId, reviewerEmployeeId: actor.userId, status: 'IN_PROGRESS', findings: input.findings, evidenceNotes: input.evidenceNotes } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'QUALITY_CONTROL_STARTED', entityType: 'QualityControlReport', entityId: report.id, details: { stockUnitId: stockId, workOrderId: selectedWorkOrderId, restoredFromStaleStatus: isRecoverableStaleStatus, receivedWithoutRepair } } });
      return report;
    });
  }

  async decideQualityControl(actor: InspectionActor, reportId: string, input: { expectedVersion: number; decision: 'PASS' | 'REWORK_REQUIRED' | 'FAIL'; findings?: string; evidenceNotes?: string }) {
    checkRole(actor, qcRoles);
    const report = await this.db.qualityControlReport.findFirst({ where: { id: reportId, stockUnit: this.stockScope(actor) }, include: { workOrder: true } });
    if (!report) throw new HttpError(404, 'QUALITY_CONTROL_REPORT_NOT_FOUND');
    if (report.reviewerEmployeeId !== actor.userId && !actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role))) throw new HttpError(403, 'QC_REPORT_OWNER_REQUIRED');
    if (report.workOrder?.createdByEmployeeId === actor.userId) throw new HttpError(403, 'QC_SELF_REVIEW_DENIED');
    if (report.version !== input.expectedVersion) throw new HttpError(409, 'QC_VERSION_CONFLICT');
    if (report.status !== 'IN_PROGRESS') throw new HttpError(409, 'QC_NOT_IN_PROGRESS');
    const status = input.decision === 'PASS' ? 'PASSED' : input.decision === 'REWORK_REQUIRED' ? 'REWORK_REQUIRED' : 'FAILED';
    const outbox: Array<() => Promise<unknown>> = [];
    const __result = await this.db.$transaction(async tx => {
      const updated = await tx.qualityControlReport.update({ where: { id: reportId }, data: { status, findings: input.findings, evidenceNotes: input.evidenceNotes, reviewedAt: new Date(), version: { increment: 1 } } });
      await tx.vehicleStockUnit.update({ where: { id: report.stockUnitId }, data: { status: status === 'PASSED' ? 'LISTING_PREPARATION' : status === 'REWORK_REQUIRED' ? 'REFURBISHMENT_PENDING' : 'ON_HOLD', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'QUALITY_CONTROL_DECIDED', entityType: 'QualityControlReport', entityId: reportId, details: { stockUnitId: report.stockUnitId, decision: input.decision } } });
      if (status === 'PASSED') {
        outbox.push(() => this.notifyTeam(this.db, { type: 'VEHICLE_QC_PASSED', roles: ['LISTING_EXECUTIVE', 'OPERATIONS_MANAGER'], title: 'Quality check passed', body: 'A car passed quality control and is ready for its listing details and photos.', actionUrl: '/operations?tab=studio', referenceId: report.stockUnitId, entityType: 'VehicleStockUnit' }));
      } else if (status === 'REWORK_REQUIRED') {
        outbox.push(() => this.notifyTeam(this.db, { type: 'VEHICLE_QC_PASSED', roles: ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER'], title: 'Quality check: rework needed', body: 'A car failed quality control and needs more work before it can be listed.', actionUrl: '/operations?tab=refurbishment', referenceId: report.stockUnitId, entityType: 'VehicleStockUnit' }));
      }
      return updated;
    });
    for (const send of outbox) await send();
    return __result;
  }

  async getBranches(actor: InspectionActor) {
    checkRole(actor, stockReadRoles);
    const isAdmin = actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role));
    return this.db.branch.findMany({
      where: { active: true, ...(isAdmin ? {} : { id: { in: actor.branchIds } }) },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        address: true,
        active: true,
      },
    });
  }

  async prepareListing(actor: InspectionActor, stockId: string, input: {
    title: string;
    bodyType?: string;
    features?: string[];
    color?: string;
    conditionSummary?: string;
    inspectionSummary?: string;
    verifiedTags?: string[];
    mediaUrls?: string[];
    branchId?: string;
    expectedVersion: number;
  }) {
    await refreshMasterBodyTypes(this.db as any);
    checkRole(actor, listingRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      include: { vehicle: true, branch: true, workOrders: true, qualityControlReports: true, acquisitionCase: { include: { lead: true } } },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (stock.version !== input.expectedVersion) throw new HttpError(409, 'STOCK_VERSION_CONFLICT');
    if (!['LISTING_PREPARATION', 'LISTING_READY'].includes(stock.status)) {
      throw new HttpError(409, 'STOCK_NOT_IN_LISTING_PREPARATION');
    }

    const approvedInspection = stock.acquisitionCase?.lead
      ? await this.db.inspectionReport.findFirst({
          where: { request: { leadId: stock.acquisitionCase.lead.id }, status: 'APPROVED' },
          orderBy: { reviewedAt: 'desc' }, include: { answers: true, defects: true, media: true },
        })
      : null;
    const completedWork = stock.workOrders.filter(workOrder => workOrder.status === 'COMPLETED');
    const passedQc = stock.qualityControlReports.find(report => report.status === 'PASSED');

    const inspectionIdentity = (approvedInspection?.identity || {}) as Record<string, unknown>;
    const rawInspectionReg = typeof inspectionIdentity.registrationNumber === 'string' ? inspectionIdentity.registrationNumber.trim() : '';
    const inspectionReg = !isInvalidRegNumberOrUuid(rawInspectionReg) ? rawInspectionReg : '';

    const resolvedReg = stock.registrationNumber || stock.acquisitionCase?.lead?.registrationNumber || inspectionReg || null;
    const resolvedVariant = stock.variant || stock.acquisitionCase?.lead?.variant || (inspectionIdentity.variant as string) || null;
    const resolvedColor = input.color || stock.vehicle?.color || stock.acquisitionCase?.lead?.color || (inspectionIdentity.color as string) || null;
    const resolvedRegYear = stock.acquisitionCase?.lead?.registrationYear || (typeof inspectionIdentity.registrationYear === 'number' ? inspectionIdentity.registrationYear : null) || null;
    const resolvedRegCity = stock.acquisitionCase?.lead?.registrationCity || (inspectionIdentity.registrationCity as string) || stock.acquisitionCase?.lead?.city || null;
    const resolvedOwnership = stock.acquisitionCase?.lead?.ownershipCount || (typeof inspectionIdentity.ownershipCount === 'number' ? inspectionIdentity.ownershipCount : null) || null;

    const customerProfile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      basicInformation: {
        registrationNumber: resolvedReg,
        manufacturingYear: stock.manufacturingYear,
        odometerKm: stock.odometerKm,
        fuelType: stock.fuelType,
        transmission: stock.transmission,
        variant: resolvedVariant,
        model: stock.model,
        make: stock.make,
        registrationYear: resolvedRegYear,
        registrationCity: resolvedRegCity,
        ownershipCount: resolvedOwnership,
      },
      specifications: {
        color: resolvedColor,
        bodyType: stock.vehicle?.bodyType || null,
        engineCapacityCc: stock.vehicle?.engineCapacityCc || null,
      },
      topFeatures: input.features || stock.vehicle?.features || [],
      qualityReport: approvedInspection ? {
        source: 'APPROVED_INSPECTION', inspectedAt: approvedInspection.reviewedAt?.toISOString() || approvedInspection.submittedAt?.toISOString() || null,
        overallStatus: 'PASSED', totalChecksCount: approvedInspection.answers.length, passedChecksCount: approvedInspection.answers.filter(answer => answer.status === 'PASS').length,
        defects: approvedInspection.defects.map((defect, idx) => {
          const reportIdentity = (approvedInspection.identity as Record<string, unknown>) || {};
          const defectPhotos = (reportIdentity.defectPhotos as Record<string, string>) || {};
          const photoUrl =
            defectPhotos[String(idx)] ||
            defectPhotos[defect.id] ||
            approvedInspection.media.find(m => m.logicalMediaId === `defect_${idx}` || m.logicalMediaId === `defect_${defect.id}` || m.logicalMediaId.startsWith('defect_'))?.storageKey ||
            '';
          return {
            category: defect.category,
            severity: defect.severity,
            description: defect.description,
            location: defect.location,
            photoUrl,
          };
        }),
        evidence: approvedInspection.media.map(media => ({ mimeType: media.mimeType, url: media.storageKey })),
        summary: input.inspectionSummary || stock.vehicle?.inspectionSummary || null,
      } : null,
      refurbishment: completedWork.map(workOrder => ({ category: workOrder.category, action: workOrder.requiredAction, completedAt: workOrder.completedAt?.toISOString() || null, notes: workOrder.notes || null })),
      qualityControl: passedQc ? { status: 'PASSED', findings: passedQc.findings || null, evidenceNotes: passedQc.evidenceNotes || null, reviewedAt: passedQc.reviewedAt?.toISOString() || null } : null,
      customerConditionSummary: input.conditionSummary || stock.vehicle?.conditionSummary || null,
    };

    let branchId = input.branchId || stock.branchId;
    let branchName = stock.branch?.name;
    let branchCity = stock.branch?.city;
    if (input.branchId && input.branchId !== stock.branchId) {
      const selectedBranch = await this.db.branch.findFirst({ where: { id: input.branchId, active: true } });
      if (!selectedBranch) throw new HttpError(400, 'INVALID_BRANCH');
      branchId = selectedBranch.id;
      branchName = selectedBranch.name;
      branchCity = selectedBranch.city;
    }

    const outbox: Array<() => Promise<unknown>> = [];
    const __result = await this.db.$transaction(async tx => {
      let vehicleId = stock.vehicleId;
      const vehicleCity = branchCity || stock.branch?.city || stock.acquisitionCase?.lead?.city || (stock.physicalLocation?.includes('Bengaluru') ? 'Bengaluru' : stock.physicalLocation) || 'Bengaluru';
      if (!vehicleId) {
        const createdVehicle = await tx.vehicle.create({
          data: {
            make: stock.make,
            model: stock.model,
            variant: resolvedVariant || '',
            manufacturingYear: stock.manufacturingYear,
            fuelType: stock.fuelType,
            transmission: stock.transmission,
            odometerKm: stock.odometerKm,
            city: vehicleCity,
            color: resolvedColor,
            registrationYear: resolvedRegYear,
            bodyType: resolveBodyType({ bodyType: input.bodyType, make: stock.make, model: stock.model }),
            ownershipCount: resolvedOwnership,
            conditionSummary: input.conditionSummary,
            inspectionSummary: input.inspectionSummary,
            features: input.features || [],
            verifiedTags: input.verifiedTags || ['V MOTIV Certified', '150-Point Inspected'],
          },
        });
        vehicleId = createdVehicle.id;
        await tx.vehicleStockUnit.update({
          where: { id: stockId },
          data: {
            vehicleId,
            branchId: branchId || undefined,
            physicalLocation: branchName || undefined,
            registrationNumber: resolvedReg || undefined,
            variant: resolvedVariant || undefined,
            status: 'LISTING_READY',
            version: { increment: 1 },
          },
        });
      } else {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: {
            city: vehicleCity,
            color: resolvedColor || undefined,
            registrationYear: resolvedRegYear || undefined,
            // Keep an existing value unless staff chose one; otherwise fill it from the make and model.
            bodyType: resolveBodyType({ bodyType: input.bodyType, make: stock.make, model: stock.model }) ?? stock.vehicle?.bodyType ?? undefined,
            ownershipCount: resolvedOwnership || undefined,
            variant: resolvedVariant || undefined,
            conditionSummary: input.conditionSummary,
            inspectionSummary: input.inspectionSummary,
            features: input.features || [],
            verifiedTags: input.verifiedTags || ['V MOTIV Certified', '150-Point Inspected'],
          },
        });
        await tx.vehicleStockUnit.update({
          where: { id: stockId },
          data: {
            branchId: branchId || undefined,
            physicalLocation: branchName || undefined,
            registrationNumber: resolvedReg || undefined,
            variant: resolvedVariant || undefined,
            status: 'LISTING_READY',
            version: { increment: 1 },
          },
        });
      }

      if (resolvedReg && stock.acquisitionCase?.lead?.id && !stock.acquisitionCase.lead.registrationNumber) {
        await tx.acquisitionLead.update({
          where: { id: stock.acquisitionCase.lead.id },
          data: { registrationNumber: resolvedReg },
        }).catch(() => undefined);
      }

      const listing = await tx.vehicleListing.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          title: input.title,
          pricePaise: 0n,
          status: 'DRAFT',
          customerProfile: customerProfile as Prisma.InputJsonValue,
          media: input.mediaUrls && input.mediaUrls.length > 0 ? {
            create: input.mediaUrls.map((url, idx) => ({ url, mediaType: 'IMAGE', displayOrder: idx })),
          } : undefined,
        },
        update: {
          title: input.title,
          customerProfile: customerProfile as Prisma.InputJsonValue,
          ...(input.mediaUrls && input.mediaUrls.length > 0 ? {
            media: {
              deleteMany: {},
              create: input.mediaUrls.map((url, idx) => ({ url, mediaType: 'IMAGE', displayOrder: idx })),
            },
          } : {}),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_LISTING_PREPARED',
          entityType: 'VehicleStockUnit',
          entityId: stockId,
          details: { vehicleId, listingId: listing.id, title: input.title, branchId },
        },
      });

      outbox.push(() => this.notifyTeam(this.db, { type: 'VEHICLE_LISTING_READY', roles: ['PRICING_APPROVER', 'LISTING_EXECUTIVE', 'OPERATIONS_MANAGER'], title: `Listing ready: ${input.title}`, body: `${input.title} has its details and photos. Set the retail price and publish it.`, actionUrl: '/operations?tab=publication', referenceId: stockId, entityType: 'VehicleStockUnit', branchId }));
      return { stockId, vehicleId, listingId: listing.id, status: 'LISTING_READY' };
    });
    for (const send of outbox) await send();
    return __result;
  }

  /**
   * Edit a car's listing at any point after preparation, including while it is live: details, photos, price. Replaces the old
   * rule that locked the studio once a car was published. A live listing must stay complete (see listing-readiness.ts).
   */
  async updateListing(actor: InspectionActor, stockId: string, input: {
    title?: string;
    retailPricePaise?: bigint;
    color?: string;
    variant?: string;
    bodyType?: string;
    features?: string[];
    verifiedTags?: string[];
    conditionSummary?: string;
    inspectionSummary?: string;
    registrationNumber?: string;
    registrationYear?: number;
    registrationCity?: string;
    ownershipCount?: number;
    odometerKm?: number;
    engineCapacityCc?: number;
    /** The full, ordered photo list. Photos not in it are removed; new ones are added. */
    mediaUrls?: string[];
  }) {
    await refreshMasterBodyTypes(this.db as any);
    checkRole(actor, publishRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      include: { vehicle: { include: { listing: { include: { media: true } } } }, branch: true },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (!stock.vehicleId || !stock.vehicle) throw new HttpError(409, 'VEHICLE_DETAILS_NOT_PREPARED');
    if (!['LISTING_PREPARATION', 'LISTING_READY', 'LISTED', 'RESERVED'].includes(stock.status)) throw new HttpError(409, 'STOCK_NOT_EDITABLE_AS_LISTING');
    const live = ['LISTED', 'RESERVED'].includes(stock.status);
    if (input.retailPricePaise !== undefined && input.retailPricePaise <= 0n) throw new HttpError(400, 'INVALID_RETAIL_PRICE');
    if (input.retailPricePaise !== undefined && stock.status === 'RESERVED' && stock.vehicle.listing && stock.vehicle.listing.pricePaise !== input.retailPricePaise) {
      throw new HttpError(409, 'LISTING_RESERVED_PRICE_LOCKED', 'This car is reserved by a customer, so its price cannot be changed.');
    }
    const urls = input.mediaUrls?.map(url => url.trim()).filter(Boolean);
    if (urls && new Set(urls).size !== urls.length) throw new HttpError(400, 'DUPLICATE_PHOTOS');

    const vehicle = stock.vehicle;
    const listing = vehicle.listing;
    const next = {
      title: input.title?.trim() || listing?.title || '',
      color: input.color !== undefined ? input.color.trim() : vehicle.color,
      registrationNumber: input.registrationNumber !== undefined ? input.registrationNumber.trim().toUpperCase() : stock.registrationNumber,
      conditionSummary: input.conditionSummary !== undefined ? input.conditionSummary.trim() : vehicle.conditionSummary,
      photoCount: urls ? urls.length : listing?.media.length ?? 0,
    };
    if (live) {
      // A live listing may be improved but never left incomplete.
      const gaps = listingGaps({ ...next, pricePaise: input.retailPricePaise ?? listing?.pricePaise ?? 0n, branchId: stock.branchId }, { requirePrice: true });
      if (gaps.length) throw new HttpError(409, 'LISTING_INCOMPLETE', listingGapMessage(gaps));
    }

    const bodyType = input.bodyType !== undefined ? resolveBodyType({ bodyType: input.bodyType, make: stock.make, model: stock.model }) : undefined;
    const changed = Object.entries(input).filter(([, value]) => value !== undefined).map(([key]) => key);
    if (changed.length === 0) throw new HttpError(400, 'NOTHING_TO_UPDATE');

    return this.db.$transaction(async tx => {
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          ...(input.color !== undefined ? { color: next.color || null } : {}),
          ...(input.variant !== undefined ? { variant: input.variant.trim() } : {}),
          ...(bodyType !== undefined ? { bodyType } : {}),
          ...(input.features !== undefined ? { features: input.features.map(f => f.trim()).filter(Boolean) } : {}),
          ...(input.verifiedTags !== undefined ? { verifiedTags: input.verifiedTags.map(t => t.trim()).filter(Boolean) } : {}),
          ...(input.conditionSummary !== undefined ? { conditionSummary: next.conditionSummary || null } : {}),
          ...(input.inspectionSummary !== undefined ? { inspectionSummary: input.inspectionSummary.trim() || null } : {}),
          ...(input.registrationYear !== undefined ? { registrationYear: input.registrationYear } : {}),
          ...(input.ownershipCount !== undefined ? { ownershipCount: input.ownershipCount } : {}),
          ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
          ...(input.engineCapacityCc !== undefined ? { engineCapacityCc: input.engineCapacityCc } : {}),
        },
      });
      if (input.registrationNumber !== undefined || input.variant !== undefined || input.odometerKm !== undefined) {
        await tx.vehicleStockUnit.update({
          where: { id: stockId },
          data: {
            ...(input.registrationNumber !== undefined ? { registrationNumber: next.registrationNumber || null } : {}),
            ...(input.variant !== undefined ? { variant: input.variant.trim() || null } : {}),
            ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
            version: { increment: 1 },
          },
        });
      }

      // Keep the customer-facing snapshot in step with the edit (it used to go stale after the first save).
      const profile = ((listing?.customerProfile ?? {}) as Record<string, any>);
      const basic = { ...(profile.basicInformation ?? {}) };
      if (input.registrationNumber !== undefined) basic.registrationNumber = next.registrationNumber || null;
      if (input.variant !== undefined) basic.variant = input.variant.trim() || null;
      if (input.odometerKm !== undefined) basic.odometerKm = input.odometerKm;
      if (input.registrationYear !== undefined) basic.registrationYear = input.registrationYear;
      if (input.registrationCity !== undefined) basic.registrationCity = input.registrationCity.trim() || null;
      if (input.ownershipCount !== undefined) basic.ownershipCount = input.ownershipCount;
      const specifications = { ...(profile.specifications ?? {}) };
      if (input.color !== undefined) specifications.color = next.color || null;
      if (bodyType !== undefined) specifications.bodyType = bodyType;
      if (input.engineCapacityCc !== undefined) specifications.engineCapacityCc = input.engineCapacityCc;
      const patchedProfile: Record<string, any> = { ...profile, version: profile.version ?? 1, basicInformation: basic, specifications, updatedAt: new Date().toISOString() };
      if (input.features !== undefined) patchedProfile.topFeatures = input.features.map(f => f.trim()).filter(Boolean);
      if (input.conditionSummary !== undefined) patchedProfile.customerConditionSummary = next.conditionSummary || null;
      if (input.inspectionSummary !== undefined && patchedProfile.qualityReport) patchedProfile.qualityReport = { ...patchedProfile.qualityReport, summary: input.inspectionSummary.trim() || null };

      const saved = await tx.vehicleListing.upsert({
        where: { vehicleId: vehicle.id },
        create: {
          vehicleId: vehicle.id,
          title: next.title || `${stock.manufacturingYear} ${stock.make} ${stock.model}`,
          pricePaise: input.retailPricePaise ?? 0n,
          originalPricePaise: input.retailPricePaise ?? null,
          status: 'DRAFT',
          customerProfile: patchedProfile as Prisma.InputJsonValue,
          media: urls?.length ? { create: urls.map((url, idx) => ({ url, mediaType: 'IMAGE', displayOrder: idx })) } : undefined,
        },
        update: {
          ...(input.title !== undefined ? { title: next.title } : {}),
          ...(input.retailPricePaise !== undefined ? { pricePaise: input.retailPricePaise, originalPricePaise: originalPriceAfterChange(listing, input.retailPricePaise) } : {}),
          customerProfile: patchedProfile as Prisma.InputJsonValue,
          ...(urls ? { media: { deleteMany: {}, create: urls.map((url, idx) => ({ url, mediaType: 'IMAGE', displayOrder: idx })) } } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: live ? 'VEHICLE_LISTING_EDITED_LIVE' : 'VEHICLE_LISTING_EDITED',
          entityType: 'VehicleListing',
          entityId: saved.id,
          details: {
            stockCode: stock.stockCode,
            changed,
            ...(input.retailPricePaise !== undefined ? { fromPricePaise: listing?.pricePaise?.toString() ?? null, toPricePaise: input.retailPricePaise.toString() } : {}),
            ...(urls ? { photoCount: urls.length } : {}),
          },
        },
      });
      return { stockId, listingId: saved.id, status: stock.status, changed };
    });
  }

  async publishListing(actor: InspectionActor, stockId: string, input: {
    retailPricePaise: bigint;
    expectedVersion: number;
    title?: string;
    branchId?: string;
  }) {
    await refreshMasterBodyTypes(this.db as any);
    checkRole(actor, publishRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      include: {
        vehicle: { include: { listing: { include: { media: true } } } },
        workOrders: { include: { costApproval: true } },
        qualityControlReports: true,
        branch: true,
      },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (stock.version !== input.expectedVersion) throw new HttpError(409, 'STOCK_VERSION_CONFLICT');
    if (input.retailPricePaise <= 0n) throw new HttpError(400, 'INVALID_RETAIL_PRICE');

    const effectiveBranchId = input.branchId || stock.branchId;
    if (!effectiveBranchId) {
      throw new HttpError(400, 'BRANCH_SELECTION_REQUIRED');
    }
    const branch = await this.db.branch.findFirst({
      where: { id: effectiveBranchId, active: true },
    });
    if (!branch) {
      throw new HttpError(400, 'INVALID_BRANCH');
    }

    // A work order is "blocking" if it is not COMPLETED/CANCELLED AND its cost
    // approval has not been REJECTED (cost-rejected DRAFTs mean the work was
    // declined on budget grounds and is effectively waived).
    const hasUnfinishedWorkOrders = stock.workOrders.some(wo =>
      !['COMPLETED', 'CANCELLED'].includes(wo.status) &&
      wo.costApproval?.status !== 'REJECTED'
    );
    if (hasUnfinishedWorkOrders) throw new HttpError(409, 'WORK_ORDERS_NOT_COMPLETED');
    const hasPassedQC = stock.qualityControlReports.some(qc => qc.status === 'PASSED');
    if (stock.workOrders.length > 0 && !hasPassedQC) throw new HttpError(409, 'QC_REPORT_NOT_PASSED');
    if (!stock.vehicleId || !stock.vehicle) throw new HttpError(409, 'VEHICLE_DETAILS_NOT_PREPARED');

    // A car goes live only with everything a customer needs to see (photos, colour, registration, condition, branch).
    const publishGaps = listingGaps({
      title: input.title || stock.vehicle.listing?.title || `${stock.manufacturingYear} ${stock.make} ${stock.model}`,
      pricePaise: input.retailPricePaise,
      photoCount: stock.vehicle.listing?.media?.length ?? 0,
      color: stock.vehicle.color,
      registrationNumber: stock.registrationNumber,
      conditionSummary: stock.vehicle.conditionSummary,
      branchId: effectiveBranchId,
    }, { requirePrice: true });
    if (publishGaps.length) throw new HttpError(409, 'LISTING_INCOMPLETE', listingGapMessage(publishGaps));

    return this.db.$transaction(async tx => {
      const listingTitle = input.title || stock.vehicle!.listing?.title || `${stock.manufacturingYear} ${stock.make} ${stock.model} ${stock.variant || ''}`.trim();
      const listing = await tx.vehicleListing.upsert({
        where: { vehicleId: stock.vehicleId! },
        create: {
          vehicleId: stock.vehicleId!,
          title: listingTitle,
          pricePaise: input.retailPricePaise,
          originalPricePaise: input.retailPricePaise,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        update: {
          title: listingTitle,
          pricePaise: input.retailPricePaise,
          // Publishing a draft starts the "was" price; re-publishing a live listing keeps it so a price cut still shows as a drop.
          originalPricePaise: originalPriceAfterChange(stock.vehicle!.listing, input.retailPricePaise),
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      await tx.vehicleStockUnit.update({
        where: { id: stockId },
        data: {
          branchId: branch.id,
          physicalLocation: branch.name,
          status: 'LISTED',
          version: { increment: 1 },
        },
      });

      if (stock.vehicleId) {
        await tx.vehicle.update({
          where: { id: stock.vehicleId },
          data: {
            city: branch.city,
            // Every published car carries a body type so the customer filter can find it.
            ...(stock.vehicle?.bodyType ? {} : { bodyType: inferBodyType(stock.make, stock.model) ?? undefined }),
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_LISTING_PUBLISHED',
          entityType: 'VehicleListing',
          entityId: listing.id,
          details: {
            stockCode: stock.stockCode,
            pricePaise: input.retailPricePaise.toString(),
            branchId: branch.id,
            branchCode: branch.code,
            branchName: branch.name,
            branchCity: branch.city,
          },
        },
      });

      return listing;
    });
  }

  async deliverVehicle(actor: InspectionActor, stockId: string, input: {
    buyerName: string;
    buyerPhone: string;
    odometerKm?: number;
    deliveryNotes?: string;
    expectedVersion: number;
  }) {
    checkRole(actor, operationsRoles);
    const stock = await this.db.vehicleStockUnit.findFirst({
      where: this.stockScope(actor, stockId),
      include: { vehicle: { include: { listing: true } } },
    });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (stock.version !== input.expectedVersion) throw new HttpError(409, 'STOCK_VERSION_CONFLICT');
    if (!['LISTED', 'RESERVED'].includes(stock.status)) throw new HttpError(409, 'STOCK_NOT_READY_FOR_DELIVERY');

    return this.db.$transaction(async tx => {
      await tx.vehicleStockUnit.update({
        where: { id: stockId },
        data: {
          status: 'SOLD',
          odometerKm: input.odometerKm || stock.odometerKm,
          notes: `[DELIVERY to ${input.buyerName} (${input.buyerPhone})]${input.deliveryNotes ? `: ${input.deliveryNotes}` : ''}${stock.notes ? `\n\n${stock.notes}` : ''}`.trim(),
          version: { increment: 1 },
        },
      });

      if (stock.vehicle?.listing) {
        await tx.vehicleListing.update({
          where: { id: stock.vehicle.listing.id },
          data: { status: 'SOLD' },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'VEHICLE_DELIVERED_TO_BUYER',
          entityType: 'VehicleStockUnit',
          entityId: stockId,
          details: { buyerName: input.buyerName, buyerPhone: input.buyerPhone, odometerKm: input.odometerKm },
        },
      });

      return { stockId, status: 'SOLD' };
    });
  }

  async operationInspectors(actor: InspectionActor, branchId?: string) {
    checkRole(actor, operationsRoles);
    const targetBranchIds = branchId ? [branchId] : actor.roles.includes('SUPER_ADMIN') ? undefined : actor.branchIds;

    const inspectors = await this.db.employee.findMany({
      where: {
        active: true,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        OR: [{ role: 'INSPECTOR' }, { roleAssignments: { some: { role: { key: 'INSPECTOR' } } } }],
        ...(targetBranchIds ? { branchAssignments: { some: { branchId: { in: targetBranchIds } } } } : {}),
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, phone: true } },
        branchAssignments: { include: { branch: true } },
        inspectionAssignments: {
          where: { status: { in: ['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'] } },
          select: { id: true, status: true, scheduledAt: true },
        },
      },
    });

    return inspectors.map(emp => ({
      userId: emp.userId,
      email: emp.user.email,
      displayName: emp.user.displayName,
      phone: emp.user.phone,
      activeLoadCount: emp.inspectionAssignments.length,
      branches: emp.branchAssignments.map(b => ({ id: b.branch.id, name: b.branch.name, city: b.branch.city })),
    }));
  }

  async assign(
    actor: InspectionActor,
    requestId: string,
    input: { inspectorId: string; scheduledAt?: Date; locationType: string; address?: string; instructions?: string }
  ) {
    checkRole(actor, operationsRoles);
    const request = await this.db.inspectionRequest.findFirst({
      where: { id: requestId, ...(actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } }) },
      include: { lead: true },
    });
    if (!request) throw new HttpError(404, 'INSPECTION_REQUEST_NOT_FOUND');

    const previousAssignment = await this.db.inspectionAssignment.findUnique({
      where: { requestId },
      select: { id: true, inspectorId: true },
    });

    const inspector = await this.db.employee.findUnique({
      where: { userId: input.inspectorId },
      include: { user: true, roleAssignments: { include: { role: true } }, branchAssignments: true },
    });

    const reason = inspectorIneligibility(
      inspector
        ? {
            userStatus: inspector.user.status,
            active: inspector.active,
            status: inspector.status,
            roleKeys: [inspector.role, ...inspector.roleAssignments.map(item => item.role.key)],
            branchIds: inspector.branchAssignments.map(item => item.branchId),
          }
        : null,
      request.branchId,
    );
    if (reason) {
      // Keep the stable code clients already handle; the message says exactly what to fix.
      throw new HttpError(400, 'INSPECTOR_NOT_ELIGIBLE', INSPECTOR_INELIGIBILITY_MESSAGES[reason]);
    }

    const scheduledAt = input.scheduledAt ?? new Date();

    return this.db.$transaction(async tx => {
      const assignment = await tx.inspectionAssignment.upsert({
        where: { requestId },
        update: {
          inspectorId: input.inspectorId,
          assignedById: actor.userId,
          scheduledAt,
          locationType: input.locationType,
          address: input.address,
          instructions: input.instructions,
          status: 'ASSIGNED',
        },
        create: {
          requestId,
          inspectorId: input.inspectorId,
          assignedById: actor.userId,
          scheduledAt,
          locationType: input.locationType,
          address: input.address,
          instructions: input.instructions,
        },
      });

      await tx.inspectionRequest.update({
        where: { id: requestId },
        // This is the shared appointment snapshot consumed outside the
        // dispatch view. Preserve requestedDate/timeSlot as the customer's
        // original preference, but mirror confirmed place and time here.
        data: {
          status: 'SCHEDULED',
          scheduledAt,
          locationType: input.locationType,
          address: input.address,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_ASSIGNED',
          entityType: 'InspectionAssignment',
          entityId: assignment.id,
          details: { requestId, inspectorId: input.inspectorId, scheduledAt: scheduledAt.toISOString() },
        },
      });

      // Notification Dispatch
      if (this.notificationService) {
        const vehicleTitle = `${request.lead?.make || ''} ${request.lead?.model || ''}`.trim() || 'Vehicle';
        const refCode = request.lead?.referenceCode || requestId.slice(0, 8);

        if (previousAssignment?.inspectorId && previousAssignment.inspectorId !== input.inspectorId) {
          // Reassignment: notify previous inspector
          await this.notificationService.dispatchDomainEvent({
            type: 'INSPECTION_REASSIGNED',
            category: 'INSPECTION',
            priority: 'HIGH',
            recipientUserIds: [previousAssignment.inspectorId],
            title: `Inspection Reassigned: ${vehicleTitle}`,
            body: `Inspection assignment for ${vehicleTitle} (${refCode}) has been reassigned to another inspector.`,
            referenceId: assignment.id,
            entityType: 'InspectionAssignment',
            metadata: { targetApp: 'INSPECTOR', requestId, assignmentId: assignment.id },
            emailTemplate: 'inspection-assigned-v1',
            emailSubject: `Inspection Assignment Update — ${vehicleTitle} [${refCode}]`,
            emailBody: `Hello,\n\nThe inspection assignment for ${vehicleTitle} (${refCode}) has been reassigned to another inspector.\n\nV MOTIV Operations`,
          }, tx);
        }

        // Notify newly assigned inspector
        await this.notificationService.dispatchDomainEvent({
          type: 'INSPECTION_ASSIGNED',
          category: 'INSPECTION',
          priority: 'HIGH',
          recipientUserIds: [input.inspectorId],
          title: `New Inspection Assigned: ${vehicleTitle}`,
          body: `You have been assigned to inspect ${vehicleTitle} (${refCode}). Tap to open job details.`,
          deepLink: `vmotiv://inspections/${assignment.id}`,
          referenceId: assignment.id,
          entityType: 'InspectionAssignment',
          metadata: { targetApp: 'INSPECTOR', requestId, assignmentId: assignment.id },
          emailTemplate: 'inspection-assigned-v1',
          emailSubject: `New Inspection Assignment: ${vehicleTitle} [${refCode}]`,
          emailBody: `Hello,\n\nYou have been assigned a new vehicle inspection:\n\nVehicle: ${vehicleTitle}\nRef Code: ${refCode}\nScheduled: ${scheduledAt.toLocaleString()}\nLocation: ${input.address || 'Doorstep / Hub'}\n\nPlease open the V MOTIV Inspector app to review the assignment checklist.\n\nV MOTIV Operations`,
        }, tx);
      }

      return assignment;
    });
  }

  async reschedule(
    actor: InspectionActor,
    requestId: string,
    input: { scheduledAt: Date; locationType: string; address?: string; instructions?: string; reason: string }
  ) {
    checkRole(actor, operationsRoles);
    const assignment = await this.db.inspectionAssignment.findFirst({
      where: { requestId, request: actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } } },
    });
    // Dispatch may reopen a cancelled appointment when the seller confirms a
    // replacement slot. The update below restores both shared records to a
    // scheduled state and retains the cancellation/reschedule audit trail.
    if (!assignment || !['ASSIGNED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED'].includes(assignment.status)) {
      throw new HttpError(409, 'INSPECTION_NOT_RESCHEDULABLE');
    }

    return this.db.$transaction(async tx => {
      const updated = await tx.inspectionAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'RESCHEDULED',
          scheduledAt: input.scheduledAt,
          locationType: input.locationType,
          address: input.address,
          instructions: input.instructions,
        },
      });

      await tx.inspectionRequest.update({
        where: { id: requestId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: input.scheduledAt,
          locationType: input.locationType,
          address: input.address,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_RESCHEDULED',
          entityType: 'InspectionAssignment',
          entityId: assignment.id,
          details: { requestId, reason: input.reason, scheduledAt: input.scheduledAt.toISOString() },
        },
      });

      return updated;
    });
  }

  async cancel(actor: InspectionActor, requestId: string, reason: string) {
    checkRole(actor, operationsRoles);
    const assignment = await this.db.inspectionAssignment.findFirst({
      where: { requestId, request: actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } } },
    });
    if (!assignment || !['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'].includes(assignment.status)) {
      throw new HttpError(409, 'INSPECTION_NOT_CANCELLABLE');
    }

    return this.db.$transaction(async tx => {
      const updated = await tx.inspectionAssignment.update({
        where: { id: assignment.id },
        data: { status: 'CANCELLED' },
      });

      await tx.inspectionRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_CANCELLED',
          entityType: 'InspectionAssignment',
          entityId: assignment.id,
          details: { requestId, reason },
        },
      });

      return updated;
    });
  }

  // --- Independent Reviewer Operations ---

  private reviewScope(actor: InspectionActor) {
    return actor.roles.includes('SUPER_ADMIN') ? {} : { request: { branchId: { in: actor.branchIds } } };
  }

  async reviewQueue(
    actor: InspectionActor,
    query?: { sort?: string; status?: string; search?: string }
  ) {
    checkRole(actor, reviewerRoles);
    const isSuperAdmin = actor.roles.includes('SUPER_ADMIN');

    const orderBy: Prisma.InspectionReportOrderByWithRelationInput[] =
      query?.sort === 'submitted_asc'
        ? [{ submittedAt: 'asc' }, { id: 'asc' }]
        : [{ submittedAt: 'desc' }, { id: 'desc' }];

    const statusFilter =
      query?.status && query.status !== 'ALL'
        ? [query.status as any]
        : ['SUBMITTED', 'UNDER_REVIEW', 'REWORK_REQUIRED', 'APPROVED'];

    const searchFilter: Prisma.InspectionReportWhereInput = query?.search?.trim()
      ? {
          request: {
            lead: {
              OR: [
                { make: { contains: query.search.trim(), mode: 'insensitive' } },
                { model: { contains: query.search.trim(), mode: 'insensitive' } },
                { referenceCode: { contains: query.search.trim(), mode: 'insensitive' } },
                { sellerName: { contains: query.search.trim(), mode: 'insensitive' } },
              ],
            },
          },
        }
      : {};

    const rows = await this.db.inspectionReport.findMany({
      where: {
        status: { in: statusFilter },
        ...(isSuperAdmin ? {} : { inspectorId: { not: actor.userId } }),
        ...this.reviewScope(actor),
        ...searchFilter,
      },
      orderBy,
      select: {
        id: true,
        revision: true,
        status: true,
        submittedAt: true,
        inspectorId: true,
        identity: true,
        inspector: { select: { user: { select: { displayName: true, email: true } } } },
        request: {
          select: {
            lead: {
              select: {
                referenceCode: true,
                sellerName: true,
                sellerPhone: true,
                city: true,
                make: true,
                model: true,
                variant: true,
                manufacturingYear: true,
              },
            },
          },
        },
        _count: { select: { defects: true, media: true, answers: true } },
      },
    });

    return rows.map(r => {
      if (r.identity && typeof r.identity === 'object') {
        const iden = r.identity as Record<string, unknown>;
        if (typeof iden.registrationNumber === 'string' && isInvalidRegNumberOrUuid(iden.registrationNumber)) {
          iden.registrationNumber = '';
        }
      }
      return r;
    });
  }

  async reviewReport(actor: InspectionActor, id: string) {
    checkRole(actor, reviewerRoles);
    const isSuperAdmin = actor.roles.includes('SUPER_ADMIN');
    const report = await this.db.inspectionReport.findFirst({
      where: {
        id,
        ...(isSuperAdmin ? {} : { inspectorId: { not: actor.userId } }),
        ...this.reviewScope(actor),
      },
      include: {
        answers: true,
        defects: true,
        media: true,
        reviewDecision: true,
        inspector: { select: { user: { select: { displayName: true, email: true } } } },
        parentReport: {
          select: {
            id: true,
            revision: true,
            status: true,
            identity: true,
            answers: { select: { itemKey: true, status: true, value: true, notes: true } },
            defects: { select: { category: true, severity: true, description: true, location: true } },
            reviewDecision: { select: { decision: true, reason: true, createdAt: true } },
          },
        },
        revisions: {
          select: { id: true, revision: true, status: true, submittedAt: true, reviewedAt: true },
          orderBy: { revision: 'asc' },
        },
        request: { include: { lead: true } },
      },
    });

    if (!report) throw new HttpError(404, 'INSPECTION_REPORT_NOT_FOUND');
    if (report.identity && typeof report.identity === 'object') {
      const iden = report.identity as Record<string, unknown>;
      if (typeof iden.registrationNumber === 'string' && isInvalidRegNumberOrUuid(iden.registrationNumber)) {
        iden.registrationNumber = '';
      }
    }
    return report;
  }

  async decide(
    actor: InspectionActor,
    id: string,
    input: { decision: 'APPROVE' | 'REQUEST_CORRECTION' | 'REJECT'; reason?: string }
  ) {
    checkRole(actor, reviewerRoles);

    const report = await this.db.inspectionReport.findFirst({
      where: { id, status: 'SUBMITTED', ...this.reviewScope(actor) },
      include: { answers: true, defects: true, media: true, request: { include: { lead: true } } },
    });

    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_REVIEWABLE');

    // Strict boundary: Self-approval forbidden unless SUPER_ADMIN override
    if (report.inspectorId === actor.userId && !actor.roles.includes('SUPER_ADMIN')) {
      throw new HttpError(403, 'INSPECTION_SELF_APPROVAL_DENIED');
    }

    if (input.decision !== 'APPROVE' && (!input.reason || !input.reason.trim())) {
      throw new HttpError(400, 'REVIEW_REASON_REQUIRED');
    }

    if (input.decision === 'APPROVE' && report.answers.length === 0) {
      throw new HttpError(400, 'INSPECTION_REPORT_INCOMPLETE');
    }

    return this.db.$transaction(async tx => {
      const status = input.decision === 'APPROVE' ? 'APPROVED' : input.decision === 'REJECT' ? 'REJECTED' : 'REWORK_REQUIRED';

      await tx.inspectionReviewDecision.create({
        data: {
          reportId: id,
          reviewerId: actor.userId,
          decision: input.decision,
          reason: input.reason?.trim() || null,
        },
      });

      await tx.inspectionReport.update({
        where: { id },
        data: { status, reviewedAt: new Date() },
      });

      if (input.decision === 'APPROVE' && report.request?.leadId) {
        const iden = (report.identity || {}) as Record<string, unknown>;
        const rawReg = typeof iden.registrationNumber === 'string' ? iden.registrationNumber.trim() : '';
        const reg = !isInvalidRegNumberOrUuid(rawReg) ? rawReg : '';
        const variant = typeof iden.variant === 'string' ? iden.variant.trim() : '';
        const color = typeof iden.color === 'string' ? iden.color.trim() : '';
        const regYear = typeof iden.registrationYear === 'number' ? iden.registrationYear : undefined;
        const regCity = typeof iden.registrationCity === 'string' ? iden.registrationCity.trim() : '';
        const updateData: Record<string, unknown> = { status: 'OFFER_PENDING' };
        if (reg) updateData.registrationNumber = reg;
        if (variant) updateData.variant = variant;
        if (color) updateData.color = color;
        if (regYear) updateData.registrationYear = regYear;
        if (regCity) updateData.registrationCity = regCity;
        await tx.acquisitionLead.update({
          where: { id: report.request.leadId },
          data: updateData as any,
        }).catch(() => undefined);
      }

      let nextRevisionId: string | undefined;

      if (input.decision === 'REQUEST_CORRECTION') {
        const next = await tx.inspectionReport.create({
          data: {
            requestId: report.requestId,
            assignmentId: report.assignmentId,
            inspectorId: report.inspectorId,
            revision: report.revision + 1,
            parentReportId: report.id,
            templateKey: report.templateKey,
            templateVersion: report.templateVersion,
            identity: report.identity === null ? Prisma.JsonNull : (report.identity as Prisma.InputJsonValue),
            answers: {
              create: report.answers.map(answer => ({
                itemKey: answer.itemKey,
                status: answer.status,
                value: answer.value === null ? Prisma.JsonNull : (answer.value as Prisma.InputJsonValue),
                notes: answer.notes,
              })),
            },
            defects: {
              create: report.defects.map(defect => ({
                category: defect.category,
                severity: defect.severity,
                description: defect.description,
                location: defect.location,
              })),
            },
            media: {
              create: report.media.map(media => ({
                logicalMediaId: media.logicalMediaId,
                storageKey: media.storageKey,
                mimeType: media.mimeType,
                byteSize: media.byteSize,
                checksumSha256: media.checksumSha256,
                capturedAt: media.capturedAt,
              })),
            },
          },
        });

        nextRevisionId = next.id;

        await tx.inspectionAssignment.update({
          where: { id: report.assignmentId },
          data: { status: 'CONFIRMED', completedAt: null },
        });

        await tx.inspectionRequest.update({
          where: { id: report.requestId },
          data: { status: 'IN_PROGRESS' },
        });

        if (report.request?.leadId) {
          await tx.acquisitionLead.updateMany({
            where: {
              id: report.request.leadId,
              status: 'OFFER_PENDING',
            },
            data: { status: 'INSPECTION_SCHEDULED' },
          });
        }
      }

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: `INSPECTION_REVIEW_${input.decision}`,
          entityType: 'InspectionReport',
          entityId: id,
          details: { revision: report.revision, nextRevisionId: nextRevisionId ?? null, reason: input.reason },
        },
      });

      // Notification Dispatch on Review Decision
      if (this.notificationService) {
        const vehicleTitle = `${report.request?.lead?.make || ''} ${report.request?.lead?.model || ''}`.trim() || 'Vehicle';
        const refCode = report.request?.lead?.referenceCode || id.slice(0, 8);

        if (input.decision === 'REQUEST_CORRECTION') {
          await this.notificationService.dispatchDomainEvent({
            type: 'INSPECTION_REWORK_REQUIRED',
            category: 'INSPECTION',
            priority: 'HIGH',
            recipientUserIds: [report.inspectorId],
            title: `Corrections Requested: ${vehicleTitle}`,
            body: `Reviewer feedback requires attention on report revision v${report.revision}: ${input.reason?.trim() || 'Please review notes in app'}.`,
            deepLink: `vmotiv://inspections/${report.assignmentId}`,
            referenceId: report.assignmentId,
            entityType: 'InspectionReport',
            metadata: { targetApp: 'INSPECTOR', reportId: id, assignmentId: report.assignmentId, revision: report.revision },
            emailTemplate: 'inspection-rework-v1',
            emailSubject: `Corrections Required: Inspection Report for ${vehicleTitle} [${refCode}]`,
            emailBody: `Hello,\n\nThe review team has reviewed your inspection report revision v${report.revision} for ${vehicleTitle} (${refCode}) and requested corrections before approval:\n\nCorrection Notes: ${input.reason?.trim()}\n\nPlease open the V MOTIV Inspector app, review the requested corrections, capture required supplementary evidence, and resubmit.\n\nV MOTIV Review Team`,
          }, tx);
        } else if (input.decision === 'APPROVE') {
          await this.notificationService.dispatchDomainEvent({
            type: 'INSPECTION_REVIEW_APPROVED',
            category: 'INSPECTION',
            priority: 'NORMAL',
            recipientRoles: ['SALES', 'FINANCE', 'SUPER_ADMIN'],
            branchId: report.request?.branchId || undefined,
            title: `Inspection Approved: ${vehicleTitle}`,
            body: `Inspection report for ${vehicleTitle} (${refCode}) has been certified and approved. Ready for offer generation.`,
            actionUrl: `/inspection-review?reportId=${id}`,
            referenceId: id,
            entityType: 'InspectionReport',
            metadata: { targetApp: 'SALES', reportId: id },
            emailTemplate: 'inspection-approved-v1',
            emailSubject: `Inspection Certified & Approved: ${vehicleTitle} [${refCode}]`,
            emailBody: `The 180-point vehicle inspection report for ${vehicleTitle} (${refCode}) has been officially certified and approved.\n\nThe certified valuation and condition grade are now available for customer offer finalization.`,
          }, tx);
        } else if (input.decision === 'REJECT') {
          await this.notificationService.dispatchDomainEvent({
            type: 'INSPECTION_REVIEW_REJECTED',
            category: 'INSPECTION',
            priority: 'NORMAL',
            recipientRoles: ['SALES', 'OPERATIONS', 'SUPER_ADMIN'],
            branchId: report.request?.branchId || undefined,
            title: `Inspection Rejected: ${vehicleTitle}`,
            body: `Inspection report for ${vehicleTitle} (${refCode}) was rejected: ${input.reason?.trim() || 'Criteria not met'}.`,
            referenceId: id,
            entityType: 'InspectionReport',
            metadata: { targetApp: 'OPS', reportId: id },
          }, tx);
        }
      }

      return { status, nextRevisionId };
    });
  }

  async revisionDiff(actor: InspectionActor, id: string) {
    const report = await this.reviewReport(actor, id);
    if (!report.parentReport) {
      return { hasParent: false, changes: [] };
    }

    const parent = report.parentReport;
    const parentAnswers = new Map(parent.answers.map(a => [a.itemKey, a]));
    const currentAnswers = new Map(report.answers.map(a => [a.itemKey, a]));

    const answerDiffs: Array<{ itemKey: string; oldStatus?: string; newStatus?: string; oldNotes?: string | null; newNotes?: string | null }> = [];

    for (const [key, current] of currentAnswers.entries()) {
      const old = parentAnswers.get(key);
      if (!old || old.status !== current.status || old.notes !== current.notes) {
        answerDiffs.push({
          itemKey: key,
          oldStatus: old?.status,
          newStatus: current.status,
          oldNotes: old?.notes,
          newNotes: current.notes,
        });
      }
    }

    const defectDiffs = {
      added: report.defects.filter(d => !parent.defects.some(p => p.description === d.description && p.category === d.category)),
      resolved: parent.defects.filter(p => !report.defects.some(d => d.description === p.description && d.category === p.category)),
    };

    return {
      hasParent: true,
      parentRevision: parent.revision,
      currentRevision: report.revision,
      priorReviewerReason: parent.reviewDecision?.reason,
      answerDiffs,
      defectDiffs,
    };
  }
}
