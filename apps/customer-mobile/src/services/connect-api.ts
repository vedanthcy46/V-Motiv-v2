import { api, jsonBody } from '../api';

export interface ConnectNotificationItem {
  id: string;
  linkId: string;
  vehicleId: string;
  eventType: string;
  reason?: string | null;
  messagePreview?: string | null;
  photoUrls?: string[] | null;
  callSessionId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ConnectCallSessionItem {
  id: string;
  callSessionId: string;
  provider: string;
  status: string;
  durationSeconds?: number | null;
  createdAt: string;
}

export interface GarageConnectInfo {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  registrationNumber?: string | null;
  connectStatus: string;
  isLinked: boolean;
  link?: {
    id: string;
    status: string;
    qrTokenPreview: string;
    createdAt: string;
    lastSyncedAt?: string | null;
    stickerImageUrl?: string | null;
    /** Whether a passer-by may start a voice call / a chat through this sticker (both on unless the owner turned them off). */
    callingEnabled?: boolean;
    messagingEnabled?: boolean;
  } | null;
  stats: {
    totalAlerts: number;
    unreadAlerts: number;
    totalCalls: number;
  };
  recentAlerts: ConnectNotificationItem[];
  recentCalls: ConnectCallSessionItem[];
}

export interface IncomingConnectCall {
  id: string;
  callSessionId: string;
  provider: string;
  status: string;
  callerType?: string;
  createdAt: string;
  signals?: Array<{ id: string; kind: string; payload: any; createdAt: string }>;
  link: { vehicleId: string; vehicle: { make: string; model: string; year: number } };
}

export interface LinkConnectInput {
  token?: string;
  qrUrl?: string;
  claimCode?: string;
}

export interface RequestStickerInput {
  deliveryAddress?: string;
  city?: string;
  pincode?: string;
  instructions?: string;
}

export async function fetchConnectStatus(vehicleId: string): Promise<GarageConnectInfo> {
  return api<GarageConnectInfo>(`/api/v2/customer/garage/${vehicleId}/connect`);
}

export async function linkConnectQR(
  vehicleId: string,
  input: LinkConnectInput
): Promise<{ success: boolean; link: any; message: string }> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/link`, {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function issueConnectSticker(vehicleId: string): Promise<{
  success: boolean;
  link: { id: string; status: string; qrTokenPreview: string; createdAt: string };
  stickerUrl: string;
  stickerImageUrl: string;
  message: string;
}> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/issue`, { method: 'POST' });
}

export async function toggleConnectStatus(
  vehicleId: string,
  enabled: boolean
): Promise<{ success: boolean; status: string; connectStatus: string }> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/toggle`, {
    method: 'POST',
    body: jsonBody({ enabled }),
  });
}

export async function updateConnectContactPreferences(
  vehicleId: string,
  update: { callingEnabled?: boolean; messagingEnabled?: boolean }
): Promise<{ success: boolean; callingEnabled: boolean; messagingEnabled: boolean }> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/contact-preferences`, {
    method: 'POST',
    body: jsonBody(update),
  });
}

export async function revokeConnectQR(
  vehicleId: string,
  reason?: string
): Promise<{ success: boolean; revoked: boolean; message: string }> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/revoke`, {
    method: 'POST',
    body: jsonBody({ reason }),
  });
}

export async function requestConnectSticker(
  vehicleId: string,
  input: RequestStickerInput
): Promise<{
  success: boolean;
  requestId: string;
  status: string;
  message: string;
  estimatedDeliveryDays: number;
}> {
  return api(`/api/v2/customer/garage/${vehicleId}/connect/request-sticker`, {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function fetchConnectAlerts(
  vehicleId?: string,
  page = 1,
  limit = 20
): Promise<{
  items: ConnectNotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const url = vehicleId
    ? `/api/v2/customer/garage/${vehicleId}/connect/alerts?page=${page}&limit=${limit}`
    : `/api/v2/customer/connect/alerts?page=${page}&limit=${limit}`;
  return api(url);
}

export async function markConnectAlertRead(alertId: string): Promise<ConnectNotificationItem> {
  return api(`/api/v2/customer/connect/alerts/${alertId}/read`, {
    method: 'PATCH',
  });
}

export async function fetchIncomingConnectCalls(): Promise<{ items: IncomingConnectCall[] }> {
  return api('/api/v2/customer/connect/calls/incoming');
}

export async function respondToIncomingConnectCall(callSessionId: string, decision: 'ACCEPT' | 'DECLINE') {
  return api<{ callSessionId: string; status: string }>(`/api/v2/customer/connect/calls/${callSessionId}/respond`, {
    method: 'POST',
    body: jsonBody({ decision }),
  });
}

export type WebRtcSignal = {
  id: string;
  kind: 'OFFER' | 'ANSWER' | 'ICE' | 'HANGUP' | 'CHAT' | 'CLOSE';
  senderRole?: 'VISITOR' | 'OWNER';
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function fetchOwnerCallSignals(callSessionId: string, after?: string): Promise<{ status: string; items: WebRtcSignal[] }> {
  return api(`/api/v2/customer/connect/calls/${callSessionId}/signals${after ? `?after=${encodeURIComponent(after)}` : ''}`);
}

export async function sendOwnerCallSignal(callSessionId: string, kind: WebRtcSignal['kind'], payload: Record<string, unknown>) {
  return api(`/api/v2/customer/connect/calls/${callSessionId}/signals`, { method: 'POST', body: jsonBody({ kind, payload }) });
}

export async function closeConnectCall(callSessionId: string, reason?: string) {
  return api<{ callSessionId: string; status: string }>(`/api/v2/customer/connect/calls/${callSessionId}/close`, {
    method: 'POST',
    body: jsonBody({ reason }),
  });
}

export async function fetchOwnerRealtimeTicket(callSessionId: string): Promise<{ ticket: string; expiresAt: string }> {
  return api(`/api/v2/customer/connect/calls/${encodeURIComponent(callSessionId)}/realtime-ticket`, {
    method: 'POST',
  });
}
