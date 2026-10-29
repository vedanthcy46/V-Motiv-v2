import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from '../api';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Configure Android notification channels
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'V MOTIV Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#061A38',
    enableVibrate: true,
    showBadge: true,
  });

  void Notifications.setNotificationChannelAsync('connect-calls', {
    name: 'V MOTIV Connect Calls & Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#F7B503',
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

export interface InAppNotification {
  id: string;
  eventType: string;
  category: string;
  title: string;
  body: string;
  deepLink?: string;
  entityId?: string;
  read: boolean;
  createdAt: string;
}

export async function registerForPushNotificationsAsync(
  appMode: 'CUSTOMER' | 'INSPECTOR'
): Promise<string | null> {
  if (!Device.isDevice) {
    console.info('[PUSH_NOTIF] Must use a physical device for remote push notifications');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.info('[PUSH_NOTIF] Push notification permissions were not granted by the user');
      return null;
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const easProjectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    const hasValidProjectId = typeof easProjectId === 'string' && UUID_REGEX.test(easProjectId.trim());

    if (!hasValidProjectId) {
      console.info(
        '[PUSH_NOTIF] EAS projectId is not configured or not a valid UUID. Remote push token registration requires EAS ("npx eas init"). In-app notifications inbox is active.'
      );
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: easProjectId.trim(),
    }).catch(err => {
      console.warn('[PUSH_TOKEN_FETCH_WARNING]', err?.message || err);
      return null;
    });

    if (!tokenData?.data) return null;

    const token = tokenData.data;

    // Register device token with V MOTIV API backend
    await api('/api/v2/push-devices', {
      method: 'POST',
      body: JSON.stringify({
        token,
        app: appMode,
        platform: Platform.OS.toUpperCase(),
      }),
    }).catch(err => {
      console.warn('[PUSH_REGISTRATION_BACKEND_WARNING]', err?.message || err);
    });

    return token;
  } catch (err: any) {
    console.warn('[PUSH_REGISTRATION_EXCEPTION]', err?.message || err);
    return null;
  }
}

export async function fetchUserNotifications(limit = 30): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  try {
    const res = await api<{ items: InAppNotification[]; unreadCount: number }>(`/api/v2/notifications?limit=${limit}`);
    return {
      items: res?.items || [],
      unreadCount: res?.unreadCount || 0,
    };
  } catch {
    return { items: [], unreadCount: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  try {
    await api(`/api/v2/notifications/${id}/read`, { method: 'PATCH' });
    return true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await api('/api/v2/notifications/read-all', { method: 'POST' });
    return true;
  } catch {
    return false;
  }
}
