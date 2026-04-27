import { AppState, type AppStateStatus, Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { API_BASE_URL } from '@/constants/api';

type NetworkStatusValue = {
  isOffline: boolean;
  isChecking: boolean;
  lastCheckedAt: number | null;
  refresh: () => Promise<void>;
};

const NetworkStatusContext = createContext<NetworkStatusValue | null>(null);

const buildPingUrl = () => API_BASE_URL;

const pingNetwork = async (signal: AbortSignal) => {
  await fetch(buildPingUrl(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
    signal,
  });
};

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    setIsChecking(true);

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setIsOffline(true);
        return;
      }

      await pingNetwork(controller.signal);
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    } finally {
      clearTimeout(timeoutId);
      setIsChecking(false);
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      if (!active) {
        return;
      }

      await refresh();
    })();

    intervalId = setInterval(() => {
      void refresh();
    }, 30000);

    const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refresh();
      }
    });

    let removeOnlineListeners: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => void refresh();
      const handleOffline = () => {
        setIsOffline(true);
        setIsChecking(false);
        setLastCheckedAt(Date.now());
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      removeOnlineListeners = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      appStateSubscription.remove();
      removeOnlineListeners?.();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      isOffline,
      isChecking,
      lastCheckedAt,
      refresh,
    }),
    [isChecking, isOffline, lastCheckedAt, refresh]
  );

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);

  if (!context) {
    throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  }

  return context;
};
