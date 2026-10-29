import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { HttpError } from './errors.js';
import type { NotificationService } from './notification/notification-service.js';
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary.js';
import { issueRealtimeTicket } from './connect-realtime.js';

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function verifyConnectSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuffer = Buffer.from(signature, 'utf8');
  const hmacBuffer = Buffer.from(hmac, 'utf8');
  if (sigBuffer.length !== hmacBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, hmacBuffer);
}

export interface LinkVehicleInput {
  token?: string;
  qrUrl?: string;
  claimCode?: string;
}

export interface RequestStickerInput {
  deliveryAddress?: string;
  city?: string;
  pincode?: string;
  instructions?: string;
}

export type PublicConnectAlertInput = {
  reason: 'BLOCKING_ACCESS' | 'LIGHTS_ON' | 'DAMAGE_OR_ACCIDENT' | 'SAFETY_CONCERN' | 'OTHER';
  message?: string;
  photoUrls?: string[];
  photos?: string[];
  visitorIp?: string;
};

const ACTIVE_CONNECT_STATUSES = ['ACTIVE', 'DISABLED'];

function stickerPublicUrl(token: string) {
  const origin = (process.env.CONNECT_PUBLIC_WEB_URL || 'https://www.vmotiv.in').replace(/\/$/, '');
  return `${origin}/connect/${encodeURIComponent(token)}`;
}

type StickerAsset = { secureUrl: string; publicId: string };

/** Creates the printable PNG in memory and persists it in Cloudinary only. */
export async function uploadConnectStickerAsset(publicUrl: string): Promise<StickerAsset> {
  if (!isCloudinaryConfigured()) {
    throw new HttpError(503, 'CONNECT_STICKER_STORAGE_UNAVAILABLE');
  }
  try {
    const png = await QRCode.toBuffer(publicUrl, {
      type: 'png',
      width: 1024,
      margin: 3,
      errorCorrectionLevel: 'M',
      color: { dark: '#061A38', light: '#FFFFFFFF' },
    });
    const uploaded = await uploadToCloudinary({
      buffer: png,
      folder: 'vmotiv/connect-stickers',
      filename: `connect-${crypto.randomUUID()}`,
      mimeType: 'image/png',
      resourceType: 'image',
      tags: ['vmotiv-connect', 'qr-sticker'],
    });
    return { secureUrl: uploaded.secureUrl, publicId: uploaded.publicId };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('[CONNECT_STICKER_CLOUDINARY_UPLOAD_FAILED]', error);
    throw new HttpError(503, 'CONNECT_STICKER_STORAGE_UNAVAILABLE');
  }
}

