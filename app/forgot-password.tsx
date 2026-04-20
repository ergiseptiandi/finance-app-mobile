import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError, forgotPassword } from '@/lib/api/auth';
import { useAppLanguage } from '@/providers/language-provider';

export default function ForgotPasswordScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.bottom);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentToken, setSentToken] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.navigate('/login');
        return true;
      });

      return () => subscription.remove();
    }, [])
  );

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(t('forgot.error.required'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');
    setSentToken('');

    try {
      const response = await forgotPassword({ email: email.trim() });
      const token = response.Data?.reset_token ?? '';

      setSuccessMessage(t('forgot.success'));
      if (token) {
        setSentToken(token);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(t('forgot.error.generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <KeyboardAvoidingView
          style={styles.keyboardShell}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.container}>
              <View style={[styles.grid, isWide && styles.gridWide]}>
                <View style={[styles.heroColumn, isWide && styles.heroColumnWide]}>
                  <View style={styles.heroBadge}>
                    <MaterialCommunityIcons name="lock-reset" size={14} color={colors.primary} />
                    <Text style={styles.heroBadgeText}>{t('forgot.heroBadge')}</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    {t('forgot.heroTitleLead')}
                    {'\n'}
                    <Text style={styles.heroAccent}>{t('forgot.heroTitleAccent')}</Text>
                    {t('forgot.heroTitleTail')}
                  </Text>

                  <Text style={styles.heroBody}>{t('forgot.heroBody')}</Text>

                  <View style={styles.previewCard}>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDot} />
                      <Text style={styles.previewLabel}>{t('forgot.preview.backendRoute')}</Text>
                      <Text style={styles.previewValue}>/v1/auth/forgot-password</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDotSecondary} />
                      <Text style={styles.previewLabel}>{t('forgot.preview.nextStep')}</Text>
                      <Text style={styles.previewValue}>{t('forgot.preview.resetScreen')}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>Finance-GO</Text>
                        <Text style={styles.formTitle}>{t('forgot.title')}</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons name="mail" size={18} color={colors.inverseText} />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>{t('forgot.subtitle')}</Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('login.emailAddress')}</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons
                          name="email-outline"
                          size={18}
                          color={colors.icon}
                        />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          placeholder="Email"
                          placeholderTextColor={colors.inputPlaceholder}
                          style={styles.input}
                        />
                      </View>
                    </View>

                    {!!error && <Text style={styles.errorText}>{error}</Text>}

                    {!!successMessage && (
                      <View style={styles.successBox}>
                        <MaterialCommunityIcons
                          name="check-circle-outline"
                          size={18}
                          color={colors.success}
                        />
                        <Text style={styles.successText}>{successMessage}</Text>
                      </View>
                    )}

                    {!!sentToken && (
                      <View style={styles.tokenBox}>
                        <Text style={styles.tokenLabel}>{t('forgot.devResetToken')}</Text>
                        <Text style={styles.tokenValue}>{sentToken}</Text>
                        <Pressable
                          onPress={() =>
                            router.navigate({
                              pathname: '/reset-password',
                              params: { token: sentToken },
                            })
                          }
                          style={styles.tokenButton}>
                          <Text style={styles.tokenButtonText}>{t('forgot.continueToReset')}</Text>
                          <MaterialCommunityIcons
                            name="arrow-right"
                            size={18}
                            color={colors.primary}
                          />
                        </Pressable>
                      </View>
                    )}

                    <Pressable
                      onPress={handleSubmit}
                      disabled={loading}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && !loading && styles.pressedButton,
                        loading && styles.disabledButton,
                      ]}>
                      {loading ? (
                        <ActivityIndicator color={colors.inverseText} />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>{t('forgot.submit')}</Text>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={20}
                            color={colors.inverseText}
                          />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>{t('forgot.rememberPassword')}</Text>
                      <Pressable onPress={() => router.navigate('/login')}>
                        <Text style={styles.footerLink}>{t('forgot.backToLogin')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColorTheme, bottomInset: number) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    keyboardShell: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 24 + bottomInset,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 1240,
    },
    grid: {
      gap: 24,
    },
    heroColumn: {
      display: 'none',
    },
    heroColumnWide: {
      display: 'flex',
      flex: 1,
    },
    formColumn: {
      width: '100%',
    },
    formColumnWide: {
      width: '100%',
      maxWidth: 520,
    },
    glowTop: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 260,
      height: 260,
      borderRadius: 260,
      backgroundColor: colors.primaryGlow,
    },
    glowBottom: {
      position: 'absolute',
      left: -100,
      bottom: 50,
      width: 240,
      height: 240,
      borderRadius: 240,
      backgroundColor: colors.secondaryGlow,
    },
    formCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 28,
      padding: 24,
      shadowColor: colors.ambientShadow,
      shadowOpacity: 0.12,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
      elevation: 3,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    brandKicker: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 2.2,
    },
    formTitle: {
      marginTop: 6,
      color: colors.onSurface,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '800',
      letterSpacing: -1.1,
    },
    brandMark: {
      width: 42,
      height: 42,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      shadowColor: alpha(colors.primary, 0.28),
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    formSubtitle: {
      marginTop: 12,
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    fieldGroup: {
      marginTop: 18,
    },
    fieldLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    inputShell: {
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    input: {
      flex: 1,
      color: colors.onSurface,
      fontSize: 15,
      fontWeight: '600',
      paddingVertical: 0,
    },
    errorText: {
      marginTop: 14,
      color: colors.danger,
      fontSize: 13,
      fontWeight: '600',
    },
    successBox: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: colors.successSoft,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    successText: {
      flex: 1,
      color: colors.success,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 18,
    },
    tokenBox: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerLow,
      padding: 14,
      gap: 8,
    },
    tokenLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    tokenValue: {
      color: colors.onSurface,
      fontSize: 13,
      fontWeight: '700',
    },
    tokenButton: {
      marginTop: 4,
      minHeight: 44,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    tokenButtonText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    primaryButton: {
      marginTop: 20,
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: alpha(colors.primary, 0.26),
      shadowOpacity: 1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
    },
    pressedButton: {
      transform: [{ scale: 0.99 }],
      opacity: 0.95,
    },
    disabledButton: {
      opacity: 0.75,
    },
    primaryButtonText: {
      color: colors.inverseText,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    footerRow: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    footerText: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      fontWeight: '500',
    },
    footerLink: {
      color: colors.secondary,
      fontSize: 13,
      fontWeight: '800',
    },
    heroBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.glassSurface,
    },
    heroBadgeText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    heroTitle: {
      marginTop: 22,
      color: colors.onSurface,
      fontSize: 56,
      lineHeight: 60,
      fontWeight: '900',
      letterSpacing: -2,
    },
    heroAccent: {
      color: colors.primary,
      fontStyle: 'italic',
    },
    heroBody: {
      marginTop: 20,
      maxWidth: 460,
      color: colors.onSurfaceVariant,
      fontSize: 18,
      lineHeight: 28,
      fontWeight: '500',
    },
    previewCard: {
      marginTop: 28,
      maxWidth: 420,
      borderRadius: 24,
      backgroundColor: colors.glassSurface,
      padding: 18,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    previewDot: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    previewDotSecondary: {
      width: 10,
      height: 10,
      borderRadius: 10,
      backgroundColor: colors.secondary,
    },
    previewLabel: {
      flex: 1,
      color: colors.onSurfaceVariant,
      fontSize: 14,
      fontWeight: '600',
    },
    previewValue: {
      color: colors.onSurface,
      fontSize: 14,
      fontWeight: '800',
    },
    gridWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
    },
  });
