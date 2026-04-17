import { AUTH_ENDPOINTS } from '@/constants/api';

export type ApiEnvelope<T> = {
  Status: string;
  Message: string;
  Data: T;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type AuthToken = {
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  token_type: 'Bearer';
};

export type AuthSession = {
  user: AuthUser;
  token: AuthToken;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  device_name?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  device_name?: string;
};

export type RefreshPayload = {
  refresh_token: string;
  device_name?: string;
};

export type LogoutPayload = {
  refresh_token: string;
};

export type UpdateProfilePayload = {
  name?: string;
  email?: string;
};

export type ChangePasswordPayload = {
  old_password: string;
  new_password: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  new_password: string;
};

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string;
};

type ErrorEnvelope = {
  Status?: string;
  Message?: string;
};

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope =>
  isObject(value) && typeof value.Message === 'string';

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  if (contentType.includes('application/json') || raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }

  return raw;
};

const request = async <T>(url: string, options: RequestOptions = {}) => {
  const { token, body, headers: optionHeaders, ...rest } = options;
  const headers = new Headers(optionHeaders);
  headers.set('Accept', 'application/json');

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    headers.set('Authorization', bearerToken);
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message = isErrorEnvelope(payload)
      ? payload.Message
      : `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message, payload);
  }

  return payload as T;
};

export const register = (payload: RegisterPayload) =>
  request<ApiEnvelope<AuthSession>>(AUTH_ENDPOINTS.register, {
    method: 'POST',
    body: payload,
  });

export const login = (payload: LoginPayload) =>
  request<ApiEnvelope<AuthSession>>(AUTH_ENDPOINTS.login, {
    method: 'POST',
    body: payload,
  });

export const refreshToken = (payload: RefreshPayload) =>
  request<ApiEnvelope<AuthSession>>(AUTH_ENDPOINTS.refresh, {
    method: 'POST',
    body: payload,
  });

export const logout = (payload: LogoutPayload) =>
  request<ApiEnvelope<{ status: 'logged_out' }>>(AUTH_ENDPOINTS.logout, {
    method: 'POST',
    body: payload,
  });

export const getMe = (accessToken: string) =>
  request<ApiEnvelope<AuthUser>>(AUTH_ENDPOINTS.me, {
    method: 'GET',
    token: accessToken,
  });

export const updateProfile = (accessToken: string, payload: UpdateProfilePayload) =>
  request<ApiEnvelope<AuthUser>>(AUTH_ENDPOINTS.profile, {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const changePassword = (accessToken: string, payload: ChangePasswordPayload) =>
  request<ApiEnvelope<{ status: 'password_changed' }>>(AUTH_ENDPOINTS.password, {
    method: 'PATCH',
    token: accessToken,
    body: payload,
  });

export const forgotPassword = (payload: ForgotPasswordPayload) =>
  request<ApiEnvelope<{ status: 'email_sent'; reset_token?: string }>>(
    AUTH_ENDPOINTS.forgotPassword,
    {
      method: 'POST',
      body: payload,
    }
  );

export const resetPassword = (payload: ResetPasswordPayload) =>
  request<ApiEnvelope<{ status: 'password_reset' }>>(AUTH_ENDPOINTS.resetPassword, {
    method: 'POST',
    body: payload,
  });
