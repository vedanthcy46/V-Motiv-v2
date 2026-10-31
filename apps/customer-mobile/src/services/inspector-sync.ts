import AsyncStorage from '@react-native-async-storage/async-storage';

export type DraftPayload = {
  identity: {
    registrationNumber: string;
    odometerKm: number;
    vinChassis?: string;
    engineNumber?: string;
    rcVerified?: boolean;
    insuranceVerified?: boolean;
    hypothecationDeclared?: boolean;
    declarationConfirmed?: boolean;
    defectPhotos?: Record<string, string>;
  };
  answers: Array<{ itemKey: string; status: string; value?: unknown; notes?: string }>;
  defects: Array<{ category: string; severity: string; description: string; location?: string; photoUrl?: string }>;
};

export type PendingDraft = {
  id: string;
  reportId: string;
  recordVersion: number;
  payload: DraftPayload;
  createdAt: string;
};

export type PendingMedia = {
  id: string;
  reportId: string;
  logicalMediaId: string;
  uri?: string;
  base64Data?: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  clientChecksum?: string;
  createdAt: string;
};

const draftQueueKey = (uid: string) => `vmotiv-inspector/draft-queue/${uid}`;
const mediaQueueKey = (uid: string) => `vmotiv-inspector/media-queue/${uid}`;
export const cachedJobsKey = (uid: string) => `vmotiv-inspector/jobs/${uid}`;
export const cachedTemplateKey = (key: string, version: number) => `vmotiv-inspector/template/${key}/${version}`;

export async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Draft Queue ---

async function readDrafts(uid: string): Promise<PendingDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(draftQueueKey(uid));
    if (!raw) return [];
    return JSON.parse(raw) as PendingDraft[];
  } catch (err: any) {
    console.warn('[READ_DRAFTS_QUEUE_ERROR]', err?.message || err);
    if (String(err?.message || err).includes('CursorWindow') || String(err?.message || err).includes('too big')) {
      await AsyncStorage.removeItem(draftQueueKey(uid)).catch(() => {});
    }
    return [];
  }
}

export async function queuedDraftCount(uid: string) {
  return (await readDrafts(uid)).length;
}

export async function enqueueDraft(uid: string, reportId: string, recordVersion: number, payload: DraftPayload) {
  const current = await readDrafts(uid);
  const next = current.filter(item => item.reportId !== reportId);
  next.push({
    id: `${reportId}:${Date.now()}`,
    reportId,
    recordVersion,
    payload,
    createdAt: new Date().toISOString(),
  });
  try {
    await AsyncStorage.setItem(draftQueueKey(uid), JSON.stringify(next));
  } catch (err: any) {
    console.warn('[ENQUEUE_DRAFT_ERROR]', err?.message || err);
    if (String(err?.message || err).includes('CursorWindow') || String(err?.message || err).includes('too big')) {
      await AsyncStorage.removeItem(draftQueueKey(uid)).catch(() => {});
    }
  }
}

export async function flushDrafts(uid: string, send: (item: PendingDraft) => Promise<void>) {
  const pending = await readDrafts(uid);
  const remaining: PendingDraft[] = [];
  for (const item of pending) {
    try {
      await send(item);
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(draftQueueKey(uid), JSON.stringify(remaining));
  return { sent: pending.length - remaining.length, pending: remaining.length };
}

// --- Media Queue ---

async function readMedia(uid: string): Promise<PendingMedia[]> {
  try {
    const raw = await AsyncStorage.getItem(mediaQueueKey(uid));
    if (!raw) return [];
    return JSON.parse(raw) as PendingMedia[];
  } catch (err: any) {
    console.warn('[READ_MEDIA_QUEUE_ERROR]', err?.message || err);
    if (String(err?.message || err).includes('CursorWindow') || String(err?.message || err).includes('too big')) {
      await AsyncStorage.removeItem(mediaQueueKey(uid)).catch(() => {});
    }
    return [];
  }
}

export async function queuedMediaCount(uid: string) {
  return (await readMedia(uid)).length;
}

export async function enqueueMedia(
  uid: string,
  reportId: string,
  logicalMediaId: string,
  uriOrBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  clientChecksum?: string,
) {
  const isUri = uriOrBase64.startsWith('file:') || uriOrBase64.startsWith('content:') || uriOrBase64.startsWith('/') || uriOrBase64.startsWith('http');
  const current = await readMedia(uid);
  const next = current.filter(item => !(item.reportId === reportId && item.logicalMediaId === logicalMediaId));
  next.push({
    id: `${reportId}:${logicalMediaId}:${Date.now()}`,
    reportId,
    logicalMediaId,
    uri: isUri ? uriOrBase64 : undefined,
    // Only store base64 in SQLite if it's exceptionally small (< 100KB); otherwise uri MUST be used to prevent CursorWindow overflow
    base64Data: !isUri && uriOrBase64.length < 100_000 ? uriOrBase64 : undefined,
    mimeType,
    clientChecksum,
    createdAt: new Date().toISOString(),
  });
  try {
    await AsyncStorage.setItem(mediaQueueKey(uid), JSON.stringify(next));
  } catch (err: any) {
    console.warn('[ENQUEUE_MEDIA_ERROR]', err?.message || err);
    if (String(err?.message || err).includes('CursorWindow') || String(err?.message || err).includes('too big')) {
      await AsyncStorage.removeItem(mediaQueueKey(uid)).catch(() => {});
    }
  }
}

export async function flushMedia(
  uid: string,
  send: (item: PendingMedia & { base64Data: string }) => Promise<void>
) {
  const pending = await readMedia(uid);
  const remaining: PendingMedia[] = [];
  for (const item of pending) {
    try {
      let base64 = item.base64Data;
      if (!base64 && item.uri) {
        base64 = await uriToBase64(item.uri);
      }
      if (!base64) throw new Error('Missing base64 data for media');
      await send({ ...item, base64Data: base64 });
    } catch {
      remaining.push(item);
    }
  }
  try {
    await AsyncStorage.setItem(mediaQueueKey(uid), JSON.stringify(remaining));
  } catch (err: any) {
    if (String(err?.message || err).includes('CursorWindow')) {
      await AsyncStorage.removeItem(mediaQueueKey(uid)).catch(() => {});
    }
  }
  return { sent: pending.length - remaining.length, pending: remaining.length };
}
