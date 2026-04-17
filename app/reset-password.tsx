import { useEffect, useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError, resetPassword } from '@/lib/api/auth';

export default function ResetPasswordScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const styles = createStyles(colors);
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (typeof params.token === 'string' && params.token.trim()) {
      setToken(params.token.trim());
    }
  }, [params.token]);

  const handleSubmit = async () => {
    if (!token.trim() || !newPassword.trim()) {
      setError('Token dan password baru wajib diisi.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await resetPassword({
        token: token.trim(),
        new_password: newPassword,
      });
      setSuccess('Password berhasil direset. Silakan login kembali.');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Gagal reset password. Coba lagi.');
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
                      name="shield-key-outline"
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={styles.heroBadgeText}>Finalize reset</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    Set a new{'\n'}
                    <Text style={styles.heroAccent}>secure password</Text>.
                  </Text>

                  <Text style={styles.heroBody}>
                    Paste the reset token from your inbox or from the development response, then
                    set a new password to complete recovery.
                  </Text>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>Pulse Auth</Text>
                        <Text style={styles.formTitle}>Reset Security</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons
                          name="lock-reset"
                          size={18}
                          color={colors.inverseText}
                        />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>
                      Enter your reset token and a new password to finish the recovery flow.
                    </Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Reset Token</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="key-outline" size={18} color={colors.icon} />
                        <TextInput
                          value={token}
                          onChangeText={setToken}
                          autoCapitalize="none"
                          placeholder="random_token_string..."
                          placeholderTextColor={colors.inputPlaceholder}
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>New Password</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons
                          name="lock-outline"
                          size={18}
                          color={colors.icon}
                        />
                        <TextInput
                          value={newPassword}
                          onChangeText={setNewPassword}
                          autoComplete="new-password"
                          placeholder="********"
                          placeholderTextColor={colors.inputPlaceholder}
                          secureTextEntry
                          style={styles.input}
                        />
                      </View>
                    </View>

                    {!!error && <Text style={styles.errorText}>{error}</Text>}

                    {!!success && (
                      <View style={styles.successBox}>
                        <MaterialCommunityIcons
                          name="check-circle-outline"
                          size={18}
                          color={colors.success}
                        />
                        <Text style={styles.successText}>{success}</Text>
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
                          <Text style={styles.primaryButtonText}>Reset Password</Text>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={20}
                            color={colors.inverseText}
                          />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>Back to login?</Text>
                      <Pressable onPress={() => router.replace('/login')}>
                        <Text style={styles.footerLink}>Sign In</Text>
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
      maxWidth: 520,
    },
    glowTop: {
      position: 'absolute',
      top: -80,
      left: -80,
      width: 260,
      height: 260,
      borderRadius: 260,
      backgroundColor: colors.primaryGlow,
    },
    glowBottom: {
      position: 'absolute',
      right: -100,
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
    gridWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
    },
  });
