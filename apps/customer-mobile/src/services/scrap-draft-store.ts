import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DraftState } from './scrap-form';

// A copy of the answers on this phone, so closing the app, losing signal or a failed save never loses what was typed. The server's draft is
// the real one (it follows the person to another device); this is only what has not reached it yet. Storage trouble never blocks anyone.

const key = (userId: string | undefined, requestId: string | null) => `vmotiv.scrap-draft.v1.${userId || 'guest'}.${requestId ?? 'new'}`;

export async function readLocalDraft(userId: string | undefined, requestId: string | null): Promise<DraftState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, requestId));
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch {
    return null;
  }
}

export async function writeLocalDraft(userId: string | undefined, requestId: string | null, draft: DraftState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId, requestId), JSON.stringify(draft));
  } catch {
    // not saved on the phone; the server copy still works
  }
}

export async function clearLocalDraft(userId: string | undefined, requestId: string | null): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId, requestId));
  } catch {
    // nothing to clean up
  }
}
