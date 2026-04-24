import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { ApiRequestError, changePassword } from '@/lib/api/auth';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { useAppLanguage } from '@/providers/language-provider';
import { useAppTheme } from '@/providers/theme-provider';

export default function ChangePasswordScreen() {
  const { colorScheme } = useAppTheme();
  const { t } = useAppLanguage();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top, insets.bottom);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [secureOld, setSecureOld] = useState(true);
  const [secureNew, setSecureNew] = useState(true);
  const [secureConfirm, setSecureConfirm] = useState(true);

  const passwordMismatch = useMemo(
    () => Boolean(newPassword && confirmPassword && newPassword !== confirmPassword),
    [confirmPassword, newPassword]
  );

  const handleSubmit = useCallback(async () => {
    if (loading) {
      return;
    }

    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError(t('changePassword.error.required'));
      return;
    }

    if (passwordMismatch) {
      setError(t('changePassword.error.mismatch'));
      return;
    }

    if (newPassword.trim().length < 8) {
      setError(t('changePassword.error.minLength'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const session = await getAuthSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const payload = {
        old_password: oldPassword,
        new_password: newPassword,
      };

      try {
        await changePassword(session.token.access_token, payload);
      } catch (changeError) {
        if (changeError instanceof ApiRequestError && changeError.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (!refreshed) {
            throw changeError;
          }
          await changePassword(refreshed.token.access_token, payload);
        } else {
          throw changeError;
        }
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(t('changePassword.success'));
    } catch (submitError) {
      if (submitError instanceof ApiRequestError) {
        setError(submitError.message || t('changePassword.error.generic'));
      } else {
        setError(t('changePassword.error.generic'));
      }
    } finally {
      setLoading(false);
    }
  }, [confirmPassword, loading, newPassword, oldPassword, passwordMismatch, t]);

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.shellTextPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>{t('changePassword.title')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="shield-key-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>{t('changePassword.heroTitle')}</Text>
            <Text style={styles.heroBody}>{t('changePassword.heroBody')}</Text>
          </View>

          <View style={styles.formCard}>
            <PasswordField
              colors={colors}
              styles={styles}
              label={t('changePassword.currentPassword')}
              value={oldPassword}
              onChangeText={setOldPassword}
              secure={secureOld}
              onToggleSecure={() => setSecureOld((current) => !current)}
              autoComplete="current-password"
            />

            <PasswordField
              colors={colors}
              styles={styles}
              label={t('changePassword.newPassword')}
              value={newPassword}
              onChangeText={setNewPassword}
              secure={secureNew}
              onToggleSecure={() => setSecureNew((current) => !current)}
              autoComplete="new-password"
            />

            <PasswordField
              colors={colors}
              styles={styles}
              label={t('changePassword.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secure={secureConfirm}
              onToggleSecure={() => setSecureConfirm((current) => !current)}
              autoComplete="new-password"
              error={passwordMismatch}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {success ? (
              <View style={styles.successBox}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.success} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !loading && styles.primaryButtonPressed,
                loading && styles.primaryButtonDisabled,
              ]}>
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{t('changePassword.submit')}</Text>
                  <MaterialCommunityIcons name="lock-check-outline" size={20} color={colors.onPrimary} />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

type PasswordFieldProps = {
  colors: AppColorTheme;
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure: boolean;
  onToggleSecure: () => void;
  autoComplete: 'current-password' | 'new-password';
  error?: boolean;
};

function PasswordField({
  colors,
  styles,
  label,
  value,
  onChangeText,
  secure,
  onToggleSecure,
  autoComplete,
  error = false,
}: PasswordFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, error && styles.inputShellError]}>
        <MaterialCommunityIcons name="lock-outline" size={18} color={colors.icon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoComplete={autoComplete}
          placeholder="********"
          placeholderTextColor={colors.shellTextMuted}
          secureTextEntry={secure}
          style={styles.input}
        />
        <Pressable onPress={onToggleSecure} hitSlop={10}>
          <MaterialCommunityIcons
            name={secure ? 'eye-outline' : 'eye-off-outline'}
            size={18}
            color={colors.icon}
          />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    keyboardShell: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 14, 28),
      paddingBottom: Math.max(bottomInset + 28, 56),
      gap: 18,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: colors.shellTextPrimary,
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    headerSpacer: {
      width: 44,
    },
    heroCard: {
      borderRadius: 26,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 20,
      gap: 12,
    },
    heroIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor: alpha(colors.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      color: colors.shellTextPrimary,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    heroBody: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
    formCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 16,
      gap: 14,
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    inputShell: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inputShellError: {
      borderColor: colors.danger,
    },
    input: {
      flex: 1,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '700',
      paddingVertical: 0,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    successBox: {
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: alpha(colors.success, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.success, 0.18),
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    successText: {
      flex: 1,
      color: colors.success,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primaryButtonPressed: {
      opacity: 0.92,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontWeight: '900',
    },
  });
