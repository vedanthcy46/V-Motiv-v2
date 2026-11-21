// Employee (Inspector) notifications: the same PostgreSQL-backed inbox the web portals use, under /employees/me.
// Push only carries { notificationId, module, actionRoute, severity }. Tapping it never trusts that payload: the server is asked
// whether the notification may be opened now (employment, assignment, resolved or reassigned) and the route is checked here too.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from '../api';
import { OPEN_REFUSAL_MESSAGE, inspectorTargetFromRoute, parsePushData } from './employee-notification-routes';

export { OPEN_REFUSAL_MESSAGE, inspectorTargetFromRoute, parsePushData };

export type NotificationSeverity = 'CRITICAL' | 'ACTION_REQUIRED' | 'INFORMATIONAL';

export interface EmployeeNotification {
  id: string;
  createdAt: string;
  severity: NotificationSeverity;
  module: string;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  actionRoute: string | null;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  read: boolean;
  actionable: boolean;
  resolvedAt: string | null;
  supersededAt: string | null;
}

export type OpenDecision =
  | { allowed: true; actionRoute: string; resourceId?: string | null }
  | { allowed: false; reason: 'NO_LONGER_EMPLOYED' | 'NO_LONGER_AUTHORISED' | 'REASSIGNED' | 'RESOLVED' | 'EXPIRED' | 'NO_LINK' | string };

const BASE = '/api/v2/employees/me';

export async function listEmployeeNotifications(limit = 30): Promise<{ items: EmployeeNotification[]; unreadCount: number; actionRequiredCount: number }> {
  const res = await api<{ items: EmployeeNotification[]; unreadCount: number; actionRequiredCount?: number }>(`${BASE}/notifications?limit=${limit}`);
  return { items: res.items ?? [], unreadCount: res.unreadCount ?? 0, actionRequiredCount: res.actionRequiredCount ?? 0 };
}
export const markEmployeeNotificationRead = (id: string) => api(`${BASE}/notifications/${id}/read`, { method: 'PATCH' });
export const markAllEmployeeNotificationsRead = () => api(`${BASE}/notifications/read-all`, { method: 'POST', body: JSON.stringify({}) });
export const acknowledgeEmployeeNotification = (id: string) => api(`${BASE}/notifications/${id}/acknowledge`, { method: 'POST' });
export const authoriseNotificationOpen = (id: string) => api<OpenDecision>(`${BASE}/notifications/${id}/open`);

// ----------------------------------------------------------------------------------------------------------------- devices
const DEVICE_KEY = 'vmotiv.employeeNotificationDeviceId';

/** Registers this phone's Expo push token to the signed-in employee. The server replaces a changed token and releases it from anyone who used the phone before. */
export async function registerEmployeeDevice(token: string, projectId?: string): Promise<boolean> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const device = await api<{ id: string }>(`${BASE}/notification-devices`, { method: 'POST', body: JSON.stringify({ token, app: 'INSPECTOR', platform, ...(projectId ? { projectId } : {}) }) });
    await AsyncStorage.setItem(DEVICE_KEY, device.id).catch(() => undefined);
    return true;
  } catch (error: any) {
    console.warn('[EMPLOYEE_DEVICE_REGISTER_WARNING]', error?.message || error);
    return false;
  }
}

/** Stop pushing to this phone for the person signing out. Called while the session token is still valid. */
export async function unregisterEmployeeDevice(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) return;
    await api(`${BASE}/notification-devices/${id}`, { method: 'DELETE' });
  } catch (error: any) {
    // 404: already released (for example the account was suspended). Anything else: the server still stops pushing when a send fails.
    if (!/404|DEVICE_NOT_FOUND/.test(String(error?.status ?? error?.code ?? error?.message ?? ''))) console.warn('[EMPLOYEE_DEVICE_UNREGISTER_WARNING]', error?.message || error);
  } finally {
    await AsyncStorage.removeItem(DEVICE_KEY).catch(() => undefined);
  }
}
