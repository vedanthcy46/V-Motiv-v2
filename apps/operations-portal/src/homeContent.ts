// Rules and wording for the Home content page (banners, hub photos and hub videos). Pure, so they are tested alone. The server checks everything
// again; these only help the person see a problem before they upload or save.

export type HomeKind = 'BANNER' | 'HUB_PHOTO' | 'HUB_VIDEO';
export type ItemState = 'DRAFT' | 'ARCHIVED' | 'SCHEDULED' | 'EXPIRED' | 'LIVE';

export const KIND_INFO: Record<HomeKind, { label: string; plural: string; media: 'image' | 'video'; hint: string }> = {
  BANNER: { label: 'Banner', plural: 'Banners', media: 'image', hint: 'A wide promotional image at the top of Home, shown edge to edge. Best at 1200 × 600 (2:1). Keep any text large and away from the edges. With several banners they slide by themselves and can be swiped.' },
  HUB_PHOTO: { label: 'Hub photo', plural: 'Hub photos', media: 'image', hint: 'A photo of a hub, workshop, team or a delivery. Shown 16:9, centred with a margin at each side, in a row that slides by itself and can be swiped, so landscape photos work best.' },
  HUB_VIDEO: { label: 'Hub video', plural: 'Hub videos', media: 'video', hint: 'A short MP4 video (H.264 plays on every phone; 10 to 20 seconds is best, under 20 MB) of a hub or workshop. In the app it plays by itself, muted, with no controls (nothing to tap), centred at 16:9 with a margin at each side, so it should make sense without sound.' },
};

/** The screens a button can open, in the words Operations uses. The values are the names the server and the app agree on. */
export const SCREEN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SERVICE', label: 'Book a car service' },
  { value: 'BUY', label: 'Buy a car (explore cars)' },
  { value: 'SELL', label: 'Sell a car' },
  { value: 'RENTAL', label: 'Rent a car' },
  { value: 'SCRAP', label: 'Scrap a car' },
  { value: 'GARAGE', label: 'My Garage' },
  { value: 'SUPPORT', label: 'Support' },
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // it plays on its own on customers' phones, so it must be small

