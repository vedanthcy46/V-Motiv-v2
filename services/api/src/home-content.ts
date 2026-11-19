// Home-screen content that the Operations team manages: promotional banners, and photos and videos of the hubs. The apps read the published
// items; Operations drafts, schedules, publishes and removes them in the operations portal. Nothing here is hard-coded in the apps.
import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { HttpError } from './errors.js';

export const HOME_KINDS = ['BANNER', 'HUB_PHOTO', 'HUB_VIDEO'] as const;
export type HomeKind = (typeof HOME_KINDS)[number];
export const HOME_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/** Screens a banner may open. The app maps each name to its own screen; anything else is refused here, so a typo cannot ship a dead button. */
export const ACTION_SCREENS = ['SERVICE', 'BUY', 'SELL', 'RENTAL', 'SCRAP', 'SUPPORT', 'GARAGE'] as const;

/** Most items the app will show in each strip, so a long list never makes Home slow. */
export const MAX_PUBLIC = { BANNER: 8, HUB_PHOTO: 12, HUB_VIDEO: 6 } as const;

const uuid = z.string().uuid();

// ------------------------------------------------------------------------------------------------------------------------------------
// Media addresses
// ------------------------------------------------------------------------------------------------------------------------------------

/**
 * Media must be served over HTTPS. When Cloudinary is configured it must come from our own Cloudinary account, so a pasted link cannot make
 * every customer's phone load content from an arbitrary site. With no Cloudinary configured (local development) any HTTPS address is accepted.
 */
export function isAllowedMediaUrl(value: string, cloudName?: string | null): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (!cloudName) return true;
  return url.hostname === 'res.cloudinary.com' && url.pathname.startsWith(`/${cloudName}/`);
}

/** A still image for a Cloudinary video (its first frame), used as the poster before anyone presses play. Null for any other address. */
export function videoPosterUrl(videoUrl: string): string | null {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)\.[A-Za-z0-9]{2,5}$/.exec(videoUrl);
  return match ? `${match[1]}so_0,w_900,c_limit,q_auto,f_jpg/${match[2]}.jpg` : null;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Input
// ------------------------------------------------------------------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null);

const itemFields = z.object({
  kind: z.enum(HOME_KINDS),
  title: text(80),
  subtitle: text(160),
  mediaUrl: z.string().trim().max(1000),
  thumbnailUrl: z.string().trim().max(1000).optional().nullable().transform(value => value || null),
  durationSeconds: z.number().int().min(1).max(600).optional().nullable().transform(value => value ?? null),
  actionType: z.enum(['NONE', 'SCREEN', 'LISTING', 'URL']).default('NONE'),
  actionTarget: text(500),
  ctaLabel: text(30),
  city: text(80),
  hubName: text(80),
  startsAt: z.coerce.date().optional().nullable().transform(value => value ?? null),
  endsAt: z.coerce.date().optional().nullable().transform(value => value ?? null),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
}).strict();

export const homeContentInput = itemFields;
export const homeContentPatch = itemFields.partial().strict();
export type HomeContentInput = z.infer<typeof homeContentInput>;

export interface ProblemField { field: string; message: string }

/** What is wrong with an item. Used before saving and before publishing (a draft may be incomplete; a published item may not). */
export function contentProblems(item: Partial<HomeContentInput>, options: { cloudName?: string | null; forPublish?: boolean } = {}): ProblemField[] {
  const problems: ProblemField[] = [];
  const add = (field: string, message: string) => problems.push({ field, message });
  if (!item.mediaUrl) add('mediaUrl', 'Add the image or video.');
  else if (!isAllowedMediaUrl(item.mediaUrl, options.cloudName)) add('mediaUrl', 'The media must be uploaded through this page (a secure link from our media account).');
  if (item.thumbnailUrl && !isAllowedMediaUrl(item.thumbnailUrl, options.cloudName)) add('thumbnailUrl', 'The cover image must come from our media account.');
  if (item.startsAt && item.endsAt && item.endsAt <= item.startsAt) add('endsAt', 'The end must be after the start.');

  const type = item.actionType ?? 'NONE';
  const target = item.actionTarget ?? null;
  if (type === 'SCREEN' && !(ACTION_SCREENS as readonly string[]).includes(target ?? '')) add('actionTarget', 'Choose which screen the button opens.');
  if (type === 'LISTING' && !uuid.safeParse(target).success) add('actionTarget', 'Enter the car\'s listing id.');
  if (type === 'URL') {
    try { if (new URL(target ?? '').protocol !== 'https:') throw new Error('http'); } catch { add('actionTarget', 'Enter a link starting with https://'); }
  }

  if (options.forPublish) {
    if (item.kind === 'HUB_VIDEO' && !item.thumbnailUrl && !videoPosterUrl(item.mediaUrl ?? '')) add('thumbnailUrl', 'Add a cover image for this video.');
    if (item.kind === 'HUB_VIDEO' && !item.title) add('title', 'Give the video a short title.');
  }
  return problems;
}

