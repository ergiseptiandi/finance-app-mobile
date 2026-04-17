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

import { ApiRequestError, resetPassword } from '@/lib/api/auth';

export default function ResetPasswordScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
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
      <StatusBar barStyle="dark-content" />
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
                    <MaterialCommunityIcons name="shield-key-outline" size={14} color="#0057bd" />
                    <Text style={styles.heroBadgeText}>Finalize reset</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    Set a new{'\n'}
                    <Text style={styles.heroAccent}>secure password</Text>.
                  </Text>

                  <Text style={styles.heroBody}>
                    Paste the reset token from your inbox or from the development response, then set
                    a new password to complete recovery.
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
                        <MaterialCommunityIcons name="lock-reset" size={18} color="#f6f6ff" />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>
                      Enter your reset token and a new password to finish the recovery flow.
                    </Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Reset Token</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="key-outline" size={18} color="#6f768e" />
                        <TextInput
                          value={token}
                          onChangeText={setToken}
                          autoCapitalize="none"
                          placeholder="random_token_string..."
                          placeholderTextColor="#8f96ad"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>New Password</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="lock-outline" size={18} color="#6f768e" />
                        <TextInput
                          value={newPassword}
                          onChangeText={setNewPassword}
                          autoComplete="new-password"
                          placeholder="••••••••"
                          placeholderTextColor="#8f96ad"
                          secureTextEntry
                          style={styles.input}
                        />
                      </View>
                    </View>

                    {!!error && <Text style={styles.errorText}>{error}</Text>}

                    {!!success && (
                      <View style={styles.successBox}>
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#006947" />
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
                        <ActivityIndicator color="#f6f6ff" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>Reset Password</Text>
                          <MaterialCommunityIcons name="chevron-right" size={20} color="#f6f6ff" />
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f6ff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#f6f6ff',
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
    backgroundColor: 'rgba(110, 159, 255, 0.22)',
  },
  glowBottom: {
    position: 'absolute',
    right: -100,
    bottom: 50,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: 'rgba(107, 255, 143, 0.16)',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#060e20',
    shadowOpacity: 0.08,
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
    color: '#0057bd',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  formTitle: {
    marginTop: 6,
    color: '#272e42',
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
    backgroundColor: '#0057bd',
    shadowColor: '#0057bd',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  formSubtitle: {
    marginTop: 12,
    color: '#535b71',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  fieldGroup: {
    marginTop: 18,
  },
  fieldLabel: {
    color: '#535b71',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  inputShell: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: '#eef0ff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.95)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    color: '#272e42',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  errorText: {
    marginTop: 14,
    color: '#b31b25',
    fontSize: 13,
    fontWeight: '600',
  },
  successBox: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(107, 255, 143, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 105, 71, 0.16)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  successText: {
    flex: 1,
    color: '#006947',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 20,
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: '#0057bd',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#0057bd',
    shadowOpacity: 0.26,
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
    color: '#f6f6ff',
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
    color: '#535b71',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLink: {
    color: '#006947',
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
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.78)',
  },
  heroBadgeText: {
    color: '#0057bd',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroTitle: {
    marginTop: 22,
    color: '#272e42',
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '900',
    letterSpacing: -2,
  },
  heroAccent: {
    color: '#0057bd',
    fontStyle: 'italic',
  },
  heroBody: {
    marginTop: 20,
    maxWidth: 460,
    color: '#535b71',
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