export class PrismaConnectStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly notificationService?: NotificationService,
    private readonly uploadStickerAsset: (publicUrl: string) => Promise<StickerAsset> = uploadConnectStickerAsset,
  ) {}

  private async assertVehicleOwnership(userId: string, vehicleId: string) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: userId }, select: { id: true } });
    const internalUserId = user ? user.id : userId;

    const vehicle = await this.db.customerVehicle.findFirst({
      where: {
        id: vehicleId,
        userId: internalUserId,
        isArchived: false,
      },
    });

    if (!vehicle) {
      throw new HttpError(404, 'GARAGE_VEHICLE_NOT_FOUND');
    }
    return { vehicle, internalUserId };
  }

  async getConnectStatus(userId: string, vehicleId: string) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);

    const activeLink = await this.db.customerGarageConnectLink.findFirst({
      where: {
        vehicleId,
        userId: internalUserId,
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        callSessions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    const alertCount = activeLink
      ? await this.db.connectNotificationReference.count({ where: { linkId: activeLink.id } })
      : 0;
    const unreadAlerts = activeLink
      ? await this.db.connectNotificationReference.count({ where: { linkId: activeLink.id, isRead: false } })
      : 0;
    const callCount = activeLink
      ? await this.db.connectCallSessionReference.count({ where: { linkId: activeLink.id } })
      : 0;

    return {
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      registrationNumber: vehicle.registrationNumber,
      connectStatus: vehicle.connectStatus,
      isLinked: Boolean(activeLink && activeLink.status === 'ACTIVE'),
      link: activeLink
        ? {
            id: activeLink.id,
            status: activeLink.status,
            qrTokenPreview: activeLink.qrTokenPreview,
            createdAt: activeLink.createdAt,
            lastSyncedAt: activeLink.lastSyncedAt,
            stickerImageUrl: typeof (activeLink.metadata as Record<string, unknown> | null)?.stickerImageUrl === 'string'
              ? (activeLink.metadata as Record<string, unknown>).stickerImageUrl
              : null,
          }
        : null,
      stats: {
        totalAlerts: alertCount,
        unreadAlerts,
        totalCalls: callCount,
      },
      recentAlerts: activeLink?.notifications || [],
      recentCalls: activeLink?.callSessions || [],
    };
  }

  async linkVehicle(userId: string, vehicleId: string, input: LinkVehicleInput) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);

    // Extract raw token from token or full URL
    let rawToken = input.token?.trim() || '';
    if (!rawToken && input.qrUrl) {
      const match = input.qrUrl.match(/\/v\/([a-zA-Z0-9_-]{16,128})/);
      const urlToken = match?.[1];
      if (urlToken) {
        rawToken = urlToken;
      }
    }

    if (!rawToken && input.claimCode) {
      // Standardize claim code as a verified challenge token
      rawToken = input.claimCode.trim().toUpperCase();
    }

    if (!rawToken || rawToken.length < 8) {
      throw new HttpError(400, 'INVALID_CONNECT_QR_TOKEN');
    }

    const qrTokenHash = sha256(rawToken);

    // Verify token is not currently claimed by another vehicle
    const existingActive = await this.db.customerGarageConnectLink.findFirst({
      where: {
        qrTokenHash,
        status: { in: ['ACTIVE', 'DISABLED'] },
        vehicleId: { not: vehicleId },
      },
    });

    if (existingActive) {
      throw new HttpError(409, 'CONNECT_QR_ALREADY_LINKED_TO_ANOTHER_VEHICLE');
    }

    const qrTokenPreview = rawToken.length > 12
      ? `vm_${rawToken.slice(0, 4)}...${rawToken.slice(-4)}`
      : `vm_${rawToken}`;

    return this.db.$transaction(async (tx) => {
      // Revoke any previous links for this vehicle
      await tx.customerGarageConnectLink.updateMany({
        where: {
          vehicleId,
          status: { in: ['ACTIVE', 'DISABLED'] },
        },
        data: {
          status: 'REVOKED',
        },
      });

      const newLink = await tx.customerGarageConnectLink.create({
        data: {
          userId: internalUserId,
          vehicleId,
          qrTokenHash,
          qrTokenPreview,
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
        },
      });

      await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: {
          connectStatus: 'CONNECTED',
          connectDeviceId: newLink.id,
        },
      });

      await tx.connectIntegrationAuditEvent.create({
        data: {
          userId: internalUserId,
          action: 'CONNECT_QR_LINKED',
          entityType: 'CustomerGarageConnectLink',
          entityId: newLink.id,
          details: {
            vehicleId,
            make: vehicle.make,
            model: vehicle.model,
            registrationNumber: vehicle.registrationNumber,
            qrTokenPreview,
          },
        },
      });

      return {
        success: true,
        link: newLink,
        message: 'V MOTIV Connect™ QR Sticker successfully linked to your vehicle.',
      };
    });
  }

  /**
   * Issues a V2-owned QR sticker. The raw token is deliberately returned only
   * once, to its authenticated owner; the database retains only its SHA-256
   * hash. Reissuing invalidates the previous public sticker immediately.
   */
  async issueSticker(userId: string, vehicleId: string) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const qrTokenHash = sha256(rawToken);
    const qrTokenPreview = `vm_${rawToken.slice(0, 5)}...${rawToken.slice(-5)}`;
    const publicUrl = stickerPublicUrl(rawToken);
    const stickerAsset = await this.uploadStickerAsset(publicUrl);

    const link = await this.db.$transaction(async (tx) => {
      await tx.customerGarageConnectLink.updateMany({
        where: { vehicleId, status: { in: ACTIVE_CONNECT_STATUSES } },
        data: { status: 'REVOKED' },
      });

      const created = await tx.customerGarageConnectLink.create({
        data: {
          userId: internalUserId,
          vehicleId,
          qrTokenHash,
          qrTokenPreview,
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          metadata: {
            issuer: 'VMOTIV_V2',
            issuedAt: new Date().toISOString(),
            storage: 'CLOUDINARY',
            stickerImageUrl: stickerAsset.secureUrl,
            stickerImagePublicId: stickerAsset.publicId,
          },
        },
      });

      await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: { connectStatus: 'CONNECTED', connectDeviceId: created.id },
      });

      await tx.connectIntegrationAuditEvent.create({
        data: {
          userId: internalUserId,
          action: 'CONNECT_QR_ISSUED',
          entityType: 'CustomerGarageConnectLink',
          entityId: created.id,
          details: { vehicleId, vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, qrTokenPreview },
        },
      });
      return created;
    });

    return {
      success: true,
      link: {
        id: link.id,
        status: link.status,
        qrTokenPreview: link.qrTokenPreview,
        createdAt: link.createdAt,
      },
      // Never persist this URL or expose it from status/list APIs.
      stickerUrl: publicUrl,
      stickerImageUrl: stickerAsset.secureUrl,
      message: 'Your V MOTIV Connect QR sticker is ready. Save or print it now; reissuing will invalidate this sticker.',
    };
  }

  async lookupPublicSticker(rawToken: string) {
    const link = await this.db.customerGarageConnectLink.findFirst({
      where: { qrTokenHash: sha256(rawToken), status: { in: ACTIVE_CONNECT_STATUSES } },
      include: { vehicle: { select: { make: true, model: true, year: true } } },
    });

    if (!link) throw new HttpError(404, 'CONNECT_STICKER_NOT_FOUND');
    if (link.status !== 'ACTIVE') {
      return {
        active: false,
        vehicle: { nickname: 'V MOTIV protected vehicle', messagingEnabled: false, callingEnabled: false },
      };
    }

    return {
      active: true,
      vehicle: {
        nickname: `${link.vehicle.year} ${link.vehicle.make} ${link.vehicle.model}`,
        make: link.vehicle.make,
        model: link.vehicle.model,
        year: link.vehicle.year,
        messagingEnabled: true,
        callingEnabled: true,
      },
    };
  }

  async uploadPublicAlertPhoto(rawToken: string, base64Data: string, mimeType = 'image/jpeg') {
    const link = await this.db.customerGarageConnectLink.findFirst({
      where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' },
    });
    if (!link) throw new HttpError(404, 'CONNECT_STICKER_NOT_FOUND');

    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      throw new HttpError(400, 'FILE_TOO_LARGE');
    }

    if (isCloudinaryConfigured()) {
      try {
        const uploaded = await uploadToCloudinary({
          buffer,
          folder: 'vmotiv/connect-alerts',
          mimeType,
        });
        return { url: uploaded.url, secureUrl: uploaded.secureUrl };
      } catch (e) {
        console.warn('[CONNECT_CLOUDINARY_UPLOAD_FALLBACK]', e);
      }
    }

    const storageBase = process.env.STORAGE_LOCAL_DIR || process.cwd();
    const filename = `connect-alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const uploadDir = path.resolve(storageBase, 'storage/uploads/connect');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
    return {
      url: `/storage/uploads/connect/${filename}`,
      secureUrl: `/storage/uploads/connect/${filename}`,
    };
  }

  async createPublicAlert(rawToken: string, input: PublicConnectAlertInput) {
    const link = await this.db.customerGarageConnectLink.findFirst({
      where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' },
      include: { vehicle: { select: { make: true, model: true } } },
    });
    if (!link) throw new HttpError(404, 'CONNECT_STICKER_NOT_FOUND');

    const recent = await this.db.connectNotificationReference.findFirst({
      where: {
        linkId: link.id,
        eventType: 'CONNECT_OWNER_ALERT_CREATED',
        reason: input.reason,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });
    if (recent) return { success: true, alertId: recent.id, deduplicated: true };

    const rawPhotos = input.photoUrls || input.photos || [];
    const resolvedPhotoUrls: string[] = [];
    for (const item of rawPhotos) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const trimmed = item.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/storage/')) {
        resolvedPhotoUrls.push(trimmed);
      } else if (trimmed.startsWith('data:image/') || trimmed.length > 100) {
        try {
          const uploaded = await this.uploadPublicAlertPhoto(rawToken, trimmed);
          resolvedPhotoUrls.push(uploaded.secureUrl || uploaded.url);
        } catch (e) {
          console.warn('[CONNECT_ALERT_PHOTO_UPLOAD_ERROR]', e);
        }
      }
    }

    const record = await this.db.connectNotificationReference.create({
      data: {
        linkId: link.id,
        userId: link.userId,
        vehicleId: link.vehicleId,
        eventType: 'CONNECT_OWNER_ALERT_CREATED',
        reason: input.reason,
        messagePreview: input.message?.trim().slice(0, 300) || null,
        photoUrls: resolvedPhotoUrls.length ? resolvedPhotoUrls : undefined,
        visitorIpHash: input.visitorIp ? sha256(input.visitorIp).slice(0, 16) : null,
      },
    });

    const photoBadge = resolvedPhotoUrls.length > 0
      ? ` (📷 ${resolvedPhotoUrls.length} photo${resolvedPhotoUrls.length > 1 ? 's' : ''} attached)`
      : '';

    await this.dispatchOwnerNotification({
      type: 'CONNECT_OWNER_ALERT_CREATED',
      userId: link.userId,
      vehicleId: link.vehicleId,
      referenceId: record.id,
      title: `V MOTIV Connect: ${input.reason.replace(/_/g, ' ').toLowerCase()}`,
      body: input.message?.trim()
        ? `${input.message.trim()}${photoBadge}`
        : `A passerby needs your attention for your ${link.vehicle.make} ${link.vehicle.model}.${photoBadge}`,
      priority: input.reason === 'SAFETY_CONCERN' ? 'URGENT' : 'HIGH',
    });

    return { success: true, alertId: record.id, deduplicated: false };
  }

  async requestPublicCall(rawToken: string, visitorIp?: string) {
    const link = await this.db.customerGarageConnectLink.findFirst({
      where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' },
      include: { vehicle: { select: { make: true, model: true } } },
    });
    if (!link) throw new HttpError(404, 'CONNECT_STICKER_NOT_FOUND');

    const existing = await this.db.connectCallSessionReference.findFirst({
      where: { linkId: link.id, status: { in: ['RINGING', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { callSessionId: existing.callSessionId, status: existing.status, alreadyPending: true };

    const callSessionId = crypto.randomUUID();
    const [call] = await this.db.$transaction(async (tx) => {
      const createdCall = await tx.connectCallSessionReference.create({
        data: { linkId: link.id, callSessionId, provider: 'V_MOTIV_CONNECT', status: 'RINGING', callerType: 'visitor' },
      });
      await tx.connectNotificationReference.create({
        data: {
          linkId: link.id,
          userId: link.userId,
          vehicleId: link.vehicleId,
          eventType: 'CONNECT_CALL_REQUESTED',
          reason: 'CALL_REQUEST',
          messagePreview: 'A passerby is requesting a privacy-protected call.',
          callSessionId,
          visitorIpHash: visitorIp ? sha256(visitorIp).slice(0, 16) : null,
        },
      });
      return [createdCall];
    });

    await this.dispatchOwnerNotification({
      type: 'CONNECT_CALL_REQUESTED',
      userId: link.userId,
      vehicleId: link.vehicleId,
      referenceId: call.id,
      title: 'Incoming V MOTIV Connect request',
      body: `A passerby wants to contact you about your ${link.vehicle.make} ${link.vehicle.model}.`,
      priority: 'URGENT',
      callSessionId,
    });

    return { callSessionId, status: 'RINGING', alreadyPending: false };
  }

  async listIncomingCalls(userId: string) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: userId }, select: { id: true } });
    const internalUserId = user ? user.id : userId;
    return this.db.connectCallSessionReference.findMany({
      where: { link: { userId: internalUserId }, status: { in: ['RINGING', 'ACCEPTED'] } },
      include: { link: { select: { vehicleId: true, vehicle: { select: { make: true, model: true, year: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
  }

  async respondToIncomingCall(userId: string, callSessionId: string, decision: 'ACCEPT' | 'DECLINE') {
    const user = await this.db.user.findFirst({ where: { firebaseUid: userId }, select: { id: true } });
    const internalUserId = user ? user.id : userId;
    const call = await this.db.connectCallSessionReference.findFirst({
      where: { callSessionId, link: { userId: internalUserId } },
      include: { link: { select: { userId: true, vehicleId: true } } },
    });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    if (call.status !== 'RINGING') throw new HttpError(409, 'CONNECT_CALL_NOT_RINGING');

    const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    const updated = await this.db.connectCallSessionReference.update({ where: { id: call.id }, data: { status } });
    await this.db.connectIntegrationAuditEvent.create({
      data: {
        userId: internalUserId,
        action: decision === 'ACCEPT' ? 'CONNECT_CALL_ACCEPTED' : 'CONNECT_CALL_DECLINED',
        entityType: 'ConnectCallSessionReference',
        entityId: call.id,
        details: { callSessionId, vehicleId: call.link.vehicleId },
      },
    });
    return { callSessionId: updated.callSessionId, status: updated.status };
  }

  async addPublicCallSignal(rawToken: string, callSessionId: string, kind: string, payload: Record<string, unknown>) {
    const link = await this.db.customerGarageConnectLink.findFirst({ where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, linkId: link?.id } });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    if (!['RINGING', 'ACCEPTED'].includes(call.status)) throw new HttpError(409, 'CONNECT_CALL_CLOSED');
    await this.db.connectCallSignal.create({ data: { callId: call.id, senderRole: 'VISITOR', kind, payload: payload as Prisma.InputJsonValue } });
    return { success: true };
  }

  async listPublicCallSignals(rawToken: string, callSessionId: string, after?: Date) {
    const link = await this.db.customerGarageConnectLink.findFirst({ where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, linkId: link?.id } });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    const signals = await this.db.connectCallSignal.findMany({ where: { callId: call.id, senderRole: 'OWNER', ...(after ? { createdAt: { gt: after } } : {}) }, orderBy: { createdAt: 'asc' }, take: 100 });
    return { status: call.status, items: signals };
  }

  async addOwnerCallSignal(firebaseUid: string, callSessionId: string, kind: string, payload: Record<string, unknown>) {
    const user = await this.db.user.findUnique({ where: { firebaseUid }, select: { id: true } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, link: { userId: user?.id } } });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    if (call.status !== 'ACCEPTED') throw new HttpError(409, 'CONNECT_CALL_NOT_ACCEPTED');
    await this.db.connectCallSignal.create({ data: { callId: call.id, senderRole: 'OWNER', kind, payload: payload as Prisma.InputJsonValue } });
    return { success: true };
  }

  async listOwnerCallSignals(firebaseUid: string, callSessionId: string, after?: Date) {
    const user = await this.db.user.findUnique({ where: { firebaseUid }, select: { id: true } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, link: { userId: user?.id } } });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    const signals = await this.db.connectCallSignal.findMany({ where: { callId: call.id, senderRole: 'VISITOR', ...(after ? { createdAt: { gt: after } } : {}) }, orderBy: { createdAt: 'asc' }, take: 100 });
    return { status: call.status, items: signals };
  }

  async issuePublicRealtimeTicket(rawToken: string, callSessionId: string) {
    const link = await this.db.customerGarageConnectLink.findFirst({ where: { qrTokenHash: sha256(rawToken), status: 'ACTIVE' } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, linkId: link?.id } });
    if (!call) throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    return { ticket: issueRealtimeTicket({ callSessionId, role: 'VISITOR', exp: Date.now() + 15 * 60_000 }), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  async issueOwnerRealtimeTicket(firebaseUid: string, callSessionId: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid }, select: { id: true } });
    const call = await this.db.connectCallSessionReference.findFirst({ where: { callSessionId, link: { userId: user?.id } } });
    if (!call || call.status !== 'ACCEPTED') throw new HttpError(404, 'CONNECT_CALL_NOT_FOUND');
    return { ticket: issueRealtimeTicket({ callSessionId, role: 'OWNER', exp: Date.now() + 15 * 60_000 }), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  private async dispatchOwnerNotification(input: {
    type: 'CONNECT_OWNER_ALERT_CREATED' | 'CONNECT_CALL_REQUESTED';
    userId: string;
    vehicleId: string;
    referenceId: string;
    title: string;
    body: string;
    priority: 'HIGH' | 'URGENT';
    callSessionId?: string;
  }) {
    if (!this.notificationService) return;
    try {
      await this.notificationService.dispatchDomainEvent({
        type: input.type,
        actorId: input.userId,
        referenceId: input.referenceId,
        entityType: 'CustomerGarageConnectLink',
        title: input.title,
        body: input.body,
        category: 'SUPPORT',
        priority: input.priority,
        recipientUserIds: [input.userId],
        deepLink: `vmotiv://garage/${input.vehicleId}`,
        metadata: { targetApp: 'CUSTOMER', vehicleId: input.vehicleId, callSessionId: input.callSessionId },
      });
      // Vercel functions have no resident worker. Dispatch urgent call tickets in
      // this request as well, so an incoming Connect request is not held until a
      // separately deployed worker wakes up. The durable queue remains the
      // fallback for all failures and retry handling.
      if (input.type === 'CONNECT_CALL_REQUESTED') {
        await this.notificationService.drainPushTickets(10);
      }
    } catch (error) {
      // A notification-delivery outage must never lose the durable Connect event.
      console.error('[CONNECT_NOTIFICATION_DISPATCH_FAILED]', error);
    }
  }

  async toggleConnectStatus(userId: string, vehicleId: string, enabled: boolean) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);

    const activeLink = await this.db.customerGarageConnectLink.findFirst({
      where: {
        vehicleId,
        userId: internalUserId,
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeLink) {
      throw new HttpError(404, 'CONNECT_LINK_NOT_FOUND');
    }

    const nextStatus = enabled ? 'ACTIVE' : 'DISABLED';

    await this.db.$transaction(async (tx) => {
      await tx.customerGarageConnectLink.update({
        where: { id: activeLink.id },
        data: { status: nextStatus },
      });

      await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: { connectStatus: enabled ? 'CONNECTED' : 'DISABLED' },
      });

      await tx.connectIntegrationAuditEvent.create({
        data: {
          userId: internalUserId,
          action: enabled ? 'CONNECT_QR_ENABLED' : 'CONNECT_QR_DISABLED',
          entityType: 'CustomerGarageConnectLink',
          entityId: activeLink.id,
          details: { vehicleId, previousStatus: activeLink.status, newStatus: nextStatus },
        },
      });
    });

    return {
      success: true,
      status: nextStatus,
      connectStatus: enabled ? 'CONNECTED' : 'DISABLED',
    };
  }

  async revokeConnectLink(userId: string, vehicleId: string, reason?: string) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);

    const activeLink = await this.db.customerGarageConnectLink.findFirst({
      where: {
        vehicleId,
        userId: internalUserId,
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
    });

    if (!activeLink) {
      throw new HttpError(404, 'CONNECT_LINK_NOT_FOUND');
    }

    await this.db.$transaction(async (tx) => {
      await tx.customerGarageConnectLink.update({
        where: { id: activeLink.id },
        data: { status: 'REVOKED' },
      });

      await tx.customerVehicle.update({
        where: { id: vehicleId },
        data: {
          connectStatus: 'NOT_CONNECTED',
          connectDeviceId: null,
        },
      });

      await tx.connectIntegrationAuditEvent.create({
        data: {
          userId: internalUserId,
          action: 'CONNECT_QR_REVOKED',
          entityType: 'CustomerGarageConnectLink',
          entityId: activeLink.id,
          details: { vehicleId, reason: reason || 'Revoked by owner from My Garage' },
        },
      });
    });

    return {
      success: true,
      revoked: true,
      message: 'QR code revoked. Public scans will no longer reach your account.',
    };
  }

  async requestPhysicalSticker(userId: string, vehicleId: string, input: RequestStickerInput) {
    const { vehicle, internalUserId } = await this.assertVehicleOwnership(userId, vehicleId);

    const requestId = crypto.randomUUID();

    await this.db.connectIntegrationAuditEvent.create({
      data: {
        userId: internalUserId,
        action: 'CONNECT_STICKER_ORDERED',
        entityType: 'CustomerVehicle',
        entityId: vehicleId,
        details: {
          requestId,
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          registrationNumber: vehicle.registrationNumber,
          deliveryAddress: input.deliveryAddress,
          city: input.city,
          pincode: input.pincode,
          instructions: input.instructions,
        },
      },
    });

    return {
      success: true,
      requestId,
      status: 'PROCESSING',
      message: 'Your printed-sticker request has been recorded. A V MOTIV fulfilment team member must confirm dispatch before delivery can be promised.',
      estimatedDeliveryDays: 3,
    };
  }

  async listAlerts(userId: string, vehicleId?: string, page = 1, limit = 20) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: userId }, select: { id: true } });
    const internalUserId = user ? user.id : userId;

    const where: any = { userId: internalUserId };
    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    const skip = Math.max(0, (page - 1) * limit);
    const [items, total] = await Promise.all([
      this.db.connectNotificationReference.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.connectNotificationReference.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAlertRead(userId: string, alertId: string) {
    const user = await this.db.user.findFirst({ where: { firebaseUid: userId }, select: { id: true } });
    const internalUserId = user ? user.id : userId;

    const alert = await this.db.connectNotificationReference.findFirst({
      where: { id: alertId, userId: internalUserId },
    });

    if (!alert) {
      throw new HttpError(404, 'CONNECT_ALERT_NOT_FOUND');
    }

    return this.db.connectNotificationReference.update({
      where: { id: alertId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async processConnectWebhook(payload: {
    eventType: string;
    tokenHash: string;
    reason?: string;
    message?: string;
    callSessionId?: string;
    visitorIp?: string;
    metadata?: Record<string, unknown>;
  }) {
    const link = await this.db.customerGarageConnectLink.findFirst({
      where: {
        qrTokenHash: payload.tokenHash,
        status: 'ACTIVE',
      },
      include: {
        vehicle: true,
        user: true,
      },
    });

    if (!link) {
      // Ignored or unlinked QR
      return { received: true, matched: false };
    }

    const visitorIpHash = payload.visitorIp ? sha256(payload.visitorIp).slice(0, 16) : null;

    // Deduplication check: Don't create duplicate alerts for exact same reason/token within 2 minutes
    const recentDuplicate = await this.db.connectNotificationReference.findFirst({
      where: {
        linkId: link.id,
        eventType: payload.eventType,
        reason: payload.reason || null,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });

    if (recentDuplicate) {
      return { received: true, matched: true, deduplicated: true };
    }

    const notificationRecord = await this.db.connectNotificationReference.create({
      data: {
        linkId: link.id,
        userId: link.userId,
        vehicleId: link.vehicleId,
        eventType: payload.eventType,
        reason: payload.reason || null,
        messagePreview: payload.message ? payload.message.slice(0, 300) : null,
        callSessionId: payload.callSessionId || null,
        visitorIpHash,
      },
    });

    if (payload.callSessionId) {
      await this.db.connectCallSessionReference.upsert({
        where: { callSessionId: payload.callSessionId },
        create: {
          linkId: link.id,
          callSessionId: payload.callSessionId,
          status: 'requested',
          provider: 'webrtc',
        },
        update: {
          status: 'active',
        },
      });
    }

    // Trigger V2 in-app notification if notificationService provided
    if (this.notificationService) {
      try {
        await this.notificationService.dispatchDomainEvent({
          type: (payload.eventType as any) || 'CONNECT_OWNER_ALERT_CREATED',
          actorId: link.userId,
          referenceId: notificationRecord.id,
          entityType: 'ConnectNotificationReference',
          title: `V MOTIV Connect: Alert for ${link.vehicle.make} ${link.vehicle.model}`,
          body: payload.message || `A passerby reported: ${payload.reason?.replace(/_/g, ' ') || 'Vehicle Attention Needed'}`,
          category: 'SUPPORT',
          recipientUserIds: [link.userId],
          deepLink: `vmotiv://garage/${link.vehicleId}`,
        });
      } catch (err) {
        console.error('[CONNECT_WEBHOOK] Failed to dispatch in-app notification:', err);
      }
    }

    return {
      received: true,
      matched: true,
      alertId: notificationRecord.id,
      vehicleId: link.vehicleId,
    };
  }
}
