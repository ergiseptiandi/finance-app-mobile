import * as SecureStore from 'expo-secure-store';

import { ApiRequestError, logout, refreshToken } from '@/lib/api/auth';
import type { AuthSession } from '@/lib/api/auth';
import { clearAllScreenCache } from '@/lib/screen-cache';

const SESSION_STORAGE_KEY = 'finance-go.auth.session';
let refreshSessionInFlight: Promise<AuthSession | null> | null = null;

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
  await clearAllScreenCache();
};

export const getAccessToken = async () => {
  const session = await getAuthSession();
  return session?.token.access_token ?? null;
};

export const refreshStoredAuthSession = async () => {
  if (!refreshSessionInFlight) {
    refreshSessionInFlight = (async () => {
      const session = await getAuthSession();

      if (!session?.token.refresh_token) {
        return null;
      }

      try {
        const refreshed = await refreshToken({
          refresh_token: session.token.refresh_token,
        });

        await saveAuthSession(refreshed.Data);
        return refreshed.Data;
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          await clearAuthSession();
          return null;
        }

        throw error;
      } finally {
        refreshSessionInFlight = null;
      }
    })();
  }

  return refreshSessionInFlight;
};

export const signOut = async () => {
  const session = await getAuthSession();

  try {
    if (session?.token.refresh_token) {
      await logout({
        refresh_token: session.token.refresh_token,
      });
    }
  } catch {
    // Clear locally even if the server logout request fails.
  } finally {
    await clearAuthSession();
  }
};
