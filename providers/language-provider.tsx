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

import { APP_LANGUAGES, LANGUAGE_LABELS, translate, type AppLanguage } from '@/constants/i18n';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  languageLabel: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLanguageHydrated: boolean;
};

const STORAGE_KEY = 'finance-go.language.preference';

const LanguageContext = createContext<LanguageContextValue | null>(null);

const readStoredLanguage = async () => {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return APP_LANGUAGES.includes(value as AppLanguage) ? (value as AppLanguage) : null;
  } catch {
    return null;
  }
};

const writeStoredLanguage = async (language: AppLanguage) => {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, language);
  } catch {
    // Ignore persistence failures and keep the in-memory language.
  }
};

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('id');
  const [isLanguageHydrated, setIsLanguageHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateLanguage = async () => {
      const savedLanguage = await readStoredLanguage();
      if (!active) {
        return;
      }

      if (savedLanguage) {
        setLanguageState(savedLanguage);
      }
      setIsLanguageHydrated(true);
    };

    hydrateLanguage();

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    await writeStoredLanguage(nextLanguage);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      languageLabel: LANGUAGE_LABELS[language],
      t,
      isLanguageHydrated,
    }),
    [isLanguageHydrated, language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useAppLanguage must be used inside AppLanguageProvider');
  }

  return context;
}
