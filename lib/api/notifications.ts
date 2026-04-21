import { buildApiUrl } from '@/constants/api';
import { request } from '@/lib/api/client';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type NotificationSettingsData = {
  user_id?: number | string | null;
  enabled: boolean;
  daily_expense_reminder_enabled: boolean;
  daily_expense_reminder_time: string | null;
  debt_payment_reminder_enabled: boolean;
  debt_payment_reminder_time: string | null;
  debt_payment_reminder_days_before: number | string | null;
  salary_reminder_enabled: boolean;
  salary_reminder_time: string | null;
  salary_reminder_days_before: number | string | null;
  salary_day: number | string | null;
  push_token: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UpdateNotificationSettingsPayload = Partial<
  Pick<
    NotificationSettingsData,
    | 'enabled'
    | 'daily_expense_reminder_enabled'
    | 'daily_expense_reminder_time'
    | 'debt_payment_reminder_enabled'
    | 'debt_payment_reminder_time'
    | 'debt_payment_reminder_days_before'
    | 'salary_reminder_enabled'
    | 'salary_reminder_time'
    | 'salary_reminder_days_before'
    | 'salary_day'
    | 'push_token'
  >
>;

export type NotificationListParams = {
  kind?: string;
  read?: boolean;
};

export type NotificationRecord = {
  id: number | string;
  kind?: string | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  read?: boolean | null;
  delivery_status?: 'skipped' | 'failed' | 'delivered' | string | null;
  scheduled_for?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  dedupe_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  data?: Record<string, unknown> | null;
};

export type NotificationListData = NotificationRecord[] | { data?: NotificationRecord[]; total?: number };

const buildNotificationsUrl = (path = '') => buildApiUrl(`notifications${path ? `/${path}` : ''}`);

const withQueryParams = (url: string, params: NotificationListParams = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
};

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

export const listNotifications = (accessToken: string, params: NotificationListParams = {}) =>
  request<ApiEnvelope<NotificationListData>>(withQueryParams(buildNotificationsUrl(), params), {
    method: 'GET',
    token: accessToken,
  });

export const generateNotifications = (accessToken: string) =>
  request<ApiEnvelope<NotificationRecord[]>>(buildNotificationsUrl('generate'), {
    method: 'POST',
    token: accessToken,
  });

export const markNotificationAsRead = (accessToken: string, id: number | string) =>
  request<ApiEnvelope<{ status: 'read' }>>(buildNotificationsUrl(`${id}/read`), {
    method: 'PATCH',
    token: accessToken,
  });
