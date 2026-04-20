import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type NotificationSettingsData = {
  enabled: boolean;
  daily_expense_reminder_enabled: boolean;
  daily_expense_reminder_time?: string | null;
  debt_payment_reminder_enabled: boolean;
  debt_payment_reminder_time?: string | null;
  debt_payment_reminder_days_before?: number | string | null;
  push_token?: string | null;
};

export type UpdateNotificationSettingsPayload = Partial<NotificationSettingsData>;

const buildNotificationsUrl = (path = '') => buildApiUrl(`notifications${path ? `/${path}` : ''}`);

export const getNotificationSettings = (accessToken: string) =>
  request<ApiEnvelope<NotificationSettingsData>>(buildNotificationsUrl('settings'), {
    method: 'GET',
    token: accessToken,
  });

export const updateNotificationSettings = (accessToken: string, payload: UpdateNotificationSettingsPayload) =>
  request<ApiEnvelope<NotificationSettingsData>>(buildNotificationsUrl('settings'), {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });
