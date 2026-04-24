import { listNotifications, type NotificationRecord } from '@/lib/api/notifications';

const normalizeNotificationList = (data: unknown): NotificationRecord[] => {
  if (Array.isArray(data)) {
    return data as NotificationRecord[];
  }

  if (data && typeof data === 'object') {
    const source = data as Record<string, unknown>;
    const keys = ['data', 'notifications', 'items', 'records', 'rows'] as const;

    for (const key of keys) {
      const items = normalizeNotificationList(source[key]);
      if (items.length > 0) {
        return items;
      }
    }
  }

  return [];
};

const isUnreadNotification = (item: NotificationRecord) => {
  if (typeof item.read === 'boolean') {
    return !item.read;
  }

  return !item.read_at;
};

export const loadUnreadNotificationCount = async (accessToken: string) => {
  const response = await listNotifications(accessToken, { read: false });
  return normalizeNotificationList(response.Data).filter(isUnreadNotification).length;
};
