import { Prisma, PrismaClient, type NotificationPriority, type EmployeeRole } from '@prisma/client';
import { ExpoPushClient, isExpoPushToken, type ExpoPushMessage } from './expo-push.js';
import type { DomainEventPayload } from './types.js';

export interface NotificationQueryOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  category?: string;
}

const VALID_EMPLOYEE_ROLES = new Set<EmployeeRole>([
  'SUPER_ADMIN',
  'SECURITY_ADMIN',
  'SUPPORT_ADMIN',
  'SALES_EXECUTIVE',
  'INSPECTOR',
  'INSPECTION_REVIEWER',
  'OPERATIONS_MANAGER',
  'INVENTORY_MANAGER',
  'LISTING_EXECUTIVE',
  'PRICING_APPROVER',
  'FINANCE',
  'ADMIN',
  'AUDIT_VIEWER',
  'SERVICE_ADVISOR',
  'SERVICE_DISPATCH',
  'PICKUP_DRIVER',
  'HUB_MANAGER',
  'TECHNICIAN',
  'SERVICE_QC',
  'SERVICE_MANAGER',
  'RENTAL_MANAGER',
  'RENTAL_DISPATCH',
  'RENTAL_FLEET_OFFICER',
]);

const ROLE_SYNONYM_MAP: Record<string, EmployeeRole[]> = {
  SERVICE_ADVISOR: ['SERVICE_ADVISOR'],
  SERVICE_DISPATCH: ['SERVICE_DISPATCH'],
  PICKUP_DRIVER: ['PICKUP_DRIVER'],
  HUB_MANAGER: ['HUB_MANAGER'],
  TECHNICIAN: ['TECHNICIAN'],
  SERVICE_QC: ['SERVICE_QC'],
  SERVICE_MANAGER: ['SERVICE_MANAGER'],
  RENTAL_MANAGER: ['RENTAL_MANAGER'],
  RENTAL_DISPATCH: ['RENTAL_DISPATCH'],
  RENTAL_FLEET_OFFICER: ['RENTAL_FLEET_OFFICER'],
  FINANCE_APPROVER: ['FINANCE'],
  FINANCE_MANAGER: ['FINANCE'],
  FINANCE_EXECUTIVE: ['FINANCE'],
  FINANCE: ['FINANCE'],
  SALES: ['SALES_EXECUTIVE'],
  SALES_MANAGER: ['SALES_EXECUTIVE'],
  SALES_EXECUTIVE: ['SALES_EXECUTIVE'],
  OPERATIONS: ['OPERATIONS_MANAGER'],
  OPERATIONS_MANAGER: ['OPERATIONS_MANAGER'],
  DISPATCH: ['OPERATIONS_MANAGER'],
  REVIEWER: ['INSPECTION_REVIEWER'],
  INSPECTION_REVIEWER: ['INSPECTION_REVIEWER'],
  INSPECTOR: ['INSPECTOR'],
  ADMIN: ['ADMIN', 'SUPER_ADMIN'],
  SUPER_ADMIN: ['SUPER_ADMIN'],
};

