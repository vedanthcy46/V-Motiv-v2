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

export function resolveRequestUrl(path: string) {
  const base = apiBaseUrl();
  if (path.startsWith('/api/')) {
    const origin = base.replace(/\/api\/v[0-9]+\/?$/, '').replace(/\/api\/?$/, '');
    return `${origin}${path}`;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export async function api<T>(path: string, init: RequestInit = {}, forceRefresh = false): Promise<T> {
  const controller = new AbortController();
  const externalAbort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', externalAbort);
  const targetUrl = resolveRequestUrl(path);
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
      response = await fetch(targetUrl, { ...init, signal: controller.signal, headers });
    } catch (error) {
      if (init.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED');
      if (error instanceof Error && error.message === 'API_CONFIGURATION_REQUIRED') throw error;
      if (__DEV__ && !controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 700));
        try {
          response = await fetch(targetUrl, { ...init, signal: controller.signal, headers });
        } catch {
          throw new ApiError(0, 'NETWORK_UNREACHABLE');
        }
      } else {
        throw new ApiError(0, 'NETWORK_UNREACHABLE');
      }
    }
    if (response.status === 401 && token && !refresh) return request(true);
    if (response.status === 204) return undefined as T;
    const rawText = await response.text().catch(() => '');
    let body: any = undefined;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        // Response payload is not JSON (e.g. gateway error HTML or plain text)
      }
    }
    if (!response.ok) {
      const code =
        body?.code ||
        (response.status === 502 || response.status === 503 || response.status === 504
          ? 'SERVICE_UNAVAILABLE'
          : response.status === 404
          ? 'RESOURCE_NOT_FOUND'
          : response.status === 401
          ? 'AUTHENTICATION_REQUIRED'
          : response.status === 409
          ? 'RESOURCE_CONFLICT'
          : 'REQUEST_FAILED');
      throw new ApiError(response.status, code);
    }
    if (body === undefined && rawText.trim()) {
      throw new ApiError(response.status, 'INVALID_API_RESPONSE');
    }
    return (body ?? null) as T;
  };
  try {
    // Include token acquisition, one authorized retry, and response parsing.
    return await withDeadline(request(forceRefresh), 15_000, 'REQUEST_TIMEOUT', () => controller.abort());
  } finally {
    init.signal?.removeEventListener('abort', externalAbort);
  }
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
