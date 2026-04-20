import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

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
  const { t } = useAppLanguage();
  const styles = createStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordMismatch = useMemo(() => {
    return Boolean(password && confirmPassword && password !== confirmPassword);
  }, [confirmPassword, password]);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError(t('register.error.required'));
      return;
    }

    if (passwordMismatch) {
      setError(t('register.error.mismatch'));
      return;
    }

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
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={styles.screen}>
        <View style={styles.glowTop} />
        <View style={styles.glowRight} />

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
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons
                          name="account-outline"
                          size={18}
                          color={colors.icon}
                        />
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          autoCapitalize="words"
                          autoComplete="name"
                          placeholder="Name"
                          placeholderTextColor={colors.inputPlaceholder}
                          style={styles.input}
                        />
                      </View>
                    </View>

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

                    <View style={styles.passwordGrid}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('login.password')}</Text>
                        <View style={styles.inputShell}>
                          <MaterialCommunityIcons
                            name="lock-outline"
                            size={18}
                            color={colors.icon}
                          />
                          <TextInput
                            value={password}
                            onChangeText={setPassword}
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
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('register.confirmPassword')}</Text>
                        <View
                          style={[
                            styles.inputShell,
                            passwordMismatch && styles.inputShellError,
                          ]}>
                          <MaterialCommunityIcons
                            name="check-decagram-outline"
                            size={18}
                            color={colors.icon}
                          />
                          <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            autoComplete="new-password"
                            placeholder="********"
                            placeholderTextColor={colors.inputPlaceholder}
                            secureTextEntry={!showPassword}
                            style={styles.input}
                          />
                        </View>
                      </View>
                    </View>

                    <Text style={styles.helperText}>
                      {t('register.helperDeviceTracking', { device: DEVICE_NAME })}
                    </Text>

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
                      <Pressable onPress={() => router.replace('/login')}>
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

const createStyles = (colors: AppColorTheme) =>
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
      paddingVertical: 24,
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
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    inputShellError: {
      backgroundColor: colors.dangerSoft,
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
