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
const reviewerRoles = ['INSPECTION_REVIEWER', 'ADMIN', 'SUPER_ADMIN'];

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
    if (!['ASSIGNED', 'CONFIRMED', 'RESCHEDULED'].includes(assignment.status)) {
      throw new HttpError(409, 'INSPECTION_NOT_STARTABLE');
    }

    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');

    return this.db.$transaction(async tx => {
      const existing = await tx.inspectionReport.findFirst({
        where: isElevated
          ? {
              assignmentId: id,
              status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            }
          : {
              assignmentId: id,
              inspectorId: actor.userId,
              status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] },
            },
        orderBy: { revision: 'desc' },
        include: {
          answers: true,
          defects: true,
          media: true,
        },
      });

      const template = currentTemplate();
      const report = existing || await tx.inspectionReport.create({
        data: {
          requestId: assignment.request.id,
          assignmentId: id,
          inspectorId: actor.userId,
          revision: 1,
          templateKey: template.key,
          templateVersion: template.version,
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
      where: isElevated ? { id } : { id, inspectorId: actor.userId },
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
      recordVersion: number;
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
        : { id, inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } },
    });

    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_EDITABLE');

    if (!templateFor(report.templateKey, report.templateVersion)) {
      throw new HttpError(409, 'INSPECTION_TEMPLATE_UNAVAILABLE');
    }

    if (input.answers.some(answer => !knownTemplateItem(report.templateKey, report.templateVersion, answer.itemKey))) {
      throw new HttpError(400, 'INSPECTION_TEMPLATE_ITEM_INVALID');
    }

    if (report.recordVersion !== input.recordVersion) {
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

  async submit(actor: InspectionActor, id: string, recordVersion: number) {
    checkRole(actor, inspectorRoles);
    const isElevated = actor.roles.includes('SUPER_ADMIN') || actor.roles.includes('ADMIN');

    const report = await this.db.inspectionReport.findFirst({
      where: isElevated
        ? { id, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } }
        : { id, inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } },
      include: {
        answers: true,
        defects: true,
        media: true,
        request: { include: { lead: true } },
      },
    });

    if (!report) throw new HttpError(409, 'INSPECTION_REPORT_NOT_SUBMITTABLE');
    if (report.recordVersion !== recordVersion) throw new HttpError(409, 'INSPECTION_REPORT_VERSION_CONFLICT');

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
        : { id: reportId, inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } },
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
        : { id: reportId, inspectorId: actor.userId, status: { in: ['DRAFT', 'SYNC_PENDING', 'REWORK_REQUIRED'] } },
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
    return this.db.inspectionReport.findMany({
      where: {
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        inspectorId: { not: actor.userId }, // Self-review cannot appear in queue
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
    const report = await this.db.inspectionReport.findFirst({
      where: {
        id,
        inspectorId: { not: actor.userId }, // Inspector cannot inspect own report
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

    // Strict boundary: Self-approval forbidden
    if (report.inspectorId === actor.userId) {
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
