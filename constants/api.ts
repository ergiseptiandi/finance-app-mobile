const DEFAULT_API_BASE_URL = 'https://api-finance.paidev.my.id';
const API_VERSION = 'v1';

const normalizeUrl = (value: string | undefined) => {
  const url = (value ?? DEFAULT_API_BASE_URL).trim();
  return url.replace(/\/+$/, '');
};

const joinUrl = (...segments: string[]) =>
  segments
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .join('/');

export const API_BASE_URL = normalizeUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
export const API_V1_URL = joinUrl(API_BASE_URL, API_VERSION);
export const AUTH_BASE_URL = joinUrl(API_V1_URL, 'auth');

export const AUTH_ENDPOINTS = {
  register: joinUrl(AUTH_BASE_URL, 'register'),
  login: joinUrl(AUTH_BASE_URL, 'login'),
  refresh: joinUrl(AUTH_BASE_URL, 'refresh'),
  logout: joinUrl(AUTH_BASE_URL, 'logout'),
  me: joinUrl(AUTH_BASE_URL, 'me'),
  profile: joinUrl(AUTH_BASE_URL, 'profile'),
  password: joinUrl(AUTH_BASE_URL, 'password'),
  forgotPassword: joinUrl(AUTH_BASE_URL, 'forgot-password'),
  resetPassword: joinUrl(AUTH_BASE_URL, 'reset-password'),
} as const;

export const buildApiUrl = (path: string) => joinUrl(API_V1_URL, path);
