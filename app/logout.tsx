import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { signOut } from '@/lib/auth-session';
import { useAppLanguage } from '@/providers/language-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';

export default function LogoutScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const styles = createStyles(colors);
  const { t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();

  useEffect(() => {
    let active = true;

    const completeLogout = async () => {
      try {
        await signOut();
      } finally {
        if (!active) {
          return;
        }

        showTransitionOverlay();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        router.replace('/login');
      }
    };

    void completeLogout();

    return () => {
      active = false;
    };
  }, [showTransitionOverlay]);

  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>{t('settings.logout')}</Text>
        <Text style={styles.body}>{t('settings.loggingOut')}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: (typeof Colors)['light']) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
    },
    panel: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      gap: 12,
      borderRadius: 28,
      paddingHorizontal: 24,
      paddingVertical: 28,
      backgroundColor: colors.surfaceContainerLowest,
    },
    title: {
      color: colors.onSurface,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    body: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      textAlign: 'center',
    },
  });
