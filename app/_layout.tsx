import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { router, Redirect, Stack, useSegments } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

import { useAppLanguage, AppLanguageProvider } from '@/providers/language-provider';
import { Colors, NavigationThemes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider, useAppTheme } from '@/providers/theme-provider';
import { getOnboardingCompleted } from '@/lib/onboarding';
import { TransitionOverlayProvider, useTransitionOverlay } from '@/providers/transition-overlay-provider';
import { registerNotificationHandler, resolveNotificationRoute } from '@/lib/push-notifications';

void SplashScreen.preventAutoHideAsync().catch(() => {});
registerNotificationHandler();

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  return (
    <AppLanguageProvider>
      <TransitionOverlayProvider>
        <AppThemeProvider>
          <RootNavigator />
        </AppThemeProvider>
      </TransitionOverlayProvider>
    </AppLanguageProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const segments = useSegments();
  const { isThemeHydrated } = useAppTheme();
  const { isLanguageHydrated, t } = useAppLanguage();
  const { hideTransitionOverlay, isTransitionOverlayVisible } = useTransitionOverlay();
  const colors = Colors[colorScheme];
  const [isOnboardingHydrated, setIsOnboardingHydrated] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    if (isThemeHydrated && isLanguageHydrated && isOnboardingHydrated) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLanguageHydrated, isOnboardingHydrated, isThemeHydrated]);

  useEffect(() => {
    if (!isTransitionOverlayVisible) {
      return;
    }

    let active = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (active) {
          hideTransitionOverlay();
        }
      });
    });

    return () => {
      active = false;
    };
  }, [hideTransitionOverlay, isTransitionOverlayVisible, segments]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = resolveNotificationRoute(response.notification.request.content.data as Record<string, unknown> | undefined);
      router.push(route as never);
    });

    return () => subscription.remove();
  }, []);

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
      <View style={styles.navigatorRoot}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: isDark ? 'none' : 'simple_push',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="index" options={{ animation: 'simple_push' }} />
          <Stack.Screen name="onboarding" options={{ animation: isDark ? 'none' : 'fade' }} />
          <Stack.Screen name="logout" options={{ animation: 'none' }} />
          <Stack.Screen name="login" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="forgot-password" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="reset-password" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="register" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="notifications" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="(tabs)" options={{ animation: isDark ? 'none' : 'fade' }} />
          <Stack.Screen name="categories" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen name="wallets" options={{ animation: isDark ? 'none' : 'simple_push' }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', headerShown: true, title: t('common.modal') }}
          />
        </Stack>

        {isTransitionOverlayVisible ? (
          <View pointerEvents="none" style={[styles.transitionOverlay, { backgroundColor: colors.background }]} />
        ) : null}
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  navigatorRoot: {
    flex: 1,
  },
  loadingGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
  },
});
