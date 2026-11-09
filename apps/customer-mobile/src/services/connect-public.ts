/**
 * First-party, public V MOTIV Connect scanner API. It intentionally does not
 * send a Firebase token: a passer-by must be able to alert an owner without an
 * account, and the API returns no registration number, address, or phone data.
 */
import { apiBaseUrl, resolveRequestUrl } from '../api';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** Accept the V2 printed URL, an unwrapped token, or the app deep link. */
export function parseConnectQr(value: string): { token: string } | null {
  const candidate = value.trim();
  if (TOKEN_PATTERN.test(candidate)) return { token: candidate };

  try {
    const url = new URL(candidate);
    const match = url.pathname.match(/(?:^|\/)connect\/([A-Za-z0-9_-]{32,128})(?:\/|$)/i);
    const pathToken = match?.[1];
    if (pathToken && TOKEN_PATTERN.test(pathToken)) return { token: pathToken };

    if (url.protocol === 'vmotiv:' && url.hostname === 'connect') {
      const token = url.searchParams.get('token') || '';
      if (TOKEN_PATTERN.test(token)) return { token };
    }
  } catch {
    // A malformed scan is handled by the caller with a clear, safe error.
  }
  return null;
}

export type PublicConnectVehicle = {
  nickname: string;
  make?: string;
  model?: string;
  year?: number;
  messagingEnabled: boolean;
  callingEnabled: boolean;
};

type PublicAlertReason = 'BLOCKING_ACCESS' | 'LIGHTS_ON' | 'DAMAGE_OR_ACCIDENT' | 'SAFETY_CONCERN' | 'OTHER';
type ApiError = Error & { status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveRequestUrl(`/api/v2/public/connect${path}`), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || 'Unable to contact V MOTIV Connect.') as ApiError;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export async function lookupPublicConnectVehicle(token: string): Promise<PublicConnectVehicle> {
  const response = await request<{ active: boolean; vehicle: PublicConnectVehicle }>(`/${encodeURIComponent(token)}`);
  if (!response.active) throw new Error('This V MOTIV Connect sticker is temporarily paused by its owner.');
  return response.vehicle;
}

export async function sendPublicConnectAlert(
  token: string,
  reason: PublicAlertReason,
  message?: string,
  photos?: string[],
): Promise<{ success: boolean; alertId: string; deduplicated?: boolean }> {
  return request(`/${encodeURIComponent(token)}/alerts`, {
    method: 'POST',
    body: JSON.stringify({
      reason,
      message: message?.trim() || undefined,
      photos: photos && photos.length > 0 ? photos : undefined,
    }),
  });
}

export async function uploadPublicConnectPhoto(
  token: string,
  base64Data: string,
  mimeType = 'image/jpeg',
): Promise<{ url: string; secureUrl: string }> {
  return request(`/${encodeURIComponent(token)}/photos`, {
    method: 'POST',
    body: JSON.stringify({ base64Data, mimeType }),
  });
}

export async function requestPublicConnectCall(
  token: string,
  mode: 'VOICE' | 'CHAT' = 'VOICE',
  initialMessage?: string,
): Promise<{ callSessionId: string; status: string; alreadyPending?: boolean }> {
  return request(`/${encodeURIComponent(token)}/call-requests`, {
    method: 'POST',
    body: JSON.stringify({ consentGiven: true, mode, initialMessage: initialMessage?.trim() || undefined }),
  });
}

export async function fetchPublicRealtimeTicket(
  token: string,
  callSessionId: string,
): Promise<{ ticket: string; expiresAt: string }> {
  return request(`/${encodeURIComponent(token)}/calls/${encodeURIComponent(callSessionId)}/realtime-ticket`, {
    method: 'POST',
  });
}

export type WebRtcSignal = {
  id?: string;
  kind: 'OFFER' | 'ANSWER' | 'ICE' | 'HANGUP';
  payload: Record<string, unknown>;
  createdAt?: string;
};

export async function fetchPublicCallSignals(
  token: string,
  callSessionId: string,
  after?: string,
): Promise<{ status: string; items: WebRtcSignal[] }> {
  return request(`/${encodeURIComponent(token)}/calls/${encodeURIComponent(callSessionId)}/signals${after ? `?after=${encodeURIComponent(after)}` : ''}`);
}

export async function sendPublicCallSignal(
  token: string,
  callSessionId: string,
  kind: WebRtcSignal['kind'],
  payload: Record<string, unknown>,
) {
  return request(`/${encodeURIComponent(token)}/calls/${encodeURIComponent(callSessionId)}/signals`, {
    method: 'POST',
    body: JSON.stringify({ kind, payload }),
  });
}

export function resolveRealtimeSocketUrl(): string {
  if (process.env.EXPO_PUBLIC_REALTIME_URL) {
    return process.env.EXPO_PUBLIC_REALTIME_URL;
  }
  const base = apiBaseUrl();
  return base.replace(/\/api\/v[0-9]+\/?$/, '').replace(/\/api\/?$/, '');
}

