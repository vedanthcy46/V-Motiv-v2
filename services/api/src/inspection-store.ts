import { type InspectionAnswerStatus, type InspectionDefectSeverity, Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';
import { knownTemplateItem, templateFor, currentTemplate, isItemApplicable, type InspectionTemplateItem } from './inspection-template.js';
import { InspectionMediaService } from './inspection-media.js';

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
const documentTerminalStatuses = ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'];
const documentTransitions: Record<string, string[]> = {
  NOT_REQUESTED: ['REQUESTED'],
  REQUESTED: ['RECEIVED', 'WAIVED_BY_AUTHORIZED_POLICY'],
  RECEIVED: ['UNDER_REVIEW'],
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
  createdAt: true,
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

  constructor(private db: PrismaClient, mediaService?: InspectionMediaService) {
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

  async assignments(actor: InspectionActor) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');
    return this.db.inspectionAssignment.findMany({
      where: isElevated
        ? {
            OR: [
              { inspectorId: actor.userId },
              { status: { in: ['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'] } },
              { reports: { some: { status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } } } },
            ],
          }
        : {
            inspectorId: actor.userId,
            OR: [
              { status: { in: ['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'] } },
              { reports: { some: { inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } } } },
            ],
          },
      orderBy: { scheduledAt: 'asc' },
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
          identity: assignment.request.lead.registrationNumber
            ? { registrationNumber: assignment.request.lead.registrationNumber }
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
    return report;
  }

  async saveDraft(
    actor: InspectionActor,
    id: string,
    input: {
      recordVersion?: number;
      identity: Record<string, unknown>;
      answers: Array<{ itemKey: string; status: InspectionAnswerStatus; value?: unknown; notes?: string }>;
      defects: Array<{ category: string; severity: InspectionDefectSeverity; description: string; location?: string }>;
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

    return this.db.$transaction(async tx => {
      await tx.inspectionAnswer.deleteMany({ where: { reportId: id } });
      await tx.inspectionDefect.deleteMany({ where: { reportId: id } });

      const updated = await tx.inspectionReport.update({
        where: { id },
        data: {
          identity: input.identity as Prisma.InputJsonValue,
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

    if (!registrationNumber || !Number.isFinite(odometerKm) || odometerKm <= 0) {
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

    return this.db.$transaction(async tx => {
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
    return this.db.inspectionRequest.findMany({
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
            fuelType: true,
            odometerKm: true,
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
            submittedAt: true,
          },
          orderBy: { revision: 'desc' },
        },
      },
    });
  }

  async operationsDashboard(actor: InspectionActor) {
    checkRole(actor, operationsRoles);
    const requestScope = actor.roles.includes('SUPER_ADMIN') ? {} : { branchId: { in: actor.branchIds } };
    const [unassigned, scheduled, inProgress, completed] = await this.db.$transaction([
      this.db.inspectionRequest.count({ where: { ...requestScope, assignment: null, status: 'REQUESTED' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'SCHEDULED' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'IN_PROGRESS' } }),
      this.db.inspectionRequest.count({ where: { ...requestScope, status: 'COMPLETED' } }),
    ]);
    return { unassigned, scheduled, inProgress, completed, generatedAt: new Date().toISOString() };
  }

  private acquisitionCaseScope(actor: InspectionActor, id?: string): Prisma.AcquisitionCaseWhereInput {
    return {
      ...(id ? { id } : {}),
      ...(actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN')
        ? {}
        : { lead: { inspectionRequests: { some: { branchId: { in: actor.branchIds } } } } }),
    };
  }

  async acquisitionCases(actor: InspectionActor) {
    checkRole(actor, operationsRoles);
    return this.db.acquisitionCase.findMany({
      where: this.acquisitionCaseScope(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        lead: { select: { id: true, referenceCode: true, sellerName: true, city: true, make: true, model: true, manufacturingYear: true, registrationNumber: true } },
        offer: { select: { id: true, offerAmountPaise: true, validUntil: true, acceptedAt: true, version: true } },
        documents: { orderBy: { documentType: 'asc' } },
        settlement: true,
        handover: true,
      },
    });
  }

  async updateAcquisitionDocument(actor: InspectionActor, caseId: string, input: { documentType: string; status: string; notes?: string; expectedVersion?: number }) {
    checkRole(actor, operationsRoles);
    const acquisitionCase = await this.db.acquisitionCase.findFirst({ where: this.acquisitionCaseScope(actor, caseId), select: { id: true, status: true } });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (['COMPLETED', 'CANCELLED'].includes(acquisitionCase.status)) throw new HttpError(409, 'ACQUISITION_CASE_NOT_ACTIONABLE');

    return this.db.$transaction(async tx => {
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
      if (documentsReady) {
        await tx.acquisitionCase.update({ where: { id: caseId }, data: { status: 'SETTLEMENT_READY', version: { increment: 1 } } });
      }
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'ACQUISITION_DOCUMENT_STATUS_UPDATED', entityType: 'AcquisitionDocumentReview', entityId: updated.id, details: { acquisitionCaseId: caseId, documentType: input.documentType, from: existing.status, to: input.status } } });
      return updated;
    });
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
    const acquisitionCase = await this.db.acquisitionCase.findFirst({ where: this.acquisitionCaseScope(actor, caseId), include: { handover: true, documents: { select: { status: true } } } });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.status === 'COMPLETED') throw new HttpError(409, 'ACQUISITION_CASE_COMPLETED');
    const documentsReady = acquisitionCase.documents.length > 0 && acquisitionCase.documents.every(document => documentTerminalStatuses.includes(document.status));
    if (input.status === 'RECEIVED' && (!documentsReady || acquisitionCase.settlementStatus !== 'PAYMENT_VERIFIED')) throw new HttpError(409, 'HANDOVER_PREREQUISITES_INCOMPLETE');
    if (input.status === 'RECEIVED' && !input.documentsReceived) throw new HttpError(409, 'HANDOVER_DOCUMENTS_REQUIRED');
    if (input.expectedVersion !== undefined && acquisitionCase.handover && acquisitionCase.handover.version !== input.expectedVersion) throw new HttpError(409, 'HANDOVER_VERSION_CONFLICT');

    return this.db.$transaction(async tx => {
      const handover = await tx.vehicleHandover.upsert({
        where: { acquisitionCaseId: caseId },
        create: { acquisitionCaseId: caseId, branchId: input.branchId, custodianEmployeeId: actor.userId, status: input.status as never, location: input.location, observedAt: input.observedAt, registrationNumber: input.registrationNumber, odometerKm: input.odometerKm, mainKeysReceived: input.mainKeysReceived || 0, spareKeysReceived: input.spareKeysReceived || 0, documentsReceived: input.documentsReceived || false, accessoriesNotes: input.accessoriesNotes, conditionNotes: input.conditionNotes, exceptionNotes: input.exceptionNotes },
        update: { branchId: input.branchId, custodianEmployeeId: actor.userId, status: input.status as never, location: input.location, observedAt: input.observedAt, registrationNumber: input.registrationNumber, odometerKm: input.odometerKm, mainKeysReceived: input.mainKeysReceived, spareKeysReceived: input.spareKeysReceived, documentsReceived: input.documentsReceived, accessoriesNotes: input.accessoriesNotes, conditionNotes: input.conditionNotes, exceptionNotes: input.exceptionNotes, version: { increment: 1 } },
      });
      await tx.acquisitionCase.update({ where: { id: caseId }, data: { custodyStatus: input.status as never, status: input.status === 'DISPUTED' || input.status === 'REJECTED' ? 'ON_HOLD' : input.status === 'RECEIVED' ? 'HANDOVER_READY' : undefined, version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'VEHICLE_HANDOVER_RECORDED', entityType: 'VehicleHandover', entityId: handover.id, details: { acquisitionCaseId: caseId, status: input.status, location: input.location } } });
      return handover;
    });
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
    if (input.branchId && !actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role)) && !actor.branchIds.includes(input.branchId)) {
      throw new HttpError(403, 'STOCK_BRANCH_ACCESS_DENIED');
    }
    const acquisitionCase = await this.db.acquisitionCase.findFirst({
      where: this.acquisitionCaseScope(actor, caseId),
      include: {
        offer: { select: { offerAmountPaise: true } },
        lead: { select: { registrationNumber: true, make: true, model: true, variant: true, manufacturingYear: true, fuelType: true, transmission: true, odometerKm: true } },
        handover: { select: { branchId: true, registrationNumber: true, odometerKm: true } },
      },
    });
    if (!acquisitionCase) throw new HttpError(404, 'ACQUISITION_CASE_NOT_FOUND');
    if (acquisitionCase.status !== 'COMPLETED') throw new HttpError(409, 'STOCK_INWARD_REQUIRES_COMPLETED_ACQUISITION');
    const stockCode = `VM-STK-${acquisitionCase.caseReference.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    try {
      return await this.db.$transaction(async tx => {
        const stock = await tx.vehicleStockUnit.create({
          data: {
            stockCode,
            acquisitionCaseId: caseId,
            branchId: input.branchId || acquisitionCase.handover?.branchId,
            receivedByEmployeeId: actor.userId,
            physicalLocation: input.physicalLocation,
            registrationNumber: acquisitionCase.handover?.registrationNumber || acquisitionCase.lead.registrationNumber,
            make: acquisitionCase.lead.make,
            model: acquisitionCase.lead.model,
            variant: acquisitionCase.lead.variant,
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
    checkRole(actor, operationsRoles);
    return this.db.vehicleStockUnit.findMany({
      where: actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role)) ? {} : { branchId: { in: actor.branchIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, stockCode: true, status: true, physicalLocation: true, registrationNumber: true, make: true, model: true, variant: true, manufacturingYear: true, fuelType: true, transmission: true, odometerKm: true, branchId: true, createdAt: true, updatedAt: true },
    });
  }

  private stockScope(actor: InspectionActor, id?: string): Prisma.VehicleStockUnitWhereInput {
    return {
      ...(id ? { id } : {}),
      ...(actor.roles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role)) ? {} : { branchId: { in: actor.branchIds } }),
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
    const approval = await this.db.$transaction(async tx => {
      const created = await tx.refurbishmentCostApproval.create({ data: { workOrderId, requestedByEmployeeId: actor.userId, reason: input.reason } });
      await tx.refurbishmentWorkOrder.update({ where: { id: workOrderId }, data: { estimatedCostPaise: input.estimatedCostPaise, status: 'PENDING_COST_APPROVAL', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'REFURBISHMENT_COST_APPROVAL_REQUESTED', entityType: 'RefurbishmentCostApproval', entityId: created.id, details: { workOrderId, estimatedCostPaise: input.estimatedCostPaise.toString() } } });
      return created;
    });
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
    const stock = await this.db.vehicleStockUnit.findFirst({ where: this.stockScope(actor, stockId), select: { id: true, status: true } });
    if (!stock) throw new HttpError(404, 'STOCK_UNIT_NOT_FOUND');
    if (stock.status !== 'QC_PENDING') throw new HttpError(409, 'STOCK_NOT_QC_ELIGIBLE');
    const workOrder = input.workOrderId ? await this.db.refurbishmentWorkOrder.findFirst({ where: { id: input.workOrderId, stockUnitId: stockId } }) : null;
    if (input.workOrderId && !workOrder) throw new HttpError(404, 'WORK_ORDER_NOT_FOUND');
    if (workOrder && workOrder.status !== 'COMPLETED') throw new HttpError(409, 'WORK_ORDER_NOT_COMPLETED');
    if (workOrder?.createdByEmployeeId === actor.userId) throw new HttpError(403, 'QC_SELF_REVIEW_DENIED');
    const report = await this.db.qualityControlReport.create({ data: { stockUnitId: stockId, workOrderId: input.workOrderId, reviewerEmployeeId: actor.userId, status: 'IN_PROGRESS', findings: input.findings, evidenceNotes: input.evidenceNotes } });
    await this.db.auditEvent.create({ data: { actorId: actor.userId, action: 'QUALITY_CONTROL_STARTED', entityType: 'QualityControlReport', entityId: report.id, details: { stockUnitId: stockId, workOrderId: input.workOrderId } } });
    return report;
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
    return this.db.$transaction(async tx => {
      const updated = await tx.qualityControlReport.update({ where: { id: reportId }, data: { status, findings: input.findings, evidenceNotes: input.evidenceNotes, reviewedAt: new Date(), version: { increment: 1 } } });
      await tx.vehicleStockUnit.update({ where: { id: report.stockUnitId }, data: { status: status === 'PASSED' ? 'LISTING_PREPARATION' : status === 'REWORK_REQUIRED' ? 'REFURBISHMENT_PENDING' : 'ON_HOLD', version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'QUALITY_CONTROL_DECIDED', entityType: 'QualityControlReport', entityId: reportId, details: { stockUnitId: report.stockUnitId, decision: input.decision } } });
      return updated;
    });
  }

  async operationInspectors(actor: InspectionActor, branchId?: string) {
    checkRole(actor, operationsRoles);
    const targetBranchIds = branchId ? [branchId] : actor.roles.includes('SUPER_ADMIN') ? undefined : actor.branchIds;

    const inspectors = await this.db.employee.findMany({
      where: {
        active: true,
        status: 'ACTIVE',
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
    });
    if (!request || request.status === 'CANCELLED') throw new HttpError(404, 'INSPECTION_REQUEST_NOT_FOUND');

    const inspector = await this.db.employee.findUnique({
      where: { userId: input.inspectorId },
      include: { user: true, roleAssignments: { include: { role: true } }, branchAssignments: true },
    });

    if (
      !inspector ||
      inspector.user.status !== 'ACTIVE' ||
      !inspector.active ||
      inspector.status !== 'ACTIVE' ||
      ![inspector.role, ...inspector.roleAssignments.map(item => item.role.key)].includes('INSPECTOR') ||
      (request.branchId && !inspector.branchAssignments.some(item => item.branchId === request.branchId))
    ) {
      throw new HttpError(400, 'INSPECTOR_NOT_ELIGIBLE');
    }

    return this.db.$transaction(async tx => {
      const assignment = await tx.inspectionAssignment.upsert({
        where: { requestId },
        update: {
          inspectorId: input.inspectorId,
          assignedById: actor.userId,
          scheduledAt: input.scheduledAt,
          locationType: input.locationType,
          address: input.address,
          instructions: input.instructions,
          status: 'ASSIGNED',
        },
        create: {
          requestId,
          inspectorId: input.inspectorId,
          assignedById: actor.userId,
          scheduledAt: input.scheduledAt,
          locationType: input.locationType,
          address: input.address,
          instructions: input.instructions,
        },
      });

      await tx.inspectionRequest.update({
        where: { id: requestId },
        data: { status: 'SCHEDULED', scheduledAt: input.scheduledAt ?? new Date() },
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'INSPECTION_ASSIGNED',
          entityType: 'InspectionAssignment',
          entityId: assignment.id,
          details: { requestId, inspectorId: input.inspectorId, scheduledAt: input.scheduledAt?.toISOString() },
        },
      });

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
    if (!assignment || !['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'].includes(assignment.status)) {
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
        data: { status: 'SCHEDULED', scheduledAt: input.scheduledAt },
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

  async reviewQueue(actor: InspectionActor) {
    checkRole(actor, reviewerRoles);
    const isSuperAdmin = actor.roles.includes('SUPER_ADMIN');
    return this.db.inspectionReport.findMany({
      where: {
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        ...(isSuperAdmin ? {} : { inspectorId: { not: actor.userId } }),
        ...this.reviewScope(actor),
      },
      orderBy: { submittedAt: 'asc' },
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
      include: { answers: true, defects: true, media: true },
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
