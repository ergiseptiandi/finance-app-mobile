import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';

import { useAppLanguage, AppLanguageProvider } from '@/providers/language-provider';
import { Colors, NavigationThemes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider, useAppTheme } from '@/providers/theme-provider';

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
  const { isThemeHydrated } = useAppTheme();
  const colors = Colors[colorScheme];
  const { t } = useAppLanguage();

  useEffect(() => {
    if (isThemeHydrated) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isThemeHydrated]);

  if (!isThemeHydrated) {
    return (
      <View style={[styles.loadingGate, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={NavigationThemes[colorScheme]}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wallets" />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', headerShown: true, title: t('common.modal') }}
        />
      </Stack>
      <StatusBar animated style={colorScheme === 'dark' ? 'light' : 'dark'} />
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
