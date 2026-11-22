// Platform announcements: "something new or changed" sent by Admin or Operations to customers who opted in to promotions.
//
// Who receives one: an ACTIVE customer account that has promotions switched on (User.marketingConsent, the same switch as promotional
// email), is not a staff member (staff have their own inbox), and (optionally) has the chosen preferred city. Everyone receives an in-app
// notification; a push is queued only for people whose push preference is on and who have a device registered by the customer app.
// Nothing goes out at night: announcements are sent between 09:00 and 21:00 India time.
//
// Delivery is batched and resumable: people are handled in id order, a batch's notifications, push tickets and cursor are saved in one
// transaction, and a unique (announcementId, userId) key means a retry can never notify anyone twice.
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../errors.js';
import { isExpoPushToken } from '../notification/expo-push.js';
import { cloudinaryCloudName } from '../cloudinary.js';
import { isAllowedMediaUrl } from '../home-content.js';

type Db = PrismaClient;

export const ANNOUNCEMENT_TARGETS = ['NONE', 'HOME', 'BUY', 'SELL', 'RENTALS', 'SERVICE', 'VEHICLE'] as const;
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number];
export const BATCH_SIZE = 200;
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 21;
const IST_OFFSET_MS = 330 * 60_000;

/** Where a tap goes. A fixed list, never a free-form link, so an announcement can only open screens the app really has. */
export function deepLinkFor(target: string, listingId?: string | null): string | null {
  switch (target) {
    case 'HOME': case 'BUY': case 'SELL': case 'RENTALS': case 'SERVICE': return `vmotiv://app/${target.toLowerCase()}`;
    case 'VEHICLE': return listingId && /^[0-9a-fA-F-]{36}$/.test(listingId) ? `vmotiv://vehicles/${listingId}` : null;
    default: return null;
  }
}

const istHour = (at: Date) => new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
export const inSendWindow = (at: Date) => { const h = istHour(at); return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR; };

/** The next moment (09:00 India time) an announcement may go out. */
export function nextSendWindowStart(from: Date): Date {
  if (inSendWindow(from)) return from;
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (ist.getUTCHours() >= SEND_UNTIL_HOUR ? 1 : 0), SEND_FROM_HOUR, 0, 0);
  return new Date(day - IST_OFFSET_MS);
}

export async function getSettings(db: Db) {
  const row = await db.announcementSettings.findUnique({ where: { id: 'default' } });
  return { enabled: row?.enabled ?? true, maxPerDay: row?.maxPerDay ?? 2 };
}

export async function updateSettings(db: Db, actorId: string, input: { enabled?: boolean; maxPerDay?: number }) {
  const row = await db.announcementSettings.upsert({
    where: { id: 'default' }, update: { ...input, updatedById: actorId }, create: { id: 'default', ...input, updatedById: actorId },
  });
  await db.auditEvent.create({ data: { actorId, action: 'ANNOUNCEMENT_SETTINGS_UPDATED', entityType: 'AnnouncementSettings', entityId: 'default', details: input as Prisma.InputJsonValue } });
  return { enabled: row.enabled, maxPerDay: row.maxPerDay };
}

const audienceWhere = (city: string | null | undefined): Prisma.UserWhereInput => ({
  status: 'ACTIVE', marketingConsent: true, employee: null,
  ...(city ? { preferredCity: { equals: city, mode: 'insensitive' as const } } : {}),
});

/** How many people would get it right now, and how many of them have a phone that can receive a push. */
export async function audienceSize(db: Db, city?: string | null) {
  const where = audienceWhere(city);
  const [recipients, withDevice] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { ...where, OR: [{ notificationPreference: null }, { notificationPreference: { pushEnabled: true } }], pushDevices: { some: { active: true, app: 'CUSTOMER' } } } }),
  ]);
  return { recipients, withPushDevice: withDevice };
}

export interface AnnouncementInput { title: string; body: string; target: AnnouncementTarget; listingId?: string | null; city?: string | null; imageUrl?: string | null }

