import AsyncStorage from '@react-native-async-storage/async-storage';

export const sellDraftKey = (userId?: string) => `vmotiv.v2.sell-draft.v3.${userId || 'guest'}`;
export const mutationKey = () => `sell-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
// Serialize writes so an older edit cannot overtake a newer one or restore a submitted draft.
let pending: Promise<unknown> = Promise.resolve();
export function saveSellDraft(key: string, value: unknown) {
  pending = pending.catch(() => undefined).then(() => AsyncStorage.setItem(key, JSON.stringify(value)));
  return pending;
}
export async function readSellDraft(key: string) {
  await pending.catch(() => undefined);
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
export function removeSellDraft(key: string) {
  pending = pending.catch(() => undefined).then(() => AsyncStorage.removeItem(key));
  return pending;
}