/** Whether an item is showing to customers right now, and if not, why. */
export function scheduleState(item: { status: string; startsAt: Date | string | null; endsAt: Date | string | null }, now: Date = new Date()): 'DRAFT' | 'ARCHIVED' | 'SCHEDULED' | 'EXPIRED' | 'LIVE' {
  if (item.status === 'ARCHIVED') return 'ARCHIVED';
  if (item.status !== 'PUBLISHED') return 'DRAFT';
  if (item.startsAt && new Date(item.startsAt) > now) return 'SCHEDULED';
  if (item.endsAt && new Date(item.endsAt) <= now) return 'EXPIRED';
  return 'LIVE';
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Store
// ------------------------------------------------------------------------------------------------------------------------------------

type Row = {
  id: string; kind: string; status: string; title: string | null; subtitle: string | null; mediaUrl: string; thumbnailUrl: string | null; durationSeconds: number | null;
  actionType: string; actionTarget: string | null; ctaLabel: string | null; city: string | null; hubName: string | null; startsAt: Date | null; endsAt: Date | null;
  sortOrder: number; publishedAt: Date | null; createdAt: Date; updatedAt: Date;
};

/** What a customer's phone receives for one item. */
function publicView(row: Row) {
  return {
    id: row.id, kind: row.kind, title: row.title, subtitle: row.subtitle, mediaUrl: row.mediaUrl, thumbnailUrl: row.thumbnailUrl ?? (row.kind === 'HUB_VIDEO' ? videoPosterUrl(row.mediaUrl) : null),
    durationSeconds: row.durationSeconds, actionType: row.actionType, actionTarget: row.actionTarget, ctaLabel: row.ctaLabel, hubName: row.hubName,
    // The dates travel with the item so a phone that has been offline can stop showing it when it ends.
    startsAt: row.startsAt, endsAt: row.endsAt,
  };
}

export class HomeContentStore {
  constructor(private readonly db: PrismaClient, private readonly cloudName: () => string | null = () => null) {}

  /** The published items visible now, for one city (items with no city show everywhere), newest order as Operations arranged it. */
  async listPublic(city: string | undefined, now: Date = new Date()) {
    const wanted = city?.trim();
    let rows: Row[];
    try {
      rows = await this.db.homeContent.findMany({
        where: {
          status: 'PUBLISHED',
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ...(wanted ? [{ OR: [{ city: null }, { city: { equals: wanted, mode: 'insensitive' as const } }] }] : [{ city: null }]),
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
        take: 60,
      }) as Row[];
    } catch {
      // Before the migration is applied, Home simply has no content. It must never fail the whole screen.
      rows = [];
    }
    const pick = (kind: HomeKind) => rows.filter(row => row.kind === kind).slice(0, MAX_PUBLIC[kind]).map(publicView);
    return { banners: pick('BANNER'), hubPhotos: pick('HUB_PHOTO'), hubVideos: pick('HUB_VIDEO') };
  }

  async listAll(filter: { kind?: HomeKind; status?: string }, now: Date = new Date()) {
    const rows = await this.db.homeContent.findMany({
      where: { ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.status ? { status: filter.status as never } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    }) as Row[];
    return { items: rows.map(row => ({ ...row, state: scheduleState(row, now), posterUrl: row.thumbnailUrl ?? (row.kind === 'HUB_VIDEO' ? videoPosterUrl(row.mediaUrl) : null) })) };
  }

  private async existing(id: string) {
    const row = await this.db.homeContent.findUnique({ where: { id } }) as Row | null;
    if (!row) throw new HttpError(404, 'HOME_CONTENT_NOT_FOUND');
    return row;
  }

  private check(item: Partial<HomeContentInput>, forPublish = false) {
    const problems = contentProblems(item, { cloudName: this.cloudName(), forPublish });
    if (problems.length) throw new HttpError(400, 'INVALID_CONTENT', problems[0]!.message);
  }

  async create(actorId: string, input: HomeContentInput) {
    this.check(input);
    const row = await this.db.homeContent.create({ data: { ...input, thumbnailUrl: input.thumbnailUrl, status: 'DRAFT', createdById: actorId, updatedById: actorId } }) as Row;
    await this.audit(actorId, 'HOME_CONTENT_CREATED', row.id, { kind: row.kind });
    return row;
  }

  async update(actorId: string, id: string, patch: Partial<HomeContentInput>) {
    const current = await this.existing(id);
    const merged = { ...current, ...patch } as Partial<HomeContentInput> & Row;
    this.check(merged as never, current.status === 'PUBLISHED');
    // Changing what the item is is not allowed: a banner cannot become a video. Create a new item instead.
    if (patch.kind && patch.kind !== current.kind) throw new HttpError(400, 'KIND_CANNOT_CHANGE', 'The type of an item cannot be changed. Create a new one instead.');
    const row = await this.db.homeContent.update({ where: { id }, data: { ...patch, updatedById: actorId } }) as Row;
    await this.audit(actorId, 'HOME_CONTENT_UPDATED', id, { fields: Object.keys(patch) });
    return row;
  }

  async setStatus(actorId: string, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const current = await this.existing(id);
    if (status === 'PUBLISHED') this.check(current as never, true);
    const row = await this.db.homeContent.update({
      where: { id },
      data: { status, updatedById: actorId, ...(status === 'PUBLISHED' && current.status !== 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
    }) as Row;
    await this.audit(actorId, `HOME_CONTENT_${status}`, id, { from: current.status });
    return row;
  }

  /** Moves an item one place up or down among items of the same kind by swapping order numbers. */
  async move(actorId: string, id: string, direction: 'UP' | 'DOWN') {
    const current = await this.existing(id);
    const siblings = await this.db.homeContent.findMany({ where: { kind: current.kind as never, status: { not: 'ARCHIVED' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }) as Row[];
    const index = siblings.findIndex(item => item.id === id);
    const swapWith = siblings[direction === 'UP' ? index - 1 : index + 1];
    if (index < 0 || !swapWith) return { moved: false };
    // Renumber the whole group 0..n so equal order numbers can never leave two items stuck in place.
    const order = siblings.map(item => item.id);
    order[index] = swapWith.id;
    order[direction === 'UP' ? index - 1 : index + 1] = id;
    await this.db.$transaction(order.map((itemId, position) => this.db.homeContent.update({ where: { id: itemId }, data: { sortOrder: position } })));
    await this.audit(actorId, 'HOME_CONTENT_REORDERED', id, { direction });
    return { moved: true };
  }

  async remove(actorId: string, id: string) {
    const current = await this.existing(id);
    if (current.status === 'PUBLISHED') throw new HttpError(409, 'UNPUBLISH_FIRST', 'Unpublish this item before deleting it.');
    await this.db.homeContent.delete({ where: { id } });
    await this.audit(actorId, 'HOME_CONTENT_DELETED', id, { kind: current.kind });
    return { deleted: true };
  }

  private async audit(actorId: string, action: string, entityId: string, details: Record<string, unknown>) {
    await this.db.auditEvent.create({ data: { actorId, action, entityType: 'HomeContent', entityId, details: details as never } }).catch(() => undefined);
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Who may manage it
// ------------------------------------------------------------------------------------------------------------------------------------

export const HOME_CONTENT_ROLES = ['OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
export const HOME_CONTENT_PERMISSION = 'content.home.manage';

/** Operations managers and administrators, or anyone given the `content.home.manage` permission by name. */
export async function requireHomeContentManager(db: PrismaClient, uid: string): Promise<{ userId: string }> {
  const employee = await db.employee.findFirst({
    where: { active: true, status: 'ACTIVE', user: { firebaseUid: uid, status: 'ACTIVE' } },
    include: { roleAssignments: { include: { role: true } } },
  });
  if (!employee) throw new HttpError(403, 'HOME_CONTENT_ACCESS_DENIED');
  const roles = [employee.role as string, ...employee.roleAssignments.map(item => item.role.key)];
  if (!roles.some(role => HOME_CONTENT_ROLES.includes(role)) && !employee.permissions.includes(HOME_CONTENT_PERMISSION)) {
    throw new HttpError(403, 'HOME_CONTENT_ACCESS_DENIED', 'You do not have permission to manage Home content.');
  }
  return { userId: employee.userId };
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------------------------------------------------------------

const listQuery = z.object({ kind: z.enum(HOME_KINDS).optional(), status: z.enum(HOME_STATUSES).optional() }).strip();
const publicQuery = z.object({ city: z.string().trim().max(80).optional() }).strip();
const moveBody = z.object({ direction: z.enum(['UP', 'DOWN']) }).strict();

/** What the phones read. Public (Home is shown before sign-in), cached for a minute, with a validator so an unchanged answer costs almost nothing. */
export function createHomeContentPublicRouter(deps: { store: HomeContentStore; limiter?: RequestHandler }) {
  const router = Router();
  if (deps.limiter) router.use('/home/content', deps.limiter);
  router.get('/home/content', async (req, res) => {
    const { city } = publicQuery.parse(req.query);
    const content = await deps.store.listPublic(city);
    const etag = `W/"hc-${createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 20)}"`;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
    res.json(content);
  });
  return router;
}

/** What Operations uses to manage it, plus a signature so photos and videos upload straight to our media account instead of through this server. */
export function createHomeContentManageRouter(deps: {
  verify: VerifyToken; db: PrismaClient; store: HomeContentStore; signUpload: () => { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string } | null;
}) {
  const router = Router();
  router.use(authentication(deps.verify));
  const staff = async (res: { locals: Record<string, unknown> }) => requireHomeContentManager(deps.db, (res.locals.identity as Identity).uid);
  const id = (value: unknown) => uuid.parse(value);

  router.get('/', async (req, res) => { await staff(res); res.json(await deps.store.listAll(listQuery.parse(req.query))); });
  router.post('/', async (req, res) => { const who = await staff(res); res.status(201).json(await deps.store.create(who.userId, homeContentInput.parse(req.body))); });
  router.post('/upload-signature', async (_req, res) => {
    await staff(res);
    const signed = deps.signUpload();
    if (!signed) throw new HttpError(503, 'MEDIA_UPLOAD_NOT_CONFIGURED', 'Media uploads are not set up on the server yet.');
    res.json(signed);
  });
  router.patch('/:id', async (req, res) => { const who = await staff(res); res.json(await deps.store.update(who.userId, id(req.params.id), homeContentPatch.parse(req.body))); });
  router.post('/:id/publish', async (req, res) => { const who = await staff(res); res.json(await deps.store.setStatus(who.userId, id(req.params.id), 'PUBLISHED')); });
  router.post('/:id/unpublish', async (req, res) => { const who = await staff(res); res.json(await deps.store.setStatus(who.userId, id(req.params.id), 'DRAFT')); });
  router.post('/:id/archive', async (req, res) => { const who = await staff(res); res.json(await deps.store.setStatus(who.userId, id(req.params.id), 'ARCHIVED')); });
  router.post('/:id/move', async (req, res) => { const who = await staff(res); res.json(await deps.store.move(who.userId, id(req.params.id), moveBody.parse(req.body).direction)); });
  router.delete('/:id', async (req, res) => { const who = await staff(res); res.json(await deps.store.remove(who.userId, id(req.params.id))); });
  return router;
}
