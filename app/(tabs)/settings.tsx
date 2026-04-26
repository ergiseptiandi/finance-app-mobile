import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useAppLanguage } from '@/providers/language-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';
import {
  clearBiometricCredentials,
  getBiometricState,
  saveBiometricCredentials,
} from '@/lib/biometric-auth';
import { ApiRequestError, login } from '@/lib/api/auth';
import { getAuthSession, refreshStoredAuthSession, saveAuthSession } from '@/lib/auth-session';
import { getDeviceName } from '@/lib/device-name';
import { loadUnreadNotificationCount } from '@/lib/notification-unread-count';

const DEVICE_NAME = getDeviceName();

type SettingsRowProps = {
  colors: AppColorTheme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  iconTone?: 'primary' | 'secondary' | 'muted';
  accent?: boolean;
  rightSlot?: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
};

function SettingsRow({
  colors,
  icon,
  title,
  subtitle,
  iconTone = 'muted',
  accent = false,
  rightSlot,
  style,
  onPress,
}: SettingsRowProps) {
  const iconColor =
    iconTone === 'primary' ? colors.primary : iconTone === 'secondary' ? colors.secondary : colors.icon;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[settingsRowStyles(colors).row, accent && settingsRowStyles(colors).rowAccent, style]}>
      <View style={settingsRowStyles(colors).left}>
        <View style={settingsRowStyles(colors).iconWrap}>
          <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
        </View>
        <View style={settingsRowStyles(colors).copy}>
          <Text style={settingsRowStyles(colors).title}>{title}</Text>
          <Text style={settingsRowStyles(colors).subtitle}>{subtitle}</Text>
        </View>
      </View>
      {rightSlot}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colorScheme, setColorScheme } = useAppTheme();
  const { language, setLanguage, t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);
  const [displayName, setDisplayName] = useState('Alex Sterling');
  const [email, setEmail] = useState('alex.sterling@ledger.io');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [biometricSaving, setBiometricSaving] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [biometricSetupOpen, setBiometricSetupOpen] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const refreshUnreadNotificationCount = useCallback(async (accessToken: string) => {
    try {
      setUnreadNotificationCount(await loadUnreadNotificationCount(accessToken));
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        const refreshed = await refreshStoredAuthSession();
        if (refreshed) {
          setUnreadNotificationCount(await loadUnreadNotificationCount(refreshed.token.access_token));
          return;
        }
      }

      setUnreadNotificationCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadSessionAndBiometrics = async () => {
        const session = await getAuthSession();
        if (!session || !active) {
          setBiometricLoading(false);
          return;
        }

        setDisplayName(session.user.name || 'Alex Sterling');
        setEmail(session.user.email || 'alex.sterling@ledger.io');
        void refreshUnreadNotificationCount(session.token.access_token);
        setBiometricLoading(true);
        setBiometricError('');

        try {
          const biometricState = await getBiometricState();

          if (!active) {
            return;
          }

          setBiometricEnabled(biometricState.enabled);
          setBiometricAvailable(biometricState.available);
        } catch {
          if (active) {
            setBiometricError(t('settings.biometricsLoadError'));
          }
        } finally {
          if (active) {
            setBiometricLoading(false);
          }
        }
      };

      void loadSessionAndBiometrics();

      return () => {
        active = false;
      };
    }, [refreshUnreadNotificationCount, t])
  );

  const handleDisableBiometric = useCallback(async () => {
    if (biometricSaving || biometricLoading) {
      return;
    }

    setBiometricSaving(true);
    setBiometricError('');

    try {
      await clearBiometricCredentials();
      setBiometricEnabled(false);
      setBiometricSetupOpen(false);
      setBiometricPassword('');
    } finally {
      setBiometricSaving(false);
    }
  }, [biometricLoading, biometricSaving]);

  const handleEnableBiometric = useCallback(async () => {
    if (biometricSaving || biometricLoading) {
      return;
    }

    const session = await getAuthSession();

    if (!session?.user.email) {
      setBiometricError(t('settings.biometricsSessionMissing'));
      return;
    }

    if (!biometricPassword.trim()) {
      setBiometricError(t('settings.biometricsPasswordRequired'));
      return;
    }

    setBiometricSaving(true);
    setBiometricError('');

    try {
      const response = await login({
        email: session.user.email.trim(),
        password: biometricPassword,
        device_name: DEVICE_NAME,
      });

      await saveAuthSession(response.Data);
      await saveBiometricCredentials(response.Data.token.refresh_token);
      setBiometricEnabled(true);
      setBiometricSetupOpen(false);
      setBiometricPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBiometricError(message || t('settings.biometricsSaveError'));
    } finally {
      setBiometricSaving(false);
    }
  }, [biometricLoading, biometricPassword, biometricSaving, t]);

  const handleToggleBiometric = useCallback(async () => {
    if (biometricLoading || biometricSaving) {
      return;
    }

    setBiometricError('');

    if (biometricEnabled) {
      await handleDisableBiometric();
      return;
    }

    if (!biometricAvailable) {
      setBiometricError(t('settings.biometricsUnavailable'));
      return;
    }

    setBiometricSetupOpen(true);
    setBiometricPassword('');
  }, [biometricAvailable, biometricEnabled, biometricLoading, biometricSaving, handleDisableBiometric, t]);

  const initials = useMemo(() => {
    return displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [displayName]);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroGrid}>
          <View style={styles.profileCard}>
            <View style={styles.avatarShell}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarCore}>
                  <Text style={styles.avatarText}>{initials || 'AS'}</Text>
                </View>
              </View>
              <Pressable style={styles.editBadge}>
                <MaterialCommunityIcons name="pencil" size={14} color={colors.onPrimary} />
              </Pressable>
            </View>

            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.profileName}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={styles.profileEmail}>
                {email}
              </Text>
            </View>
          </View>

        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.securityPrivacy')}</Text>
          <View style={styles.gridTwo}>
            <SettingsRow
              colors={colors}
              icon="lock-reset"
              title={t('settings.changePassword')}
              subtitle={t('settings.changePasswordMeta')}
              iconTone="primary"
              onPress={() => router.push('/change-password')}
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={22} color={colors.outlineVariant} />}
            />

            <SettingsRow
              colors={colors}
              icon="fingerprint"
              title={t('settings.biometrics')}
              subtitle={biometricAvailable ? t('settings.biometricsMeta') : t('settings.biometricsUnavailable')}
              iconTone="secondary"
              rightSlot={
                <Pressable
                  onPress={() => void handleToggleBiometric()}
                  disabled={biometricLoading || biometricSaving}
                  style={[
                    styles.switchTrack,
                    biometricEnabled && styles.switchTrackActive,
                    (biometricLoading || biometricSaving) && styles.switchTrackDisabled,
                  ]}>
                  <View style={[styles.switchThumb, biometricEnabled && styles.switchThumbActive]} />
                </Pressable>
              }
            />
            {biometricSetupOpen ? (
              <View style={styles.biometricSetupCard}>
                <Text style={styles.biometricSetupTitle}>{t('settings.biometricsSetupTitle')}</Text>
                <Text style={styles.biometricSetupBody}>{t('settings.biometricsSetupBody')}</Text>
                <View style={styles.biometricInputShell}>
                  <MaterialCommunityIcons name="lock-outline" size={18} color={colors.icon} />
                  <TextInput
                    value={biometricPassword}
                    onChangeText={setBiometricPassword}
                    placeholder={t('settings.biometricsPassword')}
                    placeholderTextColor={colors.shellTextMuted}
                    secureTextEntry
                    style={styles.biometricInput}
                  />
                </View>
                {!!biometricError ? <Text style={styles.biometricErrorText}>{biometricError}</Text> : null}
                <View style={styles.biometricActions}>
                  <Pressable
                    onPress={() => {
                      setBiometricSetupOpen(false);
                      setBiometricPassword('');
                      setBiometricError('');
                    }}
                    style={styles.biometricSecondaryButton}>
                    <Text style={styles.biometricSecondaryButtonText}>{t('settings.biometricsCancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleEnableBiometric()}
                    disabled={biometricSaving}
                    style={({ pressed }) => [
                      styles.biometricPrimaryButton,
                      pressed && !biometricSaving && styles.biometricPrimaryButtonPressed,
                      biometricSaving && styles.biometricPrimaryButtonDisabled,
                    ]}>
                    <Text style={styles.biometricPrimaryButtonText}>{t('settings.biometricsEnable')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
          <View style={styles.preferenceBlock}>
            <SettingsRow
              colors={colors}
              icon="translate"
              title={t('settings.language')}
              subtitle=""
              rightSlot={
                <View style={styles.appearanceSegment}>
                  <Pressable
                    onPress={() => setLanguage('id')}
                    style={[styles.appearancePill, language === 'id' && styles.appearancePillActive]}>
                    <Text style={[styles.appearanceText, language === 'id' && styles.appearanceTextActive]}>
                      ID
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLanguage('en-US')}
                    style={[styles.appearancePill, language === 'en-US' && styles.appearancePillActive]}>
                    <Text
                      numberOfLines={1}
                      style={[styles.appearanceText, language === 'en-US' && styles.appearanceTextActive]}>
                      EN
                    </Text>
                  </Pressable>
                </View>
              }
              style={styles.preferenceRow}
            />

            <View style={styles.rowDivider} />

            <SettingsRow
              colors={colors}
              icon="weather-night"
              title={t('settings.appearance')}
              subtitle=""
              rightSlot={
                <View style={styles.appearanceSegment}>
                  <Pressable
                    onPress={() => setColorScheme('light')}
                    style={[styles.appearancePill, colorScheme === 'light' && styles.appearancePillActive]}>
                    <Text style={[styles.appearanceText, colorScheme === 'light' && styles.appearanceTextActive]}>
                      {t('common.light')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setColorScheme('dark')}
                    style={[styles.appearancePill, colorScheme === 'dark' && styles.appearancePillActive]}>
                    <Text style={[styles.appearanceText, colorScheme === 'dark' && styles.appearanceTextActive]}>
                      {t('common.dark')}
                    </Text>
                  </Pressable>
                </View>
              }
              style={styles.preferenceRow}
            />

            <View style={styles.rowDivider} />

            <SettingsRow
              colors={colors}
              icon="shape-outline"
              title={t('settings.categories')}
              subtitle={t('settings.categoriesMeta')}
              onPress={() => router.push('/categories')}
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />}
              style={styles.preferenceRow}
            />

            <View style={styles.rowDivider} />

            <SettingsRow
              colors={colors}
              icon="wallet-outline"
              title={t('settings.wallets')}
              subtitle={t('settings.walletsMeta')}
              iconTone="primary"
              onPress={() => router.push('/wallets')}
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />}
              style={styles.preferenceRow}
            />
          </View>
        </View>

<View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
          <SettingsRow
            colors={colors}
            icon="bell-ring-outline"
            title={t('settings.notifications')}
            subtitle="Kelola suara, pengingat, dan notifikasi"
            iconTone="primary"
            onPress={() => {
              showTransitionOverlay();
              requestAnimationFrame(() => {
                router.push('/notification-settings');
              });
            }}
            rightSlot={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />}
            style={styles.notificationInboxRow}
          />
          <SettingsRow
            colors={colors}
            icon="inbox-outline"
            title={t('settings.notificationInbox')}
            subtitle={t('settings.notificationInboxMeta')}
            iconTone="primary"
            onPress={() => {
              showTransitionOverlay();
              requestAnimationFrame(() => {
                router.push('/notifications');
              });
            }}
            rightSlot={
              <View style={styles.notificationInboxRightSlot}>
                {unreadNotificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
              </View>
            }
          />
</View>

        <View style={styles.logoutWrap}>
          <Pressable
            style={[styles.logoutButton, signingOut && styles.logoutButtonDisabled]}
            disabled={signingOut}
            onPress={async () => {
              setSigningOut(true);
              showTransitionOverlay();
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              router.replace('/logout');
            }}>
            <MaterialCommunityIcons name="logout" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>

    </View>
  );
}

const settingsRowStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    row: {
      flex: 1,
      minHeight: 86,
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
    },
    rowAccent: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 14,
    },
    left: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
  });

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 14, 28),
      paddingBottom: 150,
      gap: 22,
    },
    heroGrid: {
      gap: 18,
    },
    profileCard: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 20,
      paddingVertical: 28,
      alignItems: 'center',
      gap: 20,
    },
    avatarShell: {
      position: 'relative',
      width: 108,
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 28,
      backgroundColor: colors.shellCardStrong,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.18),
    },
    avatarCore: {
      width: 82,
      height: 82,
      borderRadius: 22,
      backgroundColor: alpha(colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.primary,
      fontSize: 32,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    editBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileCopy: {
      alignItems: 'center',
      gap: 6,
      width: '100%',
    },
    profileName: {
      color: colors.shellTextPrimary,
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '900',
      letterSpacing: -1,
    },
    profileEmail: {
      color: colors.shellTextMuted,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      color: colors.primary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      paddingHorizontal: 8,
    },
    gridTwo: {
      gap: 12,
    },
    preferenceBlock: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      overflow: 'hidden',
    },
    preferenceRow: {
      minHeight: 76,
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.shellBorder,
      marginHorizontal: 18,
    },
    rowValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    rowValue: {
      color: colors.primary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    appearanceSegment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.shellCardMuted,
      borderRadius: 18,
      padding: 4,
    },
    appearancePill: {
      minWidth: 50,
      minHeight: 28,
      paddingHorizontal: 12,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appearancePillActive: {
      backgroundColor: colors.primary,
    },
    appearanceText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
    },
    appearanceTextActive: {
      color: colors.onPrimary,
    },
    switchTrack: {
      width: 44,
      height: 24,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      padding: 3,
      justifyContent: 'center',
    },
    switchTrackActive: {
      backgroundColor: alpha(colors.secondary, 0.28),
    },
    switchTrackPrimary: {
      backgroundColor: alpha(colors.primary, 0.28),
    },
    switchTrackDisabled: {
      opacity: 0.5,
    },
    switchThumb: {
      width: 18,
      height: 18,
      borderRadius: 10,
      backgroundColor: colors.outlineVariant,
    },
    switchThumbActive: {
      alignSelf: 'flex-end',
      backgroundColor: colors.secondaryAccent,
    },
    switchThumbPrimary: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primaryContainer,
    },
    biometricSetupCard: {
      marginTop: 12,
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 16,
      gap: 12,
    },
    biometricSetupTitle: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    biometricSetupBody: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    biometricInputShell: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    biometricInput: {
      flex: 1,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 0,
    },
    biometricErrorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    biometricActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
    },
    biometricSecondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    biometricSecondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    biometricPrimaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    biometricPrimaryButtonPressed: {
      opacity: 0.92,
    },
    biometricPrimaryButtonDisabled: {
      opacity: 0.7,
    },
    biometricPrimaryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    notificationInboxRow: {
      marginBottom: 12,
    },
    notificationInboxRightSlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    notificationBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 999,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
    },
    notificationBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '900',
    },
    logoutWrap: {
      paddingTop: 8,
      alignItems: 'center',
    },
    logoutButton: {
      minHeight: 56,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.32),
      backgroundColor: alpha(colors.danger, 0.1),
      paddingHorizontal: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    logoutButtonDisabled: {
      opacity: 0.72,
    },
    logoutText: {
      color: colors.danger,
      fontSize: 15,
      fontWeight: '800',
    },
  });
