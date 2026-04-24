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
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
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
import {
  updateNotificationSettings,
  type NotificationSettingsData,
  type UpdateNotificationSettingsPayload,
} from '@/lib/api/notifications';
import { getAuthSession, refreshStoredAuthSession, saveAuthSession } from '@/lib/auth-session';
import { getDeviceName } from '@/lib/device-name';
import { loadUnreadNotificationCount } from '@/lib/notification-unread-count';
import {
  getDevicePushToken,
  hasGrantedNotificationPermission,
  loadNotificationSettings,
  syncDevicePushToken,
} from '@/lib/push-notifications';

const DEVICE_NAME = getDeviceName();
const PUSH_DEBUG_ENABLED = true;
const debugNotificationSettings = (...args: unknown[]) => {
  if (PUSH_DEBUG_ENABLED) {
    console.log('[push-debug][settings]', ...args);
  }
};

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
  enabled: true,
  daily_expense_reminder_enabled: true,
  daily_expense_reminder_time: '20:00',
  debt_payment_reminder_enabled: true,
  debt_payment_reminder_time: '09:00',
  debt_payment_reminder_days_before: 3,
  salary_reminder_enabled: true,
  salary_reminder_time: '08:00',
  salary_reminder_days_before: 1,
  salary_day: 25,
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

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type NormalizedNotificationSettings = {
  enabled: boolean;
  daily_expense_reminder_enabled: boolean;
  daily_expense_reminder_time: string;
  debt_payment_reminder_enabled: boolean;
  debt_payment_reminder_time: string;
  debt_payment_reminder_days_before: number;
  salary_reminder_enabled: boolean;
  salary_reminder_time: string;
  salary_reminder_days_before: number;
  salary_day: number;
  push_token: string;
};

const normalizePushToken = (value?: string | null) => value?.trim() ?? '';

const normalizeNotificationSettings = (
  data?: Partial<NotificationSettingsData> | null
): NormalizedNotificationSettings => ({
  enabled: Boolean(data?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.enabled),
  daily_expense_reminder_enabled: Boolean(
    data?.daily_expense_reminder_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.daily_expense_reminder_enabled
  ),
  daily_expense_reminder_time:
    data?.daily_expense_reminder_time ?? DEFAULT_NOTIFICATION_SETTINGS.daily_expense_reminder_time ?? '20:00',
  debt_payment_reminder_enabled: Boolean(
    data?.debt_payment_reminder_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.debt_payment_reminder_enabled
  ),
  debt_payment_reminder_time:
    data?.debt_payment_reminder_time ?? DEFAULT_NOTIFICATION_SETTINGS.debt_payment_reminder_time ?? '09:00',
  debt_payment_reminder_days_before: Number(
    data?.debt_payment_reminder_days_before ?? DEFAULT_NOTIFICATION_SETTINGS.debt_payment_reminder_days_before ?? 3
  ),
  salary_reminder_enabled: Boolean(data?.salary_reminder_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.salary_reminder_enabled),
  salary_reminder_time:
    data?.salary_reminder_time ?? DEFAULT_NOTIFICATION_SETTINGS.salary_reminder_time ?? '08:00',
  salary_reminder_days_before: Number(
    data?.salary_reminder_days_before ?? DEFAULT_NOTIFICATION_SETTINGS.salary_reminder_days_before ?? 1
  ),
  salary_day: Number(data?.salary_day ?? DEFAULT_NOTIFICATION_SETTINGS.salary_day ?? 25),
  push_token: normalizePushToken(data?.push_token ?? DEFAULT_NOTIFICATION_SETTINGS.push_token ?? ''),
});

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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [dailyExpenseReminderEnabled, setDailyExpenseReminderEnabled] = useState(false);
  const [debtPaymentReminderEnabled, setDebtPaymentReminderEnabled] = useState(false);
  const [salaryReminderEnabled, setSalaryReminderEnabled] = useState(false);
  const [dailyExpenseReminderTime, setDailyExpenseReminderTime] = useState('20:00');
  const [debtPaymentReminderTime, setDebtPaymentReminderTime] = useState('09:00');
  const [debtPaymentReminderDaysBefore, setDebtPaymentReminderDaysBefore] = useState(3);
  const [salaryReminderTime, setSalaryReminderTime] = useState('08:00');
  const [salaryReminderDaysBefore, setSalaryReminderDaysBefore] = useState(1);
  const [salaryDay, setSalaryDay] = useState(25);
  const [pushToken, setPushToken] = useState('');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [biometricSaving, setBiometricSaving] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [biometricSetupOpen, setBiometricSetupOpen] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
