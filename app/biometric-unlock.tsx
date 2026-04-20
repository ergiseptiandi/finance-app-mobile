import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { authenticateBiometric } from '@/lib/biometric-auth';
import { refreshStoredAuthSession } from '@/lib/auth-session';
import { useAppLanguage } from '@/providers/language-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';

export default function BiometricUnlockScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const styles = createStyles(colors);
  const { t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const unlock = async () => {
      setLoading(true);
      setError('');

      try {
        const authenticated = await authenticateBiometric(t('unlock.prompt'));

        if (!authenticated) {
          if (active) {
            setError(t('unlock.cancelled'));
            setLoading(false);
          }
          return;
        }

        const session = await refreshStoredAuthSession();

        if (!active) {
          return;
        }

        if (!session) {
          router.replace('/login');
          return;
        }

        showTransitionOverlay();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        router.replace('/(tabs)');
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : t('unlock.failed'));
          setLoading(false);
        }
      }
    };

    void unlock();

    return () => {
      active = false;
    };
  }, [showTransitionOverlay, t]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="fingerprint" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('unlock.title')}</Text>
          <Text style={styles.subtitle}>{t('unlock.subtitle')}</Text>

          {loading ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
          {!!error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void (async () => {
                setLoading(true);
                setError('');
                const authenticated = await authenticateBiometric(t('unlock.prompt'));
                if (!authenticated) {
                  setError(t('unlock.cancelled'));
                  setLoading(false);
                  return;
                }

                const session = await refreshStoredAuthSession();
                if (!session) {
                  router.replace('/login');
                  return;
                }

                showTransitionOverlay();
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                router.replace('/(tabs)');
              })();
            }}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>{t('unlock.retry')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: colors.surface,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 28,
      padding: 24,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.12),
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.08),
    },
    title: {
      color: colors.onSurface,
      fontSize: 22,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      textAlign: 'center',
    },
    spinner: {
      marginTop: 6,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
    button: {
      marginTop: 6,
      minHeight: 50,
      paddingHorizontal: 18,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPressed: {
      opacity: 0.92,
    },
    buttonText: {
      color: colors.inverseText,
      fontSize: 14,
      fontWeight: '800',
    },
  });
