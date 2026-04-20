import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingsData,
} from '@/lib/api/notifications';
import { getAuthSession } from '@/lib/auth-session';
import { getDevicePushToken } from '@/lib/push-notifications';

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

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsData = {
  enabled: false,
  daily_expense_reminder_enabled: false,
  daily_expense_reminder_time: '20:00',
  debt_payment_reminder_enabled: false,
  debt_payment_reminder_time: '09:00',
  debt_payment_reminder_days_before: 3,
  push_token: '',
};

const parseTimeValue = (value: string) => {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  const nextDate = new Date();

  nextDate.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return nextDate;
};

const formatTimeValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

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
  const colorScheme = useColorScheme() ?? 'light';
  const { setColorScheme } = useAppTheme();
  const { language, setLanguage, t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);
  const [displayName, setDisplayName] = useState('Alex Sterling');
  const [email, setEmail] = useState('alex.sterling@ledger.io');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [dailyExpenseReminderEnabled, setDailyExpenseReminderEnabled] = useState(false);
  const [debtPaymentReminderEnabled, setDebtPaymentReminderEnabled] = useState(false);
  const [dailyExpenseReminderTime, setDailyExpenseReminderTime] = useState('20:00');
  const [debtPaymentReminderTime, setDebtPaymentReminderTime] = useState('09:00');
  const [debtPaymentReminderDaysBefore, setDebtPaymentReminderDaysBefore] = useState(3);
  const [pushToken, setPushToken] = useState('');
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadSessionAndNotifications = async () => {
        const session = await getAuthSession();
        if (!session || !active) {
          setNotificationLoading(false);
          return;
        }

        setDisplayName(session.user.name || 'Alex Sterling');
        setEmail(session.user.email || 'alex.sterling@ledger.io');

        setNotificationLoading(true);
        setNotificationError('');

        try {
          const response = await getNotificationSettings(session.token.access_token);
          if (!active) {
            return;
          }

          const data = response.Data ?? DEFAULT_NOTIFICATION_SETTINGS;
          setPushEnabled(Boolean(data.enabled));
          setDailyExpenseReminderEnabled(Boolean(data.daily_expense_reminder_enabled));
          setDailyExpenseReminderTime(data.daily_expense_reminder_time ?? DEFAULT_NOTIFICATION_SETTINGS.daily_expense_reminder_time ?? '20:00');
          setDebtPaymentReminderEnabled(Boolean(data.debt_payment_reminder_enabled));
          setDebtPaymentReminderTime(data.debt_payment_reminder_time ?? DEFAULT_NOTIFICATION_SETTINGS.debt_payment_reminder_time ?? '09:00');
          setDebtPaymentReminderDaysBefore(Number(data.debt_payment_reminder_days_before ?? 3));
          setPushToken(data.push_token ?? '');
        } catch {
          if (active) {
            setNotificationError(t('settings.notificationsLoadError'));
          }
        } finally {
          if (active) {
            setNotificationLoading(false);
          }
        }
      };

      void loadSessionAndNotifications();

      return () => {
        active = false;
      };
    }, [t])
  );

  const persistNotificationSettings = useCallback(
    async (nextState: {
      enabled?: boolean;
      dailyExpenseReminderEnabled?: boolean;
      dailyExpenseReminderTime?: string;
      debtPaymentReminderEnabled?: boolean;
      debtPaymentReminderTime?: string;
      debtPaymentReminderDaysBefore?: number;
      pushToken?: string;
    }) => {
      const session = await getAuthSession();

      if (!session) {
        return false;
      }

      setNotificationSaving(true);
      setNotificationError('');
      setNotificationStatus('');

      const payload = {
        enabled: nextState.enabled ?? pushEnabled,
        daily_expense_reminder_enabled: nextState.dailyExpenseReminderEnabled ?? dailyExpenseReminderEnabled,
        daily_expense_reminder_time: nextState.dailyExpenseReminderTime ?? dailyExpenseReminderTime,
        debt_payment_reminder_enabled: nextState.debtPaymentReminderEnabled ?? debtPaymentReminderEnabled,
        debt_payment_reminder_time: nextState.debtPaymentReminderTime ?? debtPaymentReminderTime,
        debt_payment_reminder_days_before:
          nextState.debtPaymentReminderDaysBefore ?? debtPaymentReminderDaysBefore,
        push_token: nextState.pushToken ?? pushToken,
      };

      try {
        const response = await updateNotificationSettings(session.token.access_token, payload);
        const data = response.Data ?? DEFAULT_NOTIFICATION_SETTINGS;

        setPushEnabled(Boolean(data.enabled));
        setDailyExpenseReminderEnabled(Boolean(data.daily_expense_reminder_enabled));
        setDailyExpenseReminderTime(data.daily_expense_reminder_time ?? '20:00');
        setDebtPaymentReminderEnabled(Boolean(data.debt_payment_reminder_enabled));
        setDebtPaymentReminderTime(data.debt_payment_reminder_time ?? '09:00');
        setDebtPaymentReminderDaysBefore(Number(data.debt_payment_reminder_days_before ?? 3));
        setPushToken(data.push_token ?? '');
        setNotificationStatus(t('settings.notificationsSaved'));
        return true;
      } catch {
        setNotificationError(t('settings.notificationsSaveError'));
        return false;
      } finally {
        setNotificationSaving(false);
      }
    },
    [
      dailyExpenseReminderEnabled,
      dailyExpenseReminderTime,
      debtPaymentReminderDaysBefore,
      debtPaymentReminderEnabled,
      debtPaymentReminderTime,
      pushEnabled,
      pushToken,
      t,
    ]
  );

  const handlePushToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) {
      return;
    }

    if (pushEnabled) {
      await persistNotificationSettings({ enabled: false, pushToken: '' });
      return;
    }

    const token = await getDevicePushToken();

    if (!token) {
      setNotificationError(t('settings.pushTokenUnavailable'));
      return;
    }

    await persistNotificationSettings({ enabled: true, pushToken: token });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, pushEnabled, t]);

  const handleDailyReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) {
      return;
    }

    await persistNotificationSettings({ dailyExpenseReminderEnabled: !dailyExpenseReminderEnabled });
  }, [dailyExpenseReminderEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleDebtReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) {
      return;
    }

    await persistNotificationSettings({ debtPaymentReminderEnabled: !debtPaymentReminderEnabled });
  }, [debtPaymentReminderEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handlePickReminderTime = useCallback(
    (kind: 'daily' | 'debt') => {
      if (notificationLoading || notificationSaving) {
        return;
      }

      const currentValue = kind === 'daily' ? dailyExpenseReminderTime : debtPaymentReminderTime;

      DateTimePickerAndroid.open({
        value: parseTimeValue(currentValue),
        mode: 'time',
        is24Hour: true,
        onChange: async (_, selectedDate) => {
          if (!selectedDate) {
            return;
          }

          const nextTime = formatTimeValue(selectedDate);

          if (kind === 'daily') {
            await persistNotificationSettings({ dailyExpenseReminderTime: nextTime });
            return;
          }

          await persistNotificationSettings({ debtPaymentReminderTime: nextTime });
        },
      });
    },
    [
      dailyExpenseReminderTime,
      debtPaymentReminderTime,
      notificationLoading,
      notificationSaving,
      persistNotificationSettings,
    ]
  );

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
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={22} color={colors.outlineVariant} />}
            />

            <SettingsRow
              colors={colors}
              icon="fingerprint"
              title={t('settings.biometrics')}
              subtitle={t('settings.biometricsMeta')}
              iconTone="secondary"
              rightSlot={
                <Pressable
                  onPress={() => setBiometricEnabled((value) => !value)}
                  style={[styles.switchTrack, biometricEnabled && styles.switchTrackActive]}>
                  <View style={[styles.switchThumb, biometricEnabled && styles.switchThumbActive]} />
                </Pressable>
              }
            />
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
            icon="inbox-outline"
            title={t('settings.notificationInbox')}
            subtitle={t('settings.notificationInboxMeta')}
            iconTone="primary"
            onPress={() => router.push('/notifications')}
            rightSlot={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />}
            style={styles.notificationInboxRow}
          />
          <View style={styles.gridTwo}>
            <SettingsRow
              colors={colors}
              icon="bell-ring-outline"
              title={t('settings.pushNotifications')}
              subtitle={t('settings.pushNotificationsMeta')}
              iconTone="primary"
              accent
              rightSlot={
                <Pressable
                  onPress={() => void handlePushToggle()}
                  disabled={notificationLoading || notificationSaving}
                  style={[
                    styles.switchTrack,
                    pushEnabled && styles.switchTrackPrimary,
                    (notificationLoading || notificationSaving) && styles.switchTrackDisabled,
                  ]}>
                  <View style={[styles.switchThumb, pushEnabled && styles.switchThumbPrimary]} />
                </Pressable>
              }
            />

            <SettingsRow
              colors={colors}
              icon="cash-fast"
              title={t('settings.dailyExpenseReminder')}
              subtitle={t('settings.dailyExpenseReminderMeta')}
              rightSlot={
                <Pressable
                  onPress={() => void handleDailyReminderToggle()}
                  disabled={notificationLoading || notificationSaving}
                  style={[
                    styles.switchTrack,
                    dailyExpenseReminderEnabled && styles.switchTrackActive,
                    (notificationLoading || notificationSaving) && styles.switchTrackDisabled,
                  ]}>
                  <View style={[styles.switchThumb, dailyExpenseReminderEnabled && styles.switchThumbActive]} />
                </Pressable>
              }
            />

            <SettingsRow
              colors={colors}
              icon="calendar-clock"
              title={t('settings.debtPaymentReminder')}
              subtitle={t('settings.debtPaymentReminderMeta')}
              iconTone="secondary"
              rightSlot={
                <Pressable
                  onPress={() => void handleDebtReminderToggle()}
                  disabled={notificationLoading || notificationSaving}
                  style={[
                    styles.switchTrack,
                    debtPaymentReminderEnabled && styles.switchTrackPrimary,
                    (notificationLoading || notificationSaving) && styles.switchTrackDisabled,
                  ]}>
                  <View style={[styles.switchThumb, debtPaymentReminderEnabled && styles.switchThumbPrimary]} />
                </Pressable>
              }
            />
          </View>

            <View style={styles.notificationInfoCard}>
              {notificationLoading ? (
                <View style={styles.notificationStatusRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.notificationInfoText}>{t('settings.notificationsLoading')}</Text>
              </View>
            ) : null}

            {notificationStatus ? <Text style={styles.notificationSuccessText}>{notificationStatus}</Text> : null}
            {notificationError ? <Text style={styles.notificationErrorText}>{notificationError}</Text> : null}

            <View style={styles.notificationMetaRow}>
              <Text style={styles.notificationMetaLabel}>{t('settings.dailyExpenseReminderTime')}</Text>
              <Pressable
                onPress={() => void handlePickReminderTime('daily')}
                disabled={notificationLoading || notificationSaving}
                style={({ pressed }) => [
                  styles.notificationTimeButton,
                  (notificationLoading || notificationSaving) && styles.notificationTimeButtonDisabled,
                  pressed && styles.notificationTimeButtonPressed,
                ]}>
                <Text style={styles.notificationMetaValue}>{dailyExpenseReminderTime}</Text>
                <MaterialCommunityIcons name="clock-outline" size={14} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.notificationMetaRow}>
              <Text style={styles.notificationMetaLabel}>{t('settings.debtPaymentReminderTime')}</Text>
              <Pressable
                onPress={() => void handlePickReminderTime('debt')}
                disabled={notificationLoading || notificationSaving}
                style={({ pressed }) => [
                  styles.notificationTimeButton,
                  (notificationLoading || notificationSaving) && styles.notificationTimeButtonDisabled,
                  pressed && styles.notificationTimeButtonPressed,
                ]}>
                <Text style={styles.notificationMetaValue}>{debtPaymentReminderTime}</Text>
                <MaterialCommunityIcons name="clock-outline" size={14} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.notificationMetaRow}>
              <Text style={styles.notificationMetaLabel}>{t('settings.pushToken')}</Text>
              <Text numberOfLines={1} style={styles.notificationMetaValue}>
                {pushToken ? t('settings.pushTokenReady') : t('settings.pushTokenMissing')}
              </Text>
            </View>
          </View>
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
    notificationInfoCard: {
      marginTop: 12,
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 14,
      gap: 10,
    },
    notificationStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    notificationInfoText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    notificationSuccessText: {
      color: colors.secondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    notificationErrorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    notificationMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    notificationTimeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    notificationTimeButtonPressed: {
      opacity: 0.88,
    },
    notificationTimeButtonDisabled: {
      opacity: 0.55,
    },
    notificationMetaLabel: {
      flexShrink: 1,
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    notificationMetaValue: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '800',
      textAlign: 'right',
      flexShrink: 0,
    },
    notificationInboxRow: {
      marginBottom: 12,
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
