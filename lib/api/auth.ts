import { AUTH_ENDPOINTS } from '@/constants/api';
import { ApiRequestError, request } from '@/lib/api/client';

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

export { ApiRequestError } from '@/lib/api/client';

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
