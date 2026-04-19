import AsyncStorage from '@react-native-async-storage/async-storage';

const SCREEN_CACHE_PREFIX = 'finance-go.screen-cache.';

type ScreenCacheEnvelope<T> = {
  data: T;
  updatedAt: number;
};

export const buildScreenCacheKey = (scope: string, userId: string | number, suffix?: string) =>
  `${SCREEN_CACHE_PREFIX}${scope}:${String(userId)}${suffix ? `:${suffix}` : ''}`;

export const readScreenCache = async <T,>(key: string) => {
  const raw = await AsyncStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ScreenCacheEnvelope<T>;
  } catch {
    return null;
  }
};

export const writeScreenCache = async <T,>(key: string, data: T) => {
  const payload: ScreenCacheEnvelope<T> = {
    data,
    updatedAt: Date.now(),
  };

  await AsyncStorage.setItem(key, JSON.stringify(payload));
};

export const clearAllScreenCache = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => key.startsWith(SCREEN_CACHE_PREFIX));

  if (!cacheKeys.length) {
    return;
  }

  await AsyncStorage.multiRemove(cacheKeys);
};
