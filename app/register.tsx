import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { ApiRequestError, register } from '@/lib/api/auth';
import { saveAuthSession } from '@/lib/auth-session';
import { getDeviceName } from '@/lib/device-name';
import { useAppLanguage } from '@/providers/language-provider';

const DEVICE_NAME = getDeviceName();

export default function RegisterScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.bottom);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

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

  const passwordMismatch = useMemo(() => {
    return Boolean(password && confirmPassword && password !== confirmPassword);
  }, [confirmPassword, password]);

  const passwordStrength = useMemo(() => {
    if (!password) return null;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 2) return { label: language === 'id' ? 'Lemah' : 'Weak', color: colors.danger, width: '33%' };
    if (score <= 4) return { label: language === 'id' ? 'Sedang' : 'Medium', color: colors.warning, width: '66%' };
    return { label: language === 'id' ? 'Kuat' : 'Strong', color: colors.secondary, width: '100%' };
  }, [password, language, colors]);

  const validateEmail = (value: string) => {
    if (!value.trim()) return t('register.error.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return t('register.error.emailInvalid');
    return '';
  };

  const handleRegister = async () => {
    const nextNameError = !name.trim() ? t('register.error.nameRequired') : '';
    const nextEmailError = validateEmail(email);
    const nextPasswordError = !password.trim() ? t('register.error.passwordRequired') : '';
    const nextConfirmError = password && confirmPassword && password !== confirmPassword ? t('register.error.mismatch') : '';
    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextNameError || nextEmailError || nextPasswordError || nextConfirmError) return;

    setLoading(true);
    setError('');

    try {
      const response = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        device_name: DEVICE_NAME,
      });
      await saveAuthSession(response.Data);
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(t('register.error.generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.glowTop} />
        <View style={styles.glowRight} />

        <KeyboardAvoidingView
          style={styles.keyboardShell}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.container}>
              <View style={[styles.grid, isWide && styles.gridWide]}>
                <View style={[styles.heroColumn, isWide && styles.heroColumnWide]}>
                  <View style={styles.heroBadge}>
                    <MaterialCommunityIcons name="star-outline" size={14} color={colors.primary} />
                    <Text style={styles.heroBadgeText}>{t('register.heroBadge')}</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    {t('register.heroTitleLead')}
                    {'\n'}
                    <Text style={styles.heroAccent}>{t('register.heroTitleAccent')}</Text>{' '}
                    {t('register.heroTitleTail')}
                  </Text>

                  <Text style={styles.heroBody}>{t('register.heroBody')}</Text>

                  <View style={styles.quoteCard}>
                    <View style={styles.quoteHeader}>
                      <View style={styles.quoteAvatar}>
                        <MaterialCommunityIcons
                          name="account-tie"
                          size={18}
                          color={colors.inverseText}
                        />
                      </View>
                      <View>
                        <Text style={styles.quoteName}>Marcus Chen</Text>
                        <Text style={styles.quoteRole}>{t('register.quoteRole')}</Text>
                      </View>
                    </View>

                    <Text style={styles.quoteText}>{t('register.quoteText')}</Text>
                  </View>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>Finance-GO</Text>
                        <Text style={styles.formTitle}>{t('register.title')}</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons
                          name="account-plus"
                          size={18}
                          color={colors.inverseText}
                        />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>{t('register.subtitle')}</Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('register.fullName')}</Text>
                      <View style={[styles.inputShell, !!nameError && styles.inputShellError]}>
                        <MaterialCommunityIcons
                          name="account-outline"
                          size={18}
                          color={nameError ? colors.danger : colors.icon}
                        />
                        <TextInput
                          value={name}
                          onChangeText={(v) => { setName(v); setNameError(''); }}
                          autoCapitalize="words"
                          autoComplete="name"
                          placeholder="Name"
                          placeholderTextColor={colors.inputPlaceholder}
                          style={styles.input}
                        />
                      </View>
                      {!!nameError && <Text style={styles.inlineError}>{nameError}</Text>}
                    </View>

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

                    <View style={styles.passwordGrid}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('login.password')}</Text>
                        <View style={[styles.inputShell, !!passwordError && styles.inputShellError]}>
                          <MaterialCommunityIcons
                            name="lock-outline"
                            size={18}
                            color={passwordError ? colors.danger : colors.icon}
                          />
                          <TextInput
                            value={password}
                            onChangeText={(v) => { setPassword(v); setPasswordError(''); }}
                            autoComplete="new-password"
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
                        {passwordStrength && (
                          <View style={styles.strengthSection}>
                            <View style={styles.strengthTrack}>
                              <View style={[styles.strengthFill, { width: passwordStrength.width as any, backgroundColor: passwordStrength.color }]} />
                            </View>
                            <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>{passwordStrength.label}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('register.confirmPassword')}</Text>
                        <View
                          style={[
                            styles.inputShell,
                            (passwordMismatch || !!confirmError) && styles.inputShellError,
                          ]}>
                          <MaterialCommunityIcons
                            name="check-decagram-outline"
                            size={18}
                            color={(passwordMismatch || !!confirmError) ? colors.danger : colors.icon}
                          />
                          <TextInput
                            value={confirmPassword}
                            onChangeText={(v) => { setConfirmPassword(v); setConfirmError(''); }}
                            autoComplete="new-password"
                            placeholder="********"
                            placeholderTextColor={colors.inputPlaceholder}
                            secureTextEntry={!showPassword}
                            style={styles.input}
                          />
                        </View>
                        {!!confirmError && <Text style={styles.inlineError}>{confirmError}</Text>}
                        {passwordMismatch && <Text style={styles.inlineError}>{t('register.error.mismatch')}</Text>}
                      </View>
                    </View>

                    {!!error && <Text style={styles.errorText}>{error}</Text>}

                    <Pressable
                      onPress={handleRegister}
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
                          <Text style={styles.primaryButtonText}>{t('register.submit')}</Text>
                          <MaterialCommunityIcons
                            name="arrow-right"
                            size={20}
                            color={colors.inverseText}
                          />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>{t('register.alreadyMember')}</Text>
                      <Pressable onPress={() => router.navigate('/login')}>
                        <Text style={styles.footerLink}>{t('register.signIn')}</Text>
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
      maxWidth: 540,
    },
    glowTop: {
      position: 'absolute',
      top: -100,
      left: -40,
      width: 280,
      height: 280,
      borderRadius: 280,
      backgroundColor: colors.primaryGlow,
    },
    glowRight: {
      position: 'absolute',
      right: -90,
      bottom: 30,
      width: 250,
      height: 250,
      borderRadius: 250,
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
    passwordGrid: {
      gap: 0,
    },
    inlineError: {
      marginTop: 6,
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 4,
    },
    strengthSection: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    strengthTrack: {
      flex: 1,
      height: 4,
      borderRadius: 4,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    strengthFill: {
      height: '100%',
      borderRadius: 4,
    },
    strengthLabel: {
      fontSize: 11,
      fontWeight: '800',
    },
    helperText: {
      marginTop: 16,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    helperStrong: {
      color: colors.onSurface,
      fontWeight: '800',
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
    quoteCard: {
      marginTop: 28,
      maxWidth: 420,
      borderRadius: 24,
      backgroundColor: colors.primary,
      padding: 18,
      shadowColor: alpha(colors.primary, 0.18),
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
    },
    quoteHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    quoteAvatar: {
      width: 46,
      height: 46,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.heroOverlay,
    },
    quoteName: {
      color: colors.inverseText,
      fontSize: 15,
      fontWeight: '800',
    },
    quoteRole: {
      color: colors.inverseTextMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 2,
    },
    quoteText: {
      color: colors.inverseText,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      fontStyle: 'italic',
    },
    gridWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
    },
  });
