import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ApiRequestError, login } from '@/lib/api/auth';

const DEVICE_NAME =
  Platform.select({
    android: 'Pulse Auth Android',
    default: 'Pulse Auth Android',
  }) ?? 'Pulse Auth Android';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email dan password wajib diisi.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login({
        email: email.trim(),
        password,
        device_name: DEVICE_NAME,
      });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Gagal login. Coba lagi.');
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
                    <MaterialCommunityIcons name="shield-check-outline" size={14} color="#0057bd" />
                    <Text style={styles.heroBadgeText}>Secure access</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    Master your{'\n'}
                    <Text style={styles.heroAccent}>financial</Text> flow.
                  </Text>

                  <Text style={styles.heroBody}>
                    The Ledger combines precision data with editorial elegance. Secure your future
                    with the kinetic pulse of modern fintech.
                  </Text>

                  <View style={styles.previewCard}>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDot} />
                      <Text style={styles.previewLabel}>Refresh tokens</Text>
                      <Text style={styles.previewValue}>Rolling</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <View style={styles.previewDotSecondary} />
                      <Text style={styles.previewLabel}>Device tracking</Text>
                      <Text style={styles.previewValue}>Enabled</Text>
                    </View>
                    <View style={styles.previewFooter}>
                      <Text style={styles.previewFooterText}>Built for the `/v1/auth` flow.</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>Pulse Auth</Text>
                        <Text style={styles.formTitle}>Welcome Back</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons name="pulse" size={18} color="#f6f6ff" />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>
                      Please enter your details to access The Ledger.
                    </Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Email Address</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="email-outline" size={18} color="#6f768e" />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          placeholder="name@company.com"
                          placeholderTextColor="#8f96ad"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <View style={styles.labelRow}>
                        <Text style={styles.fieldLabel}>Password</Text>
                        <Pressable onPress={() => Alert.alert('Forgot Password', 'Flow reset password bisa dibuat setelah UI ini.')} hitSlop={12}>
                          <Text style={styles.linkText}>Forgot Password?</Text>
                        </Pressable>
                      </View>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="lock-outline" size={18} color="#6f768e" />
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          autoComplete="password"
                          placeholder="••••••••"
                          placeholderTextColor="#8f96ad"
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
                            color="#6f768e"
                          />
                        </Pressable>
                      </View>
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
                        <ActivityIndicator color="#f6f6ff" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>Login</Text>
                          <MaterialCommunityIcons name="arrow-right" size={20} color="#f6f6ff" />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.inlineDivider}>
                      <View style={styles.inlineDividerLine} />
                      <Text style={styles.inlineDividerText}>No social login</Text>
                      <View style={styles.inlineDividerLine} />
                    </View>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>Don&apos;t have an account?</Text>
                      <Pressable onPress={() => router.push('/register')}>
                        <Text style={styles.footerLink}>Join Now</Text>
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
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(110, 159, 255, 0.22)',
  },
  glowBottom: {
    position: 'absolute',
    left: -100,
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  linkText: {
    color: '#0057bd',
    fontSize: 12,
    fontWeight: '700',
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
  iconButton: {
    padding: 4,
  },
  errorText: {
    marginTop: 14,
    color: '#b31b25',
    fontSize: 13,
    fontWeight: '600',
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
  inlineDivider: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d9e2ff',
  },
  inlineDividerText: {
    color: '#a5adc6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
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
  previewCard: {
    marginTop: 28,
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.78)',
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
    backgroundColor: '#0057bd',
  },
  previewDotSecondary: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: '#006947',
  },
  previewLabel: {
    flex: 1,
    color: '#535b71',
    fontSize: 14,
    fontWeight: '600',
  },
  previewValue: {
    color: '#272e42',
    fontSize: 14,
    fontWeight: '800',
  },
  previewFooter: {
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(209, 220, 255, 0.8)',
  },
  previewFooterText: {
    color: '#535b71',
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
