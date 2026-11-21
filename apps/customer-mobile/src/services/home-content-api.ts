import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { emptyHomeContent, parseHomeContent, readCache, visibleNow, type CachedHomeContent, type HomeContent } from './home-content';

// Fetching Home content, and keeping the last good copy on the phone so Home still has its banners and hub media when offline.
// Storage trouble never blocks anything: with no saved copy the phone just shows no promotional content.

const CACHE_KEY = 'vmotiv.home-content.v1';

export async function readSavedHomeContent(city: string): Promise<HomeContent | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? readCache(JSON.parse(raw), city) : null;
  } catch {
    return null;
  }
}

async function saveHomeContent(city: string, content: HomeContent): Promise<void> {
  try {
    const value: CachedHomeContent = { savedAt: Date.now(), city, content };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // not saved; the next online visit fetches it again
  }
}

/** The live content for a city (empty string for no city), checked and filtered by date. Throws when the server cannot be reached. */
export async function fetchHomeContent(city: string): Promise<HomeContent> {
  const raw = await api<unknown>(`/api/v2/home/content${city ? `?city=${encodeURIComponent(city)}` : ''}`);
  const content = visibleNow(parseHomeContent(raw));
  await saveHomeContent(city, content);
  return content;
}

export { emptyHomeContent };
