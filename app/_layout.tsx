import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

import { useAppLanguage, AppLanguageProvider } from '@/providers/language-provider';
import { Colors, NavigationThemes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider, useAppTheme } from '@/providers/theme-provider';
import { getOnboardingCompleted } from '@/lib/onboarding';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  return (
    <AppLanguageProvider>
      <AppThemeProvider>
        <RootNavigator />
      </AppThemeProvider>
    </AppLanguageProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const segments = useSegments();
  const { isThemeHydrated } = useAppTheme();
  const { isLanguageHydrated, t } = useAppLanguage();
  const colors = Colors[colorScheme];
  const [isOnboardingHydrated, setIsOnboardingHydrated] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    if (isThemeHydrated && isLanguageHydrated && isOnboardingHydrated) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLanguageHydrated, isOnboardingHydrated, isThemeHydrated]);

  useEffect(() => {
    let active = true;

    const hydrateOnboarding = async () => {
      if (!isThemeHydrated || !isLanguageHydrated) {
        return;
      }

      const completed = await getOnboardingCompleted();

      if (!active) {
        return;
      }

      setIsOnboardingComplete(completed);
      setIsOnboardingHydrated(true);
    };

    hydrateOnboarding();

    return () => {
      active = false;
    };
  }, [isLanguageHydrated, isThemeHydrated]);

  if (!isThemeHydrated || !isLanguageHydrated || !isOnboardingHydrated) {
    return (
      <View style={[styles.loadingGate, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const firstSegment = segments[0] ?? '';

  if (!isOnboardingComplete && firstSegment !== 'onboarding') {
    return <Redirect href="/onboarding" />;
  }

  if (isOnboardingComplete && firstSegment === 'onboarding') {
    return <Redirect href="/" />;
  }

  return (
    <ThemeProvider value={NavigationThemes[colorScheme]}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: isDark ? 'none' : 'simple_push',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ animation: 'simple_push' }} />
        <Stack.Screen name="onboarding" options={{ animation: isDark ? 'none' : 'fade' }} />
        <Stack.Screen name="login" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen name="forgot-password" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen name="reset-password" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen name="register" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen name="(tabs)" options={{ animation: isDark ? 'none' : 'fade' }} />
        <Stack.Screen name="categories" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen name="wallets" options={{ animation: isDark ? 'none' : 'simple_push' }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', headerShown: true, title: t('common.modal') }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
