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

export const readLatestScreenCache = async <T,>(scope: string, userId: string | number) => {
  const prefix = `${SCREEN_CACHE_PREFIX}${scope}:${String(userId)}`;
  const keys = await AsyncStorage.getAllKeys();
  const matchingKeys = keys.filter((key) => key.startsWith(prefix));

  if (!matchingKeys.length) {
    return null;
  }

  const entries = await Promise.all(
    matchingKeys.map(async (key) => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as ScreenCacheEnvelope<T>;
        return { key, parsed };
      } catch {
        return null;
      }
    })
  );

  const validEntries = entries.filter((entry): entry is { key: string; parsed: ScreenCacheEnvelope<T> } => entry !== null);

  if (!validEntries.length) {
    return null;
  }

  return validEntries.reduce((latest, current) =>
    current.parsed.updatedAt > latest.parsed.updatedAt ? current : latest
  ).parsed;
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
