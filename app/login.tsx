import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { ApiRequestError, login } from '@/lib/api/auth';
import { saveAuthSession } from '@/lib/auth-session';
import { getDeviceName } from '@/lib/device-name';
import { useAppLanguage } from '@/providers/language-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';

const DEVICE_NAME = getDeviceName();

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.bottom);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateEmail = (value: string) => {
    if (!value.trim()) return t('login.error.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return t('login.error.emailInvalid');
    return '';
  };

  const handleLogin = async () => {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = !password.trim() ? t('login.error.passwordRequired') : '';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    setLoading(true);
    setError('');

    try {
      const response = await login({
        email: email.trim(),
        password,
        device_name: DEVICE_NAME,
      });
      await saveAuthSession(response.Data);
      showTransitionOverlay();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(t('login.error.generic'));
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
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={styles.heroBadgeText}>{t('login.heroBadge')}</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    {t('login.heroTitleLead')}
                    {'\n'}
                    <Text style={styles.heroAccent}>{t('login.heroTitleAccent')}</Text>{' '}
                    {t('login.heroTitleTail')}
                  </Text>

                  <Text style={styles.heroBody}>{t('login.heroBody')}</Text>

                  <View style={styles.previewCard}>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDot} />
                      <Text style={styles.previewLabel}>{t('login.preview.refreshTokens')}</Text>
                      <Text style={styles.previewValue}>{t('login.preview.rolling')}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDotSecondary} />
                      <Text style={styles.previewLabel}>{t('login.preview.deviceTracking')}</Text>
                      <Text style={styles.previewValue}>{t('login.preview.enabled')}</Text>
                    </View>
                    <View style={styles.previewFooter}>
                      <Text style={styles.previewFooterText}>{t('login.preview.builtForAuthFlow')}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>{t('login.brandKicker')}</Text>
                        <Text style={styles.formTitle}>{t('login.title')}</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons name="pulse" size={18} color={colors.inverseText} />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>{t('login.subtitle')}</Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('login.emailAddress')}</Text>
                      <View style={[styles.inputShell, !!emailError && styles.inputShellError]}>
                        <MaterialCommunityIcons
                          name="email-outline"
                          size={18}
                          color={emailError ? colors.danger : colors.icon}
                        />
                        <TextInput
                          value={email}
                          onChangeText={(v) => { setEmail(v); setEmailError(''); }}
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          placeholder="Email"
                          placeholderTextColor={colors.inputPlaceholder}
                          style={styles.input}
                        />
                      </View>
                      {!!emailError && <Text style={styles.inlineError}>{emailError}</Text>}
                    </View>

                    <View style={styles.fieldGroup}>
                      <View style={styles.labelRow}>
                        <Text style={styles.fieldLabel}>{t('login.password')}</Text>
                        <Pressable onPress={() => router.navigate('/forgot-password')} hitSlop={12}>
                          <Text style={styles.linkText}>{t('login.forgotPassword')}</Text>
                        </Pressable>
                      </View>
                      <View style={[styles.inputShell, !!passwordError && styles.inputShellError]}>
                        <MaterialCommunityIcons
                          name="lock-outline"
                          size={18}
                          color={passwordError ? colors.danger : colors.icon}
                        />
                        <TextInput
                          value={password}
                          onChangeText={(v) => { setPassword(v); setPasswordError(''); }}
                          autoComplete="password"
                          placeholder="********"
                          placeholderTextColor={colors.inputPlaceholder}
                          secureTextEntry={!showPassword}
                          style={styles.input}
                        />
                        <Pressable
                          onPress={() => setShowPassword((current) => !current)}
                          hitSlop={12}
                          style={styles.iconButton}>
                          <MaterialCommunityIcons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color={colors.icon}
                          />
                        </Pressable>
                      </View>
                      {!!passwordError && <Text style={styles.inlineError}>{passwordError}</Text>}
                    </View>

                    {!!error && <Text style={styles.errorText}>{error}</Text>}

                    <Pressable
                      onPress={handleLogin}
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
                          <Text style={styles.primaryButtonText}>{t('login.submit')}</Text>
                          <MaterialCommunityIcons
                            name="arrow-right"
                            size={20}
                            color={colors.inverseText}
                          />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.loginHintCard}>
                      <View style={styles.loginHintIconWrap}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={styles.loginHintText}>{t('login.authHint')}</Text>
                    </View>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>{t('login.noAccount')}</Text>
                      <Pressable onPress={() => router.navigate('/register')}>
                        <Text style={styles.footerLink}>{t('login.joinNow')}</Text>
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
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    linkText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    inputShell: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    inputShellError: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    input: {
      flex: 1,
      color: colors.onSurface,
      fontSize: 15,
      fontWeight: '600',
      paddingVertical: 0,
    },
    iconButton: {
      padding: 4,
    },
    inlineError: {
      marginTop: 6,
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 4,
    },
    errorText: {
      marginTop: 14,
      color: colors.danger,
      fontSize: 13,
      fontWeight: '600',
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
    loginHintCard: {
      marginTop: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      backgroundColor: alpha(colors.primary, 0.06),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.12),
    },
    loginHintIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    loginHintText: {
      flex: 1,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
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
    previewFooter: {
      marginTop: 6,
      paddingTop: 10,
    },
    previewFooterText: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    gridWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
    },
  });
