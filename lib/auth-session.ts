import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from '@/lib/api/auth';

const SESSION_STORAGE_KEY = 'finance-go.auth.session';

export const saveAuthSession = async (session: AuthSession) => {
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const getAuthSession = async () => {
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

export const clearAuthSession = async () => {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
};

export const getAccessToken = async () => {
  const session = await getAuthSession();
  return session?.token.access_token ?? null;
};
