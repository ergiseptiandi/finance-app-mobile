import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationData = Record<string, unknown> | undefined;

type NotificationsModule = typeof import('expo-notifications');

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

const getNotificationsModule = () => {
  if (isExpoGo) {
    return null;
  }

  return require('expo-notifications') as NotificationsModule;
};

export const registerNotificationHandler = () => {
  const Notifications = getNotificationsModule();

  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

export const resolveNotificationRoute = (data: NotificationData) => {
  if (typeof data?.route === 'string' && data.route) {
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
