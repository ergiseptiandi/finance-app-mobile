import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type NotificationData = Record<string, unknown> | undefined;

type NotificationsModule = typeof Notifications;

const DEFAULT_NOTIFICATION_CHANNEL_ID = 'finance-go-default';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

const getNotificationsModule = () => {
  if (isExpoGo) {
    return null;
  }

  return Notifications;
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

  const token = await Notifications.getDevicePushTokenAsync();

  if (typeof token === 'string') {
    return token;
  }

  return token.data ?? null;
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
