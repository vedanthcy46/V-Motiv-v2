import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, blankForm, cloudinaryUploadUrl, fileProblem, formFromItem, formProblems, readUpload, toPayload, whenText } from './homeContent';

describe('choosing a file', () => {
  it('accepts the right kind of file for each item', () => {
    expect(fileProblem('BANNER', { type: 'image/jpeg', size: 500_000 })).toBeNull();
    expect(fileProblem('HUB_PHOTO', { type: 'image/webp', size: 2_000_000 })).toBeNull();
    expect(fileProblem('HUB_VIDEO', { type: 'video/mp4', size: 15_000_000 })).toBeNull();
  });
  it('refuses the wrong type, an empty file and one that is too big, saying why', () => {
    expect(fileProblem('BANNER', { type: 'video/mp4', size: 1000 })).toMatch(/image/);
    expect(fileProblem('HUB_VIDEO', { type: 'image/png', size: 1000 })).toMatch(/video/);
    expect(fileProblem('BANNER', { type: 'image/gif', size: 1000 })).toMatch(/JPG, PNG or WebP/);
    expect(fileProblem('BANNER', { type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(fileProblem('BANNER', { type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/8 MB/);
    expect(fileProblem('HUB_VIDEO', { type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 })).toMatch(/20 MB/);
  });
});

describe('the form', () => {
  const ready = { ...blankForm('BANNER'), mediaUrl: 'https://res.cloudinary.com/x/image/upload/a.jpg' };

  it('needs the media, and for a video a title', () => {
    expect(formProblems(blankForm('BANNER'))).toEqual({ mediaUrl: 'Upload the image.' });
    expect(formProblems(blankForm('HUB_VIDEO')).mediaUrl).toBe('Upload the video.');
    expect(formProblems({ ...blankForm('HUB_VIDEO'), mediaUrl: 'https://x/v.mp4' }).title).toBeDefined();
    expect(formProblems(ready)).toEqual({});
  });
  it('checks the button target for what it opens', () => {
    expect(formProblems({ ...ready, actionType: 'SCREEN', actionTarget: '' }).actionTarget).toBeDefined();
    expect(formProblems({ ...ready, actionType: 'SCREEN', actionTarget: 'SERVICE' })).toEqual({});
    expect(formProblems({ ...ready, actionType: 'LISTING', actionTarget: 'abc' }).actionTarget).toBeDefined();
    expect(formProblems({ ...ready, actionType: 'LISTING', actionTarget: '11111111-1111-4111-8111-111111111111' })).toEqual({});
    expect(formProblems({ ...ready, actionType: 'URL', actionTarget: 'http://vmotiv.in' }).actionTarget).toBeDefined();
    expect(formProblems({ ...ready, actionType: 'URL', actionTarget: 'https://vmotiv.in/offers' })).toEqual({});
  });
  it('needs the end after the start', () => {
    expect(formProblems({ ...ready, startsAt: '2026-12-02T09:00', endsAt: '2026-12-01T09:00' }).endsAt).toBeDefined();
    expect(formProblems({ ...ready, startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00' })).toEqual({});
  });
});

describe('what is sent', () => {
  it('clears empty fields, drops a button label when there is no button, and sends exact moments', () => {
    const payload = toPayload({ ...blankForm('BANNER'), mediaUrl: ' https://x/a.jpg ', title: ' Diwali ', ctaLabel: 'Book', actionType: 'NONE', startsAt: '2026-11-20T09:00' }, 3);
    expect(payload).toMatchObject({ kind: 'BANNER', mediaUrl: 'https://x/a.jpg', title: 'Diwali', subtitle: null, actionTarget: null, ctaLabel: null, city: null, endsAt: null, sortOrder: 3 });
    expect(payload.startsAt).toBe(new Date('2026-11-20T09:00').toISOString());
  });
  it('keeps the button label and target when there is a button', () => {
    const payload = toPayload({ ...blankForm('BANNER'), mediaUrl: 'https://x/a.jpg', actionType: 'SCREEN', actionTarget: 'SERVICE', ctaLabel: 'Book now' });
    expect(payload).toMatchObject({ actionType: 'SCREEN', actionTarget: 'SERVICE', ctaLabel: 'Book now' });
  });
  it('round-trips an item through the form', () => {
    const item = { kind: 'BANNER' as const, title: 'T', subtitle: null, mediaUrl: 'https://x/a.jpg', thumbnailUrl: null, durationSeconds: null, actionType: 'SCREEN' as const, actionTarget: 'SELL', ctaLabel: 'Sell', city: 'Pune', hubName: null, startsAt: '2026-11-20T03:30:00.000Z', endsAt: null };
    const form = formFromItem(item);
    expect(form).toMatchObject({ title: 'T', subtitle: '', city: 'Pune', actionTarget: 'SELL', endsAt: '' });
    expect(toPayload(form).startsAt).toBe(item.startsAt); // the same moment comes back
  });
});

describe('when it shows', () => {
  const format = (iso: string) => iso.slice(0, 10);
  it('says in words when an item is or will be visible', () => {
    expect(whenText({ state: 'DRAFT', startsAt: null, endsAt: null }, format)).toBe('Not shown to customers');
    expect(whenText({ state: 'ARCHIVED', startsAt: null, endsAt: null }, format)).toBe('Removed from Home');
    expect(whenText({ state: 'SCHEDULED', startsAt: '2026-12-01T00:00:00Z', endsAt: null }, format)).toBe('Starts 2026-12-01');
    expect(whenText({ state: 'EXPIRED', startsAt: null, endsAt: '2026-11-01T00:00:00Z' }, format)).toBe('Ended 2026-11-01');
    expect(whenText({ state: 'LIVE', startsAt: null, endsAt: '2026-12-31T00:00:00Z' }, format)).toBe('Until 2026-12-31');
    expect(whenText({ state: 'LIVE', startsAt: null, endsAt: null }, format)).toBe('No end date');
  });
});

describe('uploading', () => {
  it('builds the upload address for the right kind of media', () => {
    expect(cloudinaryUploadUrl('vmotiv', 'video')).toBe('https://api.cloudinary.com/v1_1/vmotiv/video/upload');
    expect(cloudinaryUploadUrl('a b', 'image')).toBe('https://api.cloudinary.com/v1_1/a%20b/image/upload');
  });
  it('reads a good reply, rounds the duration, and refuses a reply without a secure address', () => {
    expect(readUpload({ secure_url: 'https://res.cloudinary.com/v/video/upload/a.mp4', duration: 27.6 })).toEqual({ url: 'https://res.cloudinary.com/v/video/upload/a.mp4', durationSeconds: 28 });
    expect(readUpload({ secure_url: 'https://res.cloudinary.com/v/image/upload/a.jpg' }).durationSeconds).toBeNull();
    for (const bad of [null, {}, { secure_url: 'http://x/a.jpg' }, { secure_url: 42 }]) expect(() => readUpload(bad)).toThrow();
  });
});
