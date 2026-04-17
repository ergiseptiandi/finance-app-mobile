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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ApiRequestError, register } from '@/lib/api/auth';
import { saveAuthSession } from '@/lib/auth-session';

const DEVICE_NAME =
  Platform.select({
    android: 'Pulse Auth Android',
    default: 'Pulse Auth Android',
  }) ?? 'Pulse Auth Android';

export default function RegisterScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
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
      setError('Nama, email, dan password wajib diisi.');
      return;
    }

    if (passwordMismatch) {
      setError('Password dan konfirmasi password tidak sama.');
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
        setError('Gagal register. Coba lagi.');
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
                    <MaterialCommunityIcons name="sparkles" size={14} color="#0057bd" />
                    <Text style={styles.heroBadgeText}>Join now</Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    The future of{'\n'}
                    <Text style={styles.heroAccent}>digital assets</Text>{' '}
                    starts here.
                  </Text>

                  <Text style={styles.heroBody}>
                    Join over 2 million users managing their wealth with the precision of a ledger
                    and the speed of light.
                  </Text>

                  <View style={styles.quoteCard}>
                    <View style={styles.quoteHeader}>
                      <View style={styles.quoteAvatar}>
                        <MaterialCommunityIcons name="account-tie" size={18} color="#f6f6ff" />
                      </View>
                      <View>
                        <Text style={styles.quoteName}>Marcus Chen</Text>
                        <Text style={styles.quoteRole}>CTO, Vertex Capital</Text>
                      </View>
                    </View>

                    <Text style={styles.quoteText}>
                      &quot;The Ledger transformed our institutional reporting from a weekly chore
                      into a real-time strategic pulse.&quot;
                    </Text>
                  </View>
                </View>

                <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                  <View style={styles.formCard}>
                    <View style={styles.brandRow}>
                      <View>
                        <Text style={styles.brandKicker}>Pulse Auth</Text>
                        <Text style={styles.formTitle}>Create Account</Text>
                      </View>
                      <View style={styles.brandMark}>
                        <MaterialCommunityIcons name="account-plus" size={18} color="#f6f6ff" />
                      </View>
                    </View>

                    <Text style={styles.formSubtitle}>
                      Welcome to the inner circle of Kinetic Pulse.
                    </Text>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Full Name</Text>
                      <View style={styles.inputShell}>
                        <MaterialCommunityIcons name="account-outline" size={18} color="#6f768e" />
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          autoCapitalize="words"
                          autoComplete="name"
                          placeholder="John Doe"
                          placeholderTextColor="#8f96ad"
                          style={styles.input}
                        />
                      </View>
                    </View>

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
                          placeholder="john@theledger.com"
                          placeholderTextColor="#8f96ad"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={styles.passwordGrid}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Password</Text>
                        <View style={styles.inputShell}>
                          <MaterialCommunityIcons name="lock-outline" size={18} color="#6f768e" />
                          <TextInput
                            value={password}
                            onChangeText={setPassword}
                            autoComplete="new-password"
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

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Confirm Password</Text>
                        <View
                          style={[
                            styles.inputShell,
                            passwordMismatch && styles.inputShellError,
                          ]}>
                          <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#6f768e" />
                          <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            placeholderTextColor="#8f96ad"
                            secureTextEntry={!showPassword}
                            style={styles.input}
                          />
                        </View>
                      </View>
                    </View>

                    <Text style={styles.helperText}>
                      Device tracking is sent automatically as <Text style={styles.helperStrong}>{DEVICE_NAME}</Text>.
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
                        <ActivityIndicator color="#f6f6ff" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>Register Account</Text>
                          <MaterialCommunityIcons name="arrow-right" size={20} color="#f6f6ff" />
                        </>
                      )}
                    </Pressable>

                    <View style={styles.footerRow}>
                      <Text style={styles.footerText}>Already a member?</Text>
                      <Pressable onPress={() => router.push('/login')}>
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
    maxWidth: 540,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: 'rgba(110, 159, 255, 0.20)',
  },
  glowRight: {
    position: 'absolute',
    right: -90,
    bottom: 30,
    width: 250,
    height: 250,
    borderRadius: 250,
    backgroundColor: 'rgba(107, 255, 143, 0.12)',
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
  inputShellError: {
    borderColor: '#fb5151',
    backgroundColor: '#fff5f5',
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
  passwordGrid: {
    gap: 0,
  },
  helperText: {
    marginTop: 16,
    color: '#535b71',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  helperStrong: {
    color: '#272e42',
    fontWeight: '800',
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
  quoteCard: {
    marginTop: 28,
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#0057bd',
    padding: 18,
    shadowColor: '#0057bd',
    shadowOpacity: 0.18,
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
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  quoteName: {
    color: '#f6f6ff',
    fontSize: 15,
    fontWeight: '800',
  },
  quoteRole: {
    color: 'rgba(246, 246, 255, 0.72)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  quoteText: {
    color: '#f6f6ff',
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
