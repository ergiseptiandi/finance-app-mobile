import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

type ColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: ColorScheme;
  resolvedSystemColorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
  isThemeHydrated: boolean;
};

const STORAGE_KEY = 'finance-go.theme.preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredTheme = async () => {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const writeStoredTheme = async (scheme: ColorScheme) => {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, scheme);
  } catch {
    // Ignore persistence failures and keep the in-memory theme.
  }
};

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const resolvedSystemColorScheme: ColorScheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [storedColorScheme, setStoredColorScheme] = useState<ColorScheme | null>(null);
  const [isThemeHydrated, setIsThemeHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateTheme = async () => {
      const savedTheme = await readStoredTheme();
      if (!active) {
        return;
      }

      setStoredColorScheme(savedTheme);
      setIsThemeHydrated(true);
    };

    hydrateTheme();

    return () => {
      active = false;
    };
  }, []);

  const setColorScheme = useCallback(async (scheme: ColorScheme) => {
    setStoredColorScheme(scheme);
    await writeStoredTheme(scheme);
  }, []);

  const colorScheme = storedColorScheme ?? resolvedSystemColorScheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      resolvedSystemColorScheme,
      setColorScheme,
      isThemeHydrated,
    }),
    [colorScheme, isThemeHydrated, resolvedSystemColorScheme, setColorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }

  return context;
}

export function useAppColorScheme() {
  return useAppTheme().colorScheme;
}