async function validate(db: Db, input: AnnouncementInput) {
  if (input.imageUrl && !isAllowedMediaUrl(input.imageUrl, cloudinaryCloudName())) throw new HttpError(400, 'IMAGE_NOT_ALLOWED', 'The picture must be uploaded through this page (a secure link from our media account).');
  if (input.target === 'VEHICLE') {
    if (!input.listingId) throw new HttpError(400, 'LISTING_REQUIRED', 'Choose the vehicle this announcement should open.');
    const listing = await db.vehicleListing.findUnique({ where: { id: input.listingId }, select: { status: true } }).catch(() => null);
    if (!listing || listing.status !== 'PUBLISHED') throw new HttpError(400, 'LISTING_NOT_PUBLISHED', 'That vehicle is not published, so customers could not open it.');
  }
}

export async function createAnnouncement(db: Db, actorId: string, input: AnnouncementInput) {
  await validate(db, input);
  const row = await db.platformAnnouncement.create({ data: { title: input.title, body: input.body, target: input.target, listingId: input.target === 'VEHICLE' ? input.listingId : null, imageUrl: input.imageUrl || null, city: input.city || null, createdById: actorId } });
  await db.auditEvent.create({ data: { actorId, action: 'ANNOUNCEMENT_CREATED', entityType: 'PlatformAnnouncement', entityId: row.id } });
  return view(row);
}

async function editable(db: Db, id: string) {
  const row = await db.platformAnnouncement.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'ANNOUNCEMENT_NOT_FOUND');
  return row;
}

export async function updateAnnouncement(db: Db, actorId: string, id: string, input: AnnouncementInput) {
  const row = await editable(db, id);
  if (row.status !== 'DRAFT' && row.status !== 'SCHEDULED') throw new HttpError(409, 'ANNOUNCEMENT_ALREADY_SENDING', 'Only a draft or a scheduled announcement can be edited.');
  await validate(db, input);
  const updated = await db.platformAnnouncement.update({ where: { id }, data: { title: input.title, body: input.body, target: input.target, listingId: input.target === 'VEHICLE' ? input.listingId : null, imageUrl: input.imageUrl || null, city: input.city || null } });
  await db.auditEvent.create({ data: { actorId, action: 'ANNOUNCEMENT_UPDATED', entityType: 'PlatformAnnouncement', entityId: id } });
  return view(updated);
}

export async function listAnnouncements(db: Db) {
  const rows = await db.platformAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(view);
}

export async function getAnnouncement(db: Db, id: string) {
  return view(await editable(db, id));
}

function view(row: Awaited<ReturnType<Db['platformAnnouncement']['findUniqueOrThrow']>>) {
  return {
    id: row.id, title: row.title, body: row.body, target: row.target, listingId: row.listingId, imageUrl: row.imageUrl, city: row.city, status: row.status,
    scheduledFor: row.scheduledFor, startedAt: row.startedAt, completedAt: row.completedAt, cancelledAt: row.cancelledAt,
    recipientCount: row.recipientCount, pushQueued: row.pushQueued, lastError: row.lastError, createdAt: row.createdAt,
  };
}

/** A real notification for the person pressing "test", so they see exactly what customers will (in-app and on their phone). Not counted anywhere. */
export async function sendTest(db: Db, actorId: string, id: string) {
  const row = await editable(db, id);
  const deepLink = deepLinkFor(row.target, row.listingId);
  const notification = await db.notification.create({
    data: { userId: actorId, eventType: 'PLATFORM_ANNOUNCEMENT_TEST', category: 'PROMOTION', priority: 'LOW', title: `[Test] ${row.title}`, body: row.body, deepLink, targetApp: 'CUSTOMER', metadata: { announcementId: row.id, test: true, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) } },
  });
  const devices = (await db.pushDevice.findMany({ where: { userId: actorId, active: true } })).filter(device => isExpoPushToken(device.token));
  for (const device of devices) {
    await db.pushTicket.create({ data: { deviceId: device.id, notificationId: notification.id, title: `[Test] ${row.title}`, body: row.body, data: { type: 'PLATFORM_ANNOUNCEMENT', notificationId: notification.id, deepLink, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) } } });
  }
  return { sent: true, pushDevices: devices.length };
}

/** Announcements that are sending or waiting to send in the last 24 hours: what the daily cap counts. */
async function sentToday(db: Db, now: Date, exceptId?: string) {
  return db.platformAnnouncement.count({
    where: { id: exceptId ? { not: exceptId } : undefined, OR: [{ status: { in: ['SENDING', 'SENT'] }, startedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } }, { status: 'SCHEDULED' }] },
  });
}