export class NotificationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly pushClient: ExpoPushClient = new ExpoPushClient(process.env.EXPO_ACCESS_TOKEN)
  ) {}

  /**
   * Dispatches a domain event to all eligible recipients across configured channels.
   * Can be executed within an existing Prisma transaction or standalone.
   */
  async dispatchDomainEvent(
    event: DomainEventPayload,
    txClient?: Prisma.TransactionClient
  ): Promise<{ notificationsCount: number; pushTicketsCount: number; emailsCount: number }> {
    try {
      const client = txClient || this.db;
      const recipientIds = await this.resolveRecipients(event, client);

      if (!recipientIds.length) {
        return { notificationsCount: 0, pushTicketsCount: 0, emailsCount: 0 };
      }

      let pushTicketsCount = 0;
      let emailsCount = 0;

      const now = new Date();

      for (const userId of recipientIds) {
        // 1. Fetch preferences (or defaults)
        const pref = await client.notificationPreference.findUnique({ where: { userId } });
        const inAppEnabled = pref?.inAppEnabled ?? true;
        const pushEnabled = pref?.pushEnabled ?? true;
        const emailEnabled = pref?.emailEnabled ?? true;
        const quietHoursEnabled = pref?.quietHoursEnabled ?? false;

      const inQuietHours = quietHoursEnabled && this.isQuietHours(pref?.quietHoursStart, pref?.quietHoursEnd, now);
      const isUrgent = event.priority === 'URGENT';

      // 2. Durable In-App Notification (always created if inAppEnabled)
      if (inAppEnabled) {
        const notif = await client.notification.create({
          data: {
            userId,
            eventType: event.type,
            category: event.category || 'GENERAL',
            priority: event.priority || 'NORMAL',
            title: event.title,
            body: event.body,
            entityType: event.entityType,
            entityId: event.referenceId,
            deepLink: event.deepLink ?? event.actionUrl,
            targetApp: (event.metadata?.targetApp as string) || undefined,
            metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : undefined,
          },
        });

        await client.notificationDelivery.create({
          data: {
            notificationId: notif.id,
            channel: 'IN_APP',
            status: 'DELIVERED',
            sentAt: now,
          },
        });

        // 3. Queue Push Notification (if push enabled and not silenced by quiet hours)
        if (pushEnabled && (!inQuietHours || isUrgent)) {
          const targetApp = (event.metadata?.targetApp as string) || undefined;
          const devices = await client.pushDevice.findMany({
            where: {
              userId,
              active: true,
              ...(targetApp ? { app: targetApp } : {}),
            },
          });

          for (const device of devices) {
            if (isExpoPushToken(device.token)) {
              await client.pushTicket.create({
                data: {
                  deviceId: device.id,
                  notificationId: notif.id,
                  title: event.title,
                  body: event.body,
                  data: {
                    notificationId: notif.id,
                    eventType: event.type,
                    deepLink: event.deepLink,
                    referenceId: event.referenceId,
                    entityType: event.entityType,
                    category: event.category,
                    ...(event.metadata || {}),
                  },
                  status: 'QUEUED',
                },
              });

              await client.notificationDelivery.create({
                data: {
                  notificationId: notif.id,
                  channel: 'PUSH',
                  status: 'QUEUED',
                  provider: 'EXPO',
                },
              });
              pushTicketsCount++;
            }
          }
        }

        // 4. Queue Transactional Email (if email enabled and template/body specified)
        if (emailEnabled && (!inQuietHours || isUrgent) && (event.emailTemplate || event.emailSubject)) {
          const user = await client.user.findUnique({
            where: { id: userId },
            select: { email: true, displayName: true },
          });

          if (user?.email) {
            await client.emailOutbox.create({
              data: {
                userId,
                recipient: user.email,
                subject: event.emailSubject || event.title,
                text: event.emailBody || event.body,
                templateVersion: event.emailTemplate || 'transactional-v1',
                eventKey: `notif-${notif.id}-${Date.now()}`,
                state: 'PENDING',
              },
            });

            await client.notificationDelivery.create({
              data: {
                notificationId: notif.id,
                channel: 'EMAIL',
                status: 'QUEUED',
                provider: 'RESEND',
              },
            });
            emailsCount++;
          }
        }
      }
    }

    if (pushTicketsCount > 0 && !txClient && typeof this.db?.$transaction === 'function') {
      void this.drainPushTickets(25).catch(err => {
        console.error('[AUTO_DRAIN_PUSH_ERROR]', err?.message || err);
      });
    }

    return {
      notificationsCount: recipientIds.length,
      pushTicketsCount,
      emailsCount,
    };
  } catch (dispatchErr) {
    console.error('[NOTIFICATION DISPATCH ERROR]', dispatchErr);
    return { notificationsCount: 0, pushTicketsCount: 0, emailsCount: 0 };
  }
}

  /**
   * Dynamically resolves target user IDs based on explicit IDs, roles, and business rules.
   */
  private async resolveRecipients(
    event: DomainEventPayload,
    client: Prisma.TransactionClient | PrismaClient
  ): Promise<string[]> {
    const explicit = (event.recipientUserIds ?? []).filter(Boolean);
    // Named people and a role/permission list are added together. (Before, naming one person silently dropped the roles,
    // so e.g. Operations never heard that a seller payout had been verified.)
    if (explicit.length > 0 && !event.recipientRoles?.length && !event.recipientPermissions?.length) {
      return [...new Set(explicit)];
    }

    let roles = event.recipientRoles || [];

    if (!roles.length && explicit.length === 0) {
      switch (event.type) {
        case 'INSPECTION_REQUESTED':
          roles = ['OPERATIONS', 'DISPATCH', 'SUPER_ADMIN'];
          break;
        case 'INSPECTION_REPORT_SUBMITTED':
        case 'INSPECTION_REPORT_RESUBMITTED':
          roles = ['INSPECTION_REVIEWER', 'REVIEWER', 'SUPER_ADMIN'];
          break;
        case 'INSPECTION_REVIEW_APPROVED':
          roles = ['SALES', 'FINANCE', 'SUPER_ADMIN'];
          break;
        case 'DISCOUNT_APPROVAL_REQUESTED':
          roles = ['SALES_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
          break;
        case 'FINANCE_PAYOUT_APPROVAL_REQUESTED':
          roles = ['FINANCE', 'SUPER_ADMIN'];
          break;
        case 'FINANCE_PAYOUT_VERIFIED':
        case 'FINANCE_BUYER_PAYMENT_VERIFIED':
          roles = ['FINANCE', 'SALES', 'OPERATIONS', 'SUPER_ADMIN'];
          break;
        default:
          roles = [];
      }
    }

    const permissions = event.recipientPermissions ?? [];
    if (!roles.length && !permissions.length) return [...new Set(explicit)];

    const validEnumRoles = Array.from(
      new Set(
        roles.flatMap(r => {
          const mapped = ROLE_SYNONYM_MAP[r] || [];
          const direct = VALID_EMPLOYEE_ROLES.has(r as EmployeeRole) ? [r as EmployeeRole] : [];
          return [...mapped, ...direct];
        })
      )
    );

    const orClauses: Prisma.EmployeeWhereInput[] = [];
    if (validEnumRoles.length > 0) {
      orClauses.push(
        { role: { in: validEnumRoles } },
        { roleAssignments: { some: { role: { key: { in: validEnumRoles } } } } }
      );
    }

    if (permissions.length > 0) {
      orClauses.push(
        { permissions: { hasSome: permissions } },
        { roleAssignments: { some: { role: { permissions: { some: { permission: { key: { in: permissions } } } } } } } },
      );
    }

    if (orClauses.length === 0) return [];

    const employees = await client.employee.findMany({
      where: {
        active: true,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        OR: orClauses,
        ...(event.branchId ? { branchAssignments: { some: { branchId: event.branchId } } } : {}),
      },
      select: { userId: true },
    });

    return [...new Set([...explicit, ...employees.map(e => e.userId)])];
  }

  private isQuietHours(start?: string | null, end?: string | null, now = new Date()): boolean {
    if (!start || !end) return false;
    const startParts = start.split(':').map(Number);
    const endParts = end.split(':').map(Number);
    const startH = startParts[0];
    const startM = startParts[1] ?? 0;
    const endH = endParts[0];
    const endM = endParts[1] ?? 0;

    if (startH === undefined || endH === undefined || isNaN(startH) || isNaN(endH)) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    // Overnight quiet hours (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  // --- Inbox Operations ---

  async getNotifications(userId: string, opts: NotificationQueryOptions = {}) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      dismissedAt: null,
      ...(opts.unreadOnly ? { read: false } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { userId, read: false, dismissedAt: null } }),
    ]);

    return {
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.db.notification.count({
      where: { userId, read: false, dismissedAt: null },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.db.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  /** Clears one notification from the person's list (it also counts as read). Only their own can be cleared. */
  async dismissNotification(userId: string, notificationId: string) {
    const now = new Date();
    await this.db.notification.updateMany({
      where: { id: notificationId, userId, read: false },
      data: { read: true, readAt: now },
    });
    return this.db.notification.updateMany({
      where: { id: notificationId, userId, dismissedAt: null },
      data: { dismissedAt: now },
    });
  }

  /** Clears everything from the person's list. */
  async dismissAllNotifications(userId: string) {
    const now = new Date();
    await this.db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: now },
    });
    return this.db.notification.updateMany({
      where: { userId, dismissedAt: null },
      data: { dismissedAt: now },
    });
  }

  // --- Push Device Registration ---

  async registerPushDevice(
    userId: string,
    input: {
      token: string;
      app: string;
      platform: string;
      installationId?: string;
      projectId?: string;
      environment?: string;
    }
  ) {
    if (!isExpoPushToken(input.token)) {
      throw new Error('INVALID_EXPO_PUSH_TOKEN');
    }

    return this.db.pushDevice.upsert({
      where: {
        userId_token_app: {
          userId,
          token: input.token,
          app: input.app,
        },
      },
      update: {
        platform: input.platform,
        installationId: input.installationId,
        projectId: input.projectId,
        environment: input.environment || 'production',
        active: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: input.token,
        app: input.app,
        platform: input.platform,
        installationId: input.installationId,
        projectId: input.projectId,
        environment: input.environment || 'production',
        active: true,
      },
    });
  }

  async unregisterPushDevice(userId: string, token: string) {
    return this.db.pushDevice.updateMany({
      where: { userId, token },
      data: { active: false },
    });
  }

  // --- Notification Preferences ---

  async getPreferences(userId: string) {
    const existing = await this.db.notificationPreference.findUnique({
      where: { userId },
    });

    if (existing) return existing;

    return this.db.notificationPreference.create({
      data: { userId },
    });
  }

  async updatePreferences(
    userId: string,
    data: {
      emailEnabled?: boolean;
      pushEnabled?: boolean;
      inAppEnabled?: boolean;
      inspectionAlerts?: boolean;
      offerAlerts?: boolean;
      orderAlerts?: boolean;
      operationalEscalations?: boolean;
      marketingEnabled?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
    }
  ) {
    return this.db.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  // --- Worker Batch Dispatching ---

  async drainPushTickets(maxBatch = 50): Promise<number> {
    const now = new Date();

    // Atomically claim QUEUED tickets
    const claimed = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; deviceId: string; title: string | null; body: string | null; data: any; token: string }>>`
        SELECT pt."id", pt."deviceId", pt."title", pt."body", pt."data", pd."token"
        FROM "PushTicket" pt
        JOIN "PushDevice" pd ON pd."id" = pt."deviceId"
        WHERE pt."status" = 'QUEUED' AND pd."active" = true
        ORDER BY pt."createdAt" ASC
        FOR UPDATE OF pt SKIP LOCKED
        LIMIT ${maxBatch}
      `;

      if (!rows.length) return [];

      const ids = rows.map(r => r.id);
      await tx.pushTicket.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'SENDING',
          attempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });

      return rows;
    });

    if (!claimed.length) return 0;

    const messages: ExpoPushMessage[] = claimed.map(row => {
      const data = typeof row.data === 'object' && row.data ? (row.data as Record<string, any>) : {};
      const isUrgentConnect = Boolean(
        data.callSessionId ||
        data.type === 'CONNECT_CALL_REQUESTED' ||
        data.type === 'CONNECT_OWNER_ALERT_CREATED' ||
        data.type === 'CONNECT_CHAT_MESSAGE'
      );
      return {
        to: row.token,
        title: row.title || 'V MOTIV',
        body: row.body || 'New Notification',
        data,
        sound: 'default',
        priority: 'high',
        channelId: isUrgentConnect ? 'connect-calls' : 'default',
        // The category is registered by the native customer app and presents
        // Accept / Decline only for an actual, still-ringing Connect call.
        categoryId: data.eventType === 'CONNECT_CALL_REQUESTED' && data.callSessionId
          ? 'connect-call-actions'
          : undefined,
        // A call request is no longer actionable after the server's 90s
        // ringing timeout, so never surface it late as a stale push.
        ttl: data.eventType === 'CONNECT_CALL_REQUESTED' && data.callSessionId ? 90 : undefined,
      };
    });

    const responses = await this.pushClient.sendPushNotifications(messages);

    for (let i = 0; i < claimed.length; i++) {
      const ticket = claimed[i];
      if (!ticket) continue;
      const resp = responses[i];

      if (resp && resp.status === 'ok') {
        await this.db.pushTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'PROVIDER_ACCEPTED',
            ticketId: resp.id,
          },
        });
      } else {
        const errorDetail = (resp as any)?.details?.error || (resp as any)?.message || 'UNKNOWN_ERROR';
        const isUnregistered = errorDetail === 'DeviceNotRegistered';

        await this.db.pushTicket.update({
          where: { id: ticket.id },
          data: {
            status: isUnregistered ? 'DISABLED' : 'FAILED',
            receiptMessage: errorDetail,
            receiptDetails: (resp as any)?.details ? ((resp as any).details as Prisma.InputJsonValue) : undefined,
          },
        });

        if (isUnregistered) {
          await this.db.pushDevice.update({
            where: { id: ticket.deviceId },
            data: { active: false },
          });
        }
      }
    }

    return claimed.length;
  }

  async checkPushReceipts(maxBatch = 100): Promise<number> {
    const tickets = await this.db.pushTicket.findMany({
      where: {
        status: 'PROVIDER_ACCEPTED',
        ticketId: { not: null },
      },
      take: maxBatch,
      include: { device: true },
    });

    if (!tickets.length) return 0;

    const ticketIds = tickets.map(t => t.ticketId!).filter(Boolean);
    const receipts = await this.pushClient.getPushNotificationReceipts(ticketIds);

    let updatedCount = 0;

    for (const ticket of tickets) {
      if (!ticket.ticketId) continue;
      const receipt = receipts[ticket.ticketId];
      if (!receipt) continue;

      if (receipt.status === 'ok') {
        await this.db.pushTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'PROVIDER_HANDOFF_CONFIRMED',
            receiptStatus: 'ok',
          },
        });
        updatedCount++;
      } else {
        const errorDetail = receipt.details?.error || receipt.message || 'DELIVERY_ERROR';
        const isUnregistered = errorDetail === 'DeviceNotRegistered';

        await this.db.pushTicket.update({
          where: { id: ticket.id },
          data: {
            status: isUnregistered ? 'DISABLED' : 'FAILED',
            receiptStatus: 'error',
            receiptMessage: errorDetail,
            receiptDetails: receipt.details ? (receipt.details as Prisma.InputJsonValue) : undefined,
          },
        });

        if (isUnregistered) {
          await this.db.pushDevice.update({
            where: { id: ticket.deviceId },
            data: { active: false },
          });
        }
        updatedCount++;
      }
    }

    return updatedCount;
  }
}
