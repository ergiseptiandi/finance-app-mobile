import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ApiRequestError } from '@/lib/api/auth';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingsData,
} from '@/lib/api/notifications';
import { refreshStoredAuthSession } from '@/lib/auth-session';

type NotificationData = Record<string, unknown> | undefined;

type NotificationsModule = typeof Notifications;

type SyncPushTokenResult = {
  token: string | null;
  settings: NotificationSettingsData | null;
  synced: boolean;
};

const DEFAULT_NOTIFICATION_CHANNEL_ID = 'finance-go-default';
let pushTokenSyncInFlight: Promise<SyncPushTokenResult> | null = null;

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

const getNotificationsModule = () => {
  if (isExpoGo) {
    return null;
  }

  return Notifications;
};

const retryWithRefreshedSession = async <T,>(
  task: (token: string) => Promise<T>,
  accessToken: string
) => {
  try {
    return await task(accessToken);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      const refreshed = await refreshStoredAuthSession();
      if (refreshed) {
        return task(refreshed.token.access_token);
      }
    }

    throw error;
  }
};

const getGrantedDevicePushToken = async () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const Notifications = getNotificationsModule();

  if (!Notifications) {
    return null;
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    return null;
  }

  const token = await Notifications.getDevicePushTokenAsync();

  if (typeof token === 'string') {
    return token;
  }

  return token.data ?? null;
};

export const registerNotificationHandler = () => {
  const Notifications = getNotificationsModule();

  if (!Notifications) {
    return;
  }

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
      name: 'Finance GO Alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      showBadge: true,
    }).catch(() => {});
  }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
};

export const resolveNotificationRoute = (data: NotificationData) => {
  if (typeof data?.route === 'string' && data.route) {
    if (data.route === '/activity') {
      return '/activity?compose=expense';
    }

    if (data.route === '/debts') {
      return '/debt';
    }

    if (data.route === '/transactions?type=income') {
      return '/activity?compose=income';
    }

    return data.route;
  }

  const kind = typeof data?.kind === 'string' ? data.kind : typeof data?.type === 'string' ? data.type : '';

  if (kind === 'daily_expense_input') {
    return '/activity?compose=expense';
  }

  if (kind === 'debt_payment') {
    return '/debt';
  }

  if (kind === 'salary_reminder') {
    return '/activity?compose=income';
  }

  return '/';
};

export const getDevicePushToken = async () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const Notifications = getNotificationsModule();

  if (!Notifications) {
    return null;
  }

  const permission = await Notifications.getPermissionsAsync();
  let granted = permission.status === 'granted';

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.status === 'granted';
  }

  if (!granted) {
    return null;
  }

  return getGrantedDevicePushToken();
};

export const syncDevicePushToken = async (
  accessToken: string,
  currentSettings?: NotificationSettingsData | null
) => {
  if (pushTokenSyncInFlight) {
    return pushTokenSyncInFlight;
  }

  pushTokenSyncInFlight = (async () => {
    let token: string | null = null;

    try {
      token = await getGrantedDevicePushToken();

      if (!token) {
        return {
          token: null,
          settings: currentSettings ?? null,
          synced: false,
        } satisfies SyncPushTokenResult;
      }

      const settingsResponse = currentSettings
        ? { Data: currentSettings }
        : await retryWithRefreshedSession((tokenValue) => getNotificationSettings(tokenValue), accessToken);

      const settings = settingsResponse.Data ?? null;

      if (!settings || settings.push_token === token) {
        return {
          token,
          settings,
          synced: false,
        } satisfies SyncPushTokenResult;
      }

      const response = await retryWithRefreshedSession(
        (tokenValue) =>
          updateNotificationSettings(tokenValue, {
            enabled: settings.enabled,
            daily_expense_reminder_enabled: settings.daily_expense_reminder_enabled,
            daily_expense_reminder_time: settings.daily_expense_reminder_time ?? undefined,
            debt_payment_reminder_enabled: settings.debt_payment_reminder_enabled,
            debt_payment_reminder_time: settings.debt_payment_reminder_time ?? undefined,
            debt_payment_reminder_days_before: settings.debt_payment_reminder_days_before ?? undefined,
            salary_reminder_enabled: settings.salary_reminder_enabled,
            salary_reminder_time: settings.salary_reminder_time ?? undefined,
            salary_reminder_days_before: settings.salary_reminder_days_before ?? undefined,
            salary_day: settings.salary_day ?? undefined,
            push_token: token,
          }),
        accessToken
      );

      return {
        token,
        settings: response.Data ?? settings,
        synced: true,
      } satisfies SyncPushTokenResult;
    } catch {
      return {
        token,
        settings: currentSettings ?? null,
        synced: false,
      } satisfies SyncPushTokenResult;
    }
  })();

  try {
    return await pushTokenSyncInFlight;
  } finally {
    pushTokenSyncInFlight = null;
  }
};

export const registerNotificationResponseListener = (
  handler: Parameters<NotificationsModule['addNotificationResponseReceivedListener']>[0]
) => {
  const Notifications = getNotificationsModule();

  if (!Notifications) {
    return null;
  }

  return Notifications.addNotificationResponseReceivedListener(handler);
};