export async function sendAnnouncement(db: Db, actorId: string, id: string, input: { expectedRecipients: number; scheduledFor?: Date | null }, now = new Date()) {
  const row = await editable(db, id);
  if (row.status !== 'DRAFT' && row.status !== 'SCHEDULED') throw new HttpError(409, 'ANNOUNCEMENT_ALREADY_SENT', 'This announcement has already been sent or cancelled.');
  const settings = await getSettings(db);
  if (!settings.enabled) throw new HttpError(409, 'ANNOUNCEMENTS_DISABLED', 'Announcements are switched off. Turn them on in the settings first.');
  if ((await sentToday(db, now, row.id)) >= settings.maxPerDay) throw new HttpError(429, 'ANNOUNCEMENT_DAILY_LIMIT', `Only ${settings.maxPerDay} announcement${settings.maxPerDay === 1 ? '' : 's'} can go out per day, so customers are not flooded. Try again later or schedule it for tomorrow.`);

  const audience = await audienceSize(db, row.city);
  if (audience.recipients === 0) throw new HttpError(409, 'NO_RECIPIENTS', 'Nobody currently matches this audience.');
  const drift = Math.abs(audience.recipients - input.expectedRecipients);
  if (drift > Math.max(5, input.expectedRecipients * 0.1)) throw new HttpError(409, 'AUDIENCE_CHANGED', `The audience changed while you were reviewing it: ${audience.recipients} people now, not ${input.expectedRecipients}. Check it and confirm again.`);

  let scheduledFor = input.scheduledFor ?? null;
  if (scheduledFor) {
    if (scheduledFor.getTime() <= now.getTime() + 60_000) throw new HttpError(400, 'SCHEDULE_IN_PAST', 'Pick a time in the future.');
    if (scheduledFor.getTime() > now.getTime() + 30 * 24 * 3_600_000) throw new HttpError(400, 'SCHEDULE_TOO_FAR', 'Announcements can be scheduled up to 30 days ahead.');
    if (!inSendWindow(scheduledFor)) throw new HttpError(400, 'OUTSIDE_SEND_WINDOW', 'Customers are only notified between 9 am and 9 pm India time. Pick a time in that window.');
  } else if (!inSendWindow(now)) {
    scheduledFor = nextSendWindowStart(now); // asked at night: it goes out when the window opens
  }

  const data = scheduledFor
    ? { status: 'SCHEDULED' as const, scheduledFor, sentById: actorId, expectedRecipients: input.expectedRecipients }
    : { status: 'SENDING' as const, scheduledFor: null, sentById: actorId, startedAt: now, expectedRecipients: input.expectedRecipients };
  const claimed = await db.platformAnnouncement.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data });
  if (claimed.count === 0) throw new HttpError(409, 'ANNOUNCEMENT_ALREADY_SENT', 'This announcement has already been sent or cancelled.');
  await db.auditEvent.create({ data: { actorId, action: scheduledFor ? 'ANNOUNCEMENT_SCHEDULED' : 'ANNOUNCEMENT_SENT', entityType: 'PlatformAnnouncement', entityId: id, details: { recipients: audience.recipients, scheduledFor: scheduledFor?.toISOString() ?? null } } });
  if (!scheduledFor) await processAnnouncements(db, now); // the first batches go out straight away; the worker finishes the rest
  return { ...(await getAnnouncement(db, id)), audience, deferred: Boolean(scheduledFor) };
}

export async function cancelAnnouncement(db: Db, actorId: string, id: string) {
  const row = await editable(db, id);
  if (!['DRAFT', 'SCHEDULED', 'SENDING'].includes(row.status)) throw new HttpError(409, 'ANNOUNCEMENT_NOT_CANCELLABLE', 'This announcement has already finished.');
  await db.platformAnnouncement.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  await db.auditEvent.create({ data: { actorId, action: 'ANNOUNCEMENT_CANCELLED', entityType: 'PlatformAnnouncement', entityId: id, details: { alreadyDelivered: row.recipientCount } } });
  return getAnnouncement(db, id);
}