const [signingOut, setSigningOut] = useState(false);
  const pushTokenReady = Boolean(pushToken);
  const pushToggleActive = Boolean(pushEnabled && notificationPermissionGranted);
  const currentNotificationSettings = useMemo(
    () => ({
      enabled: pushEnabled,
      daily_expense_reminder_enabled: dailyExpenseReminderEnabled,
      daily_expense_reminder_time: dailyExpenseReminderTime,
      debt_payment_reminder_enabled: debtPaymentReminderEnabled,
      debt_payment_reminder_time: debtPaymentReminderTime,
      debt_payment_reminder_days_before: debtPaymentReminderDaysBefore,
      salary_reminder_enabled: salaryReminderEnabled,
      salary_reminder_time: salaryReminderTime,
      salary_reminder_days_before: salaryReminderDaysBefore,
      salary_day: salaryDay,
      push_token: pushToken,
    }),
    [
      dailyExpenseReminderEnabled,
      dailyExpenseReminderTime,
      debtPaymentReminderDaysBefore,
      debtPaymentReminderEnabled,
      debtPaymentReminderTime,
      pushEnabled,
      pushToken,
      salaryDay,
      salaryReminderDaysBefore,
      salaryReminderEnabled,
      salaryReminderTime,
    ]
  );

  const applyNotificationSettings = useCallback(
    (data?: Partial<NotificationSettingsData> | null, base?: Partial<NotificationSettingsData> | null) => {
      const nextData = normalizeNotificationSettings({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(base ?? {}),
        ...(data ?? {}),
      });

      setPushEnabled(Boolean(nextData.enabled));
      setDailyExpenseReminderEnabled(nextData.daily_expense_reminder_enabled);
      setDailyExpenseReminderTime(nextData.daily_expense_reminder_time);
      setDebtPaymentReminderEnabled(nextData.debt_payment_reminder_enabled);
      setDebtPaymentReminderTime(nextData.debt_payment_reminder_time);
      setDebtPaymentReminderDaysBefore(nextData.debt_payment_reminder_days_before);
      setSalaryReminderEnabled(nextData.salary_reminder_enabled);
      setSalaryReminderTime(nextData.salary_reminder_time);
      setSalaryReminderDaysBefore(nextData.salary_reminder_days_before);
      setSalaryDay(nextData.salary_day);
      setPushToken(nextData.push_token);
    },
    []
  );

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

      const loadSessionAndNotifications = async () => {
        const session = await getAuthSession();
        if (!session || !active) {
          setNotificationLoading(false);
          setBiometricLoading(false);
          return;
        }

        setDisplayName(session.user.name || 'Alex Sterling');
        setEmail(session.user.email || 'alex.sterling@ledger.io');
        void refreshUnreadNotificationCount(session.token.access_token);

        setNotificationLoading(true);
        setNotificationError('');
        setBiometricLoading(true);
        setBiometricError('');

        try {
          const permissionGranted = await hasGrantedNotificationPermission();
          if (!active) {
            return;
          }

          setNotificationPermissionGranted(permissionGranted);

          const settings = permissionGranted
            ? (await syncDevicePushToken(session.token.access_token)).settings
            : await loadNotificationSettings(session.token.access_token);

          if (!active) {
            return;
          }

          debugNotificationSettings('load', {
            permissionGranted,
            backendEnabled: settings?.enabled ?? null,
            backendToken: settings?.push_token ?? null,
            hasBackendToken: Boolean(settings?.push_token),
          });

          applyNotificationSettings(settings);
        } catch {
          if (active) {
            setNotificationError(t('settings.notificationsLoadError'));
          }
        } finally {
          if (active) {
            setNotificationLoading(false);
          }
        }

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

      void loadSessionAndNotifications();

      return () => {
        active = false;
      };
    }, [applyNotificationSettings, refreshUnreadNotificationCount, t])
  );

  const persistNotificationSettings = useCallback(
    async (nextState: {
      enabled?: boolean;
      dailyExpenseReminderEnabled?: boolean;
      dailyExpenseReminderTime?: string;
      debtPaymentReminderEnabled?: boolean;
      debtPaymentReminderTime?: string;
      debtPaymentReminderDaysBefore?: number;
      salaryReminderEnabled?: boolean;
      salaryReminderTime?: string;
      salaryReminderDaysBefore?: number;
      salaryDay?: number;
      pushToken?: string;
    }) => {
      const session = await getAuthSession();

      if (!session) {
        return false;
      }

      setNotificationSaving(true);
      setNotificationError('');

      const payload: UpdateNotificationSettingsPayload = {};

      if (nextState.enabled !== undefined) {
        payload.enabled = nextState.enabled;
      }

      if (nextState.dailyExpenseReminderEnabled !== undefined) {
        payload.daily_expense_reminder_enabled = nextState.dailyExpenseReminderEnabled;
      }

      if (nextState.dailyExpenseReminderTime !== undefined) {
        payload.daily_expense_reminder_time = nextState.dailyExpenseReminderTime;
      }

      if (nextState.debtPaymentReminderEnabled !== undefined) {
        payload.debt_payment_reminder_enabled = nextState.debtPaymentReminderEnabled;
      }

      if (nextState.debtPaymentReminderTime !== undefined) {
        payload.debt_payment_reminder_time = nextState.debtPaymentReminderTime;
      }

      if (nextState.debtPaymentReminderDaysBefore !== undefined) {
        payload.debt_payment_reminder_days_before = nextState.debtPaymentReminderDaysBefore;
      }

      if (nextState.salaryReminderEnabled !== undefined) {
        payload.salary_reminder_enabled = nextState.salaryReminderEnabled;
      }

      if (nextState.salaryReminderTime !== undefined) {
        payload.salary_reminder_time = nextState.salaryReminderTime;
      }

      if (nextState.salaryReminderDaysBefore !== undefined) {
        payload.salary_reminder_days_before = nextState.salaryReminderDaysBefore;
      }

      if (nextState.salaryDay !== undefined) {
        payload.salary_day = nextState.salaryDay;
      }

      if (nextState.pushToken !== undefined) {
        payload.push_token = nextState.pushToken;
      }

      if (Object.keys(payload).length === 0) {
        setNotificationSaving(false);
        return true;
      }

      try {
        let response;

        try {
          response = await updateNotificationSettings(session.token.access_token, payload);
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 401) {
            const refreshed = await refreshStoredAuthSession();
            if (!refreshed) {
              throw error;
            }

            response = await updateNotificationSettings(refreshed.token.access_token, payload);
          } else {
            throw error;
          }
        }

        applyNotificationSettings(response.Data ?? payload, currentNotificationSettings);
        return true;
      } catch (error) {
        setNotificationError(
          error instanceof ApiRequestError && error.message
            ? error.message
            : t('settings.notificationsSaveError')
        );
        return false;
      } finally {
        setNotificationSaving(false);
      }
    },
    [
      applyNotificationSettings,
      currentNotificationSettings,
      t,
    ]
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

  const handlePushToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) {
      return;
    }

    debugNotificationSettings('toggle-start', {
      pushEnabled,
      notificationPermissionGranted,
      pushToken,
      pushTokenReady,
      pushToggleActive,
    });

    if (pushToggleActive) {
      await persistNotificationSettings({ enabled: false });
      return;
    }

    if (notificationPermissionGranted && pushTokenReady) {
      await persistNotificationSettings({ enabled: true });
      return;
    }

    const token = await getDevicePushToken();
    const permissionGranted = await hasGrantedNotificationPermission();
    setNotificationPermissionGranted(permissionGranted);

    debugNotificationSettings('toggle-request-result', {
      permissionGranted,
      token,
      hasToken: Boolean(token),
    });

    if (!token) {
      setNotificationError(t('settings.pushTokenUnavailable'));
      return;
    }

    await persistNotificationSettings({ enabled: true, pushToken: token });
  }, [
    notificationLoading,
    notificationPermissionGranted,
    notificationSaving,
    persistNotificationSettings,
    pushEnabled,
    pushToken,
    pushToggleActive,
    pushTokenReady,
    t,
  ]);

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

  const handleSalaryReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) {
      return;
    }

    await persistNotificationSettings({ salaryReminderEnabled: !salaryReminderEnabled });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, salaryReminderEnabled]);

  const handlePickReminderTime = useCallback(
    (kind: 'daily' | 'debt' | 'salary') => {
      if (notificationLoading || notificationSaving) {
        return;
      }

      const currentValue =
        kind === 'daily' ? dailyExpenseReminderTime : kind === 'debt' ? debtPaymentReminderTime : salaryReminderTime;

      DateTimePickerAndroid.open({
        value: parseTimeValue(currentValue),
        mode: 'time',
        is24Hour: true,
        onChange: async (event, selectedDate) => {
          if (event.type !== 'set' || !selectedDate) {
            return;
          }

          const nextTime = formatTimeValue(selectedDate);

          if (kind === 'daily') {
            await persistNotificationSettings({ dailyExpenseReminderTime: nextTime });
            return;
          }

          if (kind === 'salary') {
            await persistNotificationSettings({ salaryReminderTime: nextTime });
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
      salaryReminderTime,
    ]
  );

  const handleAdjustSalaryDay = useCallback(
    async (delta: number) => {
      if (notificationLoading || notificationSaving) {
        return;
      }

      await persistNotificationSettings({ salaryDay: clampNumber(salaryDay + delta, 1, 31) });
    },
    [notificationLoading, notificationSaving, persistNotificationSettings, salaryDay]
  );

const handleAdjustSalaryDaysBefore = useCallback(
    async (delta: number) => {
      if (notificationLoading || notificationSaving) {
        return;
      }

      await persistNotificationSettings({ salaryReminderDaysBefore: clampNumber(salaryReminderDaysBefore + delta, 0, 31) });
    },
[notificationLoading, notificationSaving, persistNotificationSettings, salaryReminderDaysBefore]
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
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 92,
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
    notificationTimeText: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '800',
      textAlign: 'right',
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
    notificationCounterGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    notificationCounterButton: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    notificationCounterButtonPressed: {
      opacity: 0.88,
    },
    notificationCounterValueWrap: {
      minWidth: 56,
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.16),
    },
    notificationCounterValue: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textAlign: 'center',
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
