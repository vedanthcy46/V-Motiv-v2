import { NativeModules, TurboModuleRegistry } from 'react-native';
import Constants from 'expo-constants';
import { resolveApiBaseUrl, withDeadline } from './api-network';

export const hasNativeFirebase = Boolean(
  TurboModuleRegistry.get('NativeRNFBTurboApp') ||
  TurboModuleRegistry.get('RNFBAppModule') ||
  NativeModules?.NativeRNFBTurboApp ||
  NativeModules?.RNFBAppModule
);

let devSessionToken: string | undefined = undefined;

export function setDevSessionToken(token: string | undefined) {
  devSessionToken = token;
}

export function getDevSessionToken() {
  return devSessionToken;
}

async function getAuthToken(forceRefresh: boolean): Promise<string | undefined> {
  if (devSessionToken) return devSessionToken;
  if (!hasNativeFirebase) return undefined;
  const authModule = require('@react-native-firebase/auth');
  const user = authModule.getAuth().currentUser;
  if (!user) return undefined;
  return withDeadline(user.getIdToken(forceRefresh), 8_000, 'SESSION_TIMEOUT');
}

export function apiBaseUrl() {
  const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
  return resolveApiBaseUrl({
    configured: process.env.EXPO_PUBLIC_API_URL,
    development: __DEV__,
    devServerUrl: scriptURL?.startsWith('http') ? scriptURL : Constants.expoConfig?.hostUri,
  });
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export async function api<T>(path: string, init: RequestInit = {}, forceRefresh = false): Promise<T> {
  const controller = new AbortController();
  const externalAbort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', externalAbort);
  const request = async (refresh: boolean): Promise<T> => {
    if (controller.signal.aborted) throw new ApiError(0, 'REQUEST_CANCELLED');
    const token = await getAuthToken(refresh);
    // Token refresh can finish after the request deadline or caller cancellation.
    // Never start the consequential request after the caller has stopped waiting.
    if (controller.signal.aborted) throw new ApiError(0, 'REQUEST_CANCELLED');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl()}${path}`, { ...init, signal: controller.signal, headers });
    } catch (error) {
      if (init.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED');
      if (error instanceof Error && error.message === 'API_CONFIGURATION_REQUIRED') throw error;
      if (__DEV__ && !controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 700));
        try {
          response = await fetch(`${apiBaseUrl()}${path}`, { ...init, signal: controller.signal, headers });
        } catch {
          throw new ApiError(0, 'NETWORK_UNREACHABLE');
        }
      } else {
        throw new ApiError(0, 'NETWORK_UNREACHABLE');
      }
    }
    if (response.status === 401 && token && !refresh) return request(true);
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => { throw new ApiError(response.status, 'INVALID_API_RESPONSE'); }) as { code?: string };
    if (!response.ok) throw new ApiError(response.status, body.code ?? 'REQUEST_FAILED');
    return body as T;
  };
  try {
    // Include token acquisition, one authorized retry, and response parsing.
    return await withDeadline(request(forceRefresh), 15_000, 'REQUEST_TIMEOUT', () => controller.abort());
  } finally {
    init.signal?.removeEventListener('abort', externalAbort);
  }
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
