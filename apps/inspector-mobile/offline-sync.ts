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
  };
  answers: Array<{ itemKey: string; status: string; value?: unknown; notes?: string }>;
  defects: Array<{ category: string; severity: string; description: string; location?: string }>;
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
  base64Data: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  clientChecksum?: string;
  createdAt: string;
};

const draftQueueKey = (uid: string) => `vmotiv-inspector/draft-queue/${uid}`;
const mediaQueueKey = (uid: string) => `vmotiv-inspector/media-queue/${uid}`;
export const cachedJobsKey = (uid: string) => `vmotiv-inspector/jobs/${uid}`;
export const cachedTemplateKey = (key: string, version: number) => `vmotiv-inspector/template/${key}/${version}`;

// --- Draft Queue ---

async function readDrafts(uid: string): Promise<PendingDraft[]> {
  const raw = await AsyncStorage.getItem(draftQueueKey(uid));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingDraft[];
  } catch {
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
  await AsyncStorage.setItem(draftQueueKey(uid), JSON.stringify(next));
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
  const raw = await AsyncStorage.getItem(mediaQueueKey(uid));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingMedia[];
  } catch {
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
  base64Data: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  clientChecksum?: string
) {
  const current = await readMedia(uid);
  const next = current.filter(item => !(item.reportId === reportId && item.logicalMediaId === logicalMediaId));
  next.push({
    id: `${reportId}:${logicalMediaId}:${Date.now()}`,
    reportId,
    logicalMediaId,
    base64Data,
    mimeType,
    clientChecksum,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(mediaQueueKey(uid), JSON.stringify(next));
}

export async function flushMedia(uid: string, send: (item: PendingMedia) => Promise<void>) {
  const pending = await readMedia(uid);
  const remaining: PendingMedia[] = [];
  for (const item of pending) {
    try {
      await send(item);
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(mediaQueueKey(uid), JSON.stringify(remaining));
  return { sent: pending.length - remaining.length, pending: remaining.length };
}

export async function totalQueuedCount(uid: string) {
  const [d, m] = await Promise.all([queuedDraftCount(uid), queuedMediaCount(uid)]);
  return d + m;
}