/** One batch for one announcement. Returns how many people it handled (0 = finished). */
export async function processBatch(db: Db, announcementId: string): Promise<number> {
  const row = await db.platformAnnouncement.findUnique({ where: { id: announcementId } });
  if (!row || row.status !== 'SENDING') return 0;
  const people = await db.user.findMany({
    where: { ...audienceWhere(row.city), ...(row.cursorUserId ? { id: { gt: row.cursorUserId } } : {}) },
    orderBy: { id: 'asc' }, take: BATCH_SIZE,
    select: { id: true, notificationPreference: { select: { pushEnabled: true } }, pushDevices: { where: { active: true, app: 'CUSTOMER' }, select: { id: true, token: true } } },
  });
  if (people.length === 0) {
    await db.platformAnnouncement.updateMany({ where: { id: announcementId, status: 'SENDING' }, data: { status: 'SENT', completedAt: new Date() } });
    return 0;
  }
  const already = new Set((await db.notification.findMany({ where: { announcementId, userId: { in: people.map(p => p.id) } }, select: { userId: true } })).map(n => n.userId));
  const fresh = people.filter(p => !already.has(p.id));
  const deepLink = deepLinkFor(row.target, row.listingId);
  const base = { eventType: 'PLATFORM_ANNOUNCEMENT', category: 'PROMOTION', priority: 'LOW' as const, title: row.title, body: row.body, deepLink, targetApp: 'CUSTOMER', announcementId, metadata: { announcementId, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) } as Prisma.InputJsonValue };
  let queued = 0;
  await db.$transaction(async tx => {
    if (fresh.length) {
      await tx.notification.createMany({ data: fresh.map(p => ({ ...base, userId: p.id })), skipDuplicates: true });
      const ids = new Map((await tx.notification.findMany({ where: { announcementId, userId: { in: fresh.map(p => p.id) } }, select: { id: true, userId: true } })).map(n => [n.userId, n.id]));
      const tickets: Prisma.PushTicketCreateManyInput[] = [];
      for (const person of fresh) {
        if (person.notificationPreference?.pushEnabled === false) continue;
        for (const device of person.pushDevices.filter(d => isExpoPushToken(d.token))) {
          tickets.push({ deviceId: device.id, notificationId: ids.get(person.id), title: row.title, body: row.body, data: { type: 'PLATFORM_ANNOUNCEMENT', notificationId: ids.get(person.id), announcementId, deepLink, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) } as Prisma.InputJsonValue });
        }
      }
      if (tickets.length) await tx.pushTicket.createMany({ data: tickets });
      queued = tickets.length;
    }
    await tx.platformAnnouncement.update({ where: { id: announcementId }, data: { cursorUserId: people[people.length - 1]!.id, recipientCount: { increment: fresh.length }, pushQueued: { increment: queued }, lastError: null } });
  });
  return people.length;
}

/** One worker pass: start anything due, then deliver a few batches of whatever is sending. Safe to call as often as you like. */
export async function processAnnouncements(db: Db, now = new Date()): Promise<{ batches: number; completed: number }> {
  if (!(await db.platformAnnouncement.findFirst({ where: { status: { in: ['SCHEDULED', 'SENDING'] } }, select: { id: true } }))) return { batches: 0, completed: 0 };
  const settings = await getSettings(db);
  if (!settings.enabled || !inSendWindow(now)) return { batches: 0, completed: 0 }; // paused: the switch is off, or it is night
  await db.platformAnnouncement.updateMany({ where: { status: 'SCHEDULED', scheduledFor: { lte: now } }, data: { status: 'SENDING', startedAt: now } });
  const sending = await db.platformAnnouncement.findMany({ where: { status: 'SENDING' }, orderBy: { startedAt: 'asc' }, take: 3, select: { id: true } });
  let batches = 0;
  let completed = 0;
  for (const { id } of sending) {
    try {
      for (let i = 0; i < 5; i++) {
        const handled = await processBatch(db, id);
        batches++;
        if (handled === 0) { completed++; break; }
        if (handled < BATCH_SIZE) { await processBatch(db, id); completed++; break; }
      }
    } catch (error) {
      await db.platformAnnouncement.update({ where: { id }, data: { lastError: (error instanceof Error ? error.message : String(error)).slice(0, 300) } }).catch(() => undefined);
    }
  }
  return { batches, completed };
}
