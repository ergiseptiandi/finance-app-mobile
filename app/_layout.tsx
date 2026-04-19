import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useAppLanguage, AppLanguageProvider } from '@/providers/language-provider';
import { NavigationThemes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider } from '@/providers/theme-provider';

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
  const { t } = useAppLanguage();

  return (
    <ThemeProvider value={NavigationThemes[colorScheme]}>
      <Stack screenOptions={{ headerShown: false }}>
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
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