/** Whether a chosen file is acceptable for a kind of item, before it is uploaded. */
export function fileProblem(kind: HomeKind, file: { type: string; size: number; name?: string }): string | null {
  const wants = KIND_INFO[kind].media;
  const isImage = /^image\/(jpeg|png|webp)$/i.test(file.type);
  const isVideo = /^video\/(mp4|quicktime|webm)$/i.test(file.type);
  if (wants === 'image' && !isImage) return 'Choose a JPG, PNG or WebP image.';
  if (wants === 'video' && !isVideo) return 'Choose an MP4, MOV or WebM video.';
  if (file.size <= 0) return 'That file is empty.';
  const limit = wants === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The most allowed is ${limit / 1024 / 1024} MB: compress it first.`;
  return null;
}

export interface ItemForm {
  kind: HomeKind;
  title: string;
  subtitle: string;
  mediaUrl: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  actionType: 'NONE' | 'SCREEN' | 'LISTING' | 'URL';
  actionTarget: string;
  ctaLabel: string;
  city: string;
  hubName: string;
  startsAt: string; // a local date-time as typed in the field ("2026-11-20T09:00"), or ''
  endsAt: string;
}

export const blankForm = (kind: HomeKind): ItemForm => ({
  kind, title: '', subtitle: '', mediaUrl: '', thumbnailUrl: '', durationSeconds: null, actionType: 'NONE', actionTarget: '', ctaLabel: '', city: '', hubName: '', startsAt: '', endsAt: '',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What to fix before this can be saved. */
export function formProblems(form: ItemForm): Partial<Record<keyof ItemForm, string>> {
  const problems: Partial<Record<keyof ItemForm, string>> = {};
  if (!form.mediaUrl) problems.mediaUrl = KIND_INFO[form.kind].media === 'video' ? 'Upload the video.' : 'Upload the image.';
  if (form.kind === 'HUB_VIDEO' && !form.title.trim()) problems.title = 'Give the video a short title.';
  if (form.actionType === 'SCREEN' && !SCREEN_OPTIONS.some(option => option.value === form.actionTarget)) problems.actionTarget = 'Choose which screen the button opens.';
  if (form.actionType === 'LISTING' && !UUID.test(form.actionTarget.trim())) problems.actionTarget = 'Paste the car\'s listing id.';
  if (form.actionType === 'URL' && !/^https:\/\/\S+$/i.test(form.actionTarget.trim())) problems.actionTarget = 'Enter a link starting with https://';
  if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) problems.endsAt = 'The end must be after the start.';
  return problems;
}

/** The body sent to the server. Empty fields become null so they are cleared, and dates become exact moments. */
export function toPayload(form: ItemForm, sortOrder = 0) {
  const clean = (value: string) => value.trim() || null;
  const hasButton = form.actionType !== 'NONE';
  return {
    kind: form.kind,
    title: clean(form.title),
    subtitle: clean(form.subtitle),
    mediaUrl: form.mediaUrl.trim(),
    thumbnailUrl: clean(form.thumbnailUrl),
    durationSeconds: form.durationSeconds,
    actionType: form.actionType,
    actionTarget: hasButton ? clean(form.actionTarget) : null,
    ctaLabel: hasButton ? clean(form.ctaLabel) : null,
    city: clean(form.city),
    hubName: clean(form.hubName),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    sortOrder,
  };
}

/** An item from the server back into the form. Dates become local date-time field values. */
export function formFromItem(item: {
  kind: HomeKind; title: string | null; subtitle: string | null; mediaUrl: string; thumbnailUrl: string | null; durationSeconds: number | null; actionType: ItemForm['actionType'];
  actionTarget: string | null; ctaLabel: string | null; city: string | null; hubName: string | null; startsAt: string | null; endsAt: string | null;
}): ItemForm {
  const local = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return {
    kind: item.kind, title: item.title ?? '', subtitle: item.subtitle ?? '', mediaUrl: item.mediaUrl, thumbnailUrl: item.thumbnailUrl ?? '', durationSeconds: item.durationSeconds,
    actionType: item.actionType, actionTarget: item.actionTarget ?? '', ctaLabel: item.ctaLabel ?? '', city: item.city ?? '', hubName: item.hubName ?? '',
    startsAt: local(item.startsAt), endsAt: local(item.endsAt),
  };
}

export const STATE_LABEL: Record<ItemState, string> = {
  LIVE: 'Live now', SCHEDULED: 'Scheduled', EXPIRED: 'Ended', DRAFT: 'Draft (not shown)', ARCHIVED: 'Archived',
};
export const STATE_TONE: Record<ItemState, 'success' | 'info' | 'warning' | 'neutral'> = {
  LIVE: 'success', SCHEDULED: 'info', EXPIRED: 'warning', DRAFT: 'neutral', ARCHIVED: 'neutral',
};

/** One line saying when it shows, for the list. */
export function whenText(item: { state: ItemState; startsAt: string | null; endsAt: string | null }, format: (iso: string) => string = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })): string {
  if (item.state === 'DRAFT') return 'Not shown to customers';
  if (item.state === 'ARCHIVED') return 'Removed from Home';
  if (item.state === 'SCHEDULED' && item.startsAt) return `Starts ${format(item.startsAt)}`;
  if (item.state === 'EXPIRED' && item.endsAt) return `Ended ${format(item.endsAt)}`;
  if (item.endsAt) return `Until ${format(item.endsAt)}`;
  return 'No end date';
}

/** What the signed upload returned for a media file. */
export interface UploadedMedia { url: string; durationSeconds: number | null }

export function cloudinaryUploadUrl(cloudName: string, media: 'image' | 'video') {
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${media}/upload`;
}

/** Turns Cloudinary's reply into what the form needs, refusing a reply that does not carry a secure address. */
export function readUpload(reply: unknown): UploadedMedia {
  const r = reply as { secure_url?: unknown; duration?: unknown } | null;
  if (!r || typeof r.secure_url !== 'string' || !r.secure_url.startsWith('https://')) throw new Error('The upload did not return a usable address.');
  return { url: r.secure_url, durationSeconds: typeof r.duration === 'number' && r.duration >= 1 ? Math.min(600, Math.round(r.duration)) : null };
}
