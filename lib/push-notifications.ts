import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type NotificationData = Record<string, unknown> | undefined;

export const registerNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

export const resolveNotificationRoute = (data: NotificationData) => {
  const kind = typeof data?.kind === 'string' ? data.kind : typeof data?.type === 'string' ? data.type : '';

  if (kind === 'daily_expense_input') {
    return '/activity';
  }

  if (kind === 'debt_payment') {
    return '/debt';
  }

  return '/';
};

export const getDevicePushToken = async () => {
  if (Platform.OS !== 'android') {
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
