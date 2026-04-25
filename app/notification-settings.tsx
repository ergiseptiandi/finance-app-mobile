import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useAppLanguage } from '@/providers/language-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';
import { ApiRequestError } from '@/lib/api/auth';
import {
  updateNotificationSettings,
  type NotificationSettingsData,
  type UpdateNotificationSettingsPayload,
} from '@/lib/api/notifications';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import {
  getDevicePushToken,
  hasGrantedNotificationPermission,
  loadNotificationSettings,
  sendTestNotification,
  syncDevicePushToken,
} from '@/lib/push-notifications';

const PUSH_DEBUG_ENABLED = true;
const debugNotificationSettings = (...args: unknown[]) => {
  if (PUSH_DEBUG_ENABLED) {
    console.log('[push-debug][notification-settings]', ...args);
  }
};

const NOTIFICATION_CHANNEL_ID = 'finance-go-default';
const ANDROID_PACKAGE_NAME = 'com.paidevc.financego';

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
  budget_amount: 0,
  budget_warning_enabled: true,
  budget_warning_threshold: 80,
  weekly_summary_enabled: true,
  weekly_summary_day: 0,
  large_transaction_enabled: true,
  large_transaction_threshold: 1000000,
  goal_reminder_enabled: true,
  goal_reminder_days_before: 7,
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

const sanitizeNumericInput = (value: string) => value.replace(/[^\d]/g, '');

const formatCurrencyInput = (value: string) => {
  const normalized = sanitizeNumericInput(value);

  if (!normalized) {
    return '';
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Number(normalized));
};

const parseCurrencyInput = (value: string) => {
  const normalized = sanitizeNumericInput(value);
  return normalized ? Number(normalized) : 0;
};

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

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
  budget_amount: number;
  budget_warning_enabled: boolean;
  budget_warning_threshold: number;
  weekly_summary_enabled: boolean;
  weekly_summary_day: number;
  large_transaction_enabled: boolean;
  large_transaction_threshold: number;
  goal_reminder_enabled: boolean;
  goal_reminder_days_before: number;
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
  budget_amount: Number(data?.budget_amount ?? DEFAULT_NOTIFICATION_SETTINGS.budget_amount ?? 0),
  budget_warning_enabled: Boolean(data?.budget_warning_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.budget_warning_enabled),
  budget_warning_threshold: Number(
    data?.budget_warning_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.budget_warning_threshold ?? 80
  ),
  weekly_summary_enabled: Boolean(data?.weekly_summary_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.weekly_summary_enabled),
  weekly_summary_day: Number(data?.weekly_summary_day ?? DEFAULT_NOTIFICATION_SETTINGS.weekly_summary_day ?? 0),
  large_transaction_enabled: Boolean(
    data?.large_transaction_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.large_transaction_enabled
  ),
  large_transaction_threshold: Number(
    data?.large_transaction_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.large_transaction_threshold ?? 1000000
  ),
  goal_reminder_enabled: Boolean(data?.goal_reminder_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.goal_reminder_enabled),
  goal_reminder_days_before: Number(
    data?.goal_reminder_days_before ?? DEFAULT_NOTIFICATION_SETTINGS.goal_reminder_days_before ?? 7
  ),
  push_token: normalizePushToken(data?.push_token ?? DEFAULT_NOTIFICATION_SETTINGS.push_token ?? ''),
});

export default function NotificationSettingsScreen() {
  const { colorScheme } = useAppTheme();
  const { t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);

  // Notification toggle states
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
  const [budgetAmountInput, setBudgetAmountInput] = useState('0');
  const [budgetWarningEnabled, setBudgetWarningEnabled] = useState(true);
  const [budgetWarningThreshold, setBudgetWarningThreshold] = useState(80);
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(true);
  const [weeklySummaryDay, setWeeklySummaryDay] = useState(0);
  const [largeTransactionEnabled, setLargeTransactionEnabled] = useState(true);
  const [largeTransactionThresholdInput, setLargeTransactionThresholdInput] = useState('1000000');
  const [goalReminderEnabled, setGoalReminderEnabled] = useState(true);
  const [goalReminderDaysBefore, setGoalReminderDaysBefore] = useState(7);
  const [pushToken, setPushToken] = useState('');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState('');

  // Test notification states
  const [testNotificationSending, setTestNotificationSending] = useState(false);
  const [testNotificationResult, setTestNotificationResult] = useState<'idle' | 'success' | 'error'>('idle');

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
      budget_amount: parseCurrencyInput(budgetAmountInput),
      budget_warning_enabled: budgetWarningEnabled,
      budget_warning_threshold: budgetWarningThreshold,
      weekly_summary_enabled: weeklySummaryEnabled,
      weekly_summary_day: weeklySummaryDay,
      large_transaction_enabled: largeTransactionEnabled,
      large_transaction_threshold: parseCurrencyInput(largeTransactionThresholdInput),
      goal_reminder_enabled: goalReminderEnabled,
      goal_reminder_days_before: goalReminderDaysBefore,
      push_token: pushToken,
    }),
    [
      budgetAmountInput,
      budgetWarningEnabled,
      budgetWarningThreshold,
      dailyExpenseReminderEnabled,
      dailyExpenseReminderTime,
      debtPaymentReminderDaysBefore,
      debtPaymentReminderEnabled,
      debtPaymentReminderTime,
      goalReminderDaysBefore,
      goalReminderEnabled,
      largeTransactionEnabled,
      largeTransactionThresholdInput,
      pushEnabled,
      pushToken,
      weeklySummaryDay,
      weeklySummaryEnabled,
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
      setBudgetAmountInput(formatCurrencyInput(String(nextData.budget_amount)) || '0');
      setBudgetWarningEnabled(nextData.budget_warning_enabled);
      setBudgetWarningThreshold(nextData.budget_warning_threshold);
      setWeeklySummaryEnabled(nextData.weekly_summary_enabled);
      setWeeklySummaryDay(nextData.weekly_summary_day);
      setLargeTransactionEnabled(nextData.large_transaction_enabled);
      setLargeTransactionThresholdInput(
        formatCurrencyInput(String(nextData.large_transaction_threshold)) || '0'
      );
      setGoalReminderEnabled(nextData.goal_reminder_enabled);
      setGoalReminderDaysBefore(nextData.goal_reminder_days_before);
      setPushToken(nextData.push_token);
    },
    []
  );

  // Load settings on focus
  useEffect(() => {
    let active = true;

    const loadSessionAndNotifications = async () => {
      const session = await getAuthSession();
      if (!session || !active) {
        setNotificationLoading(false);
        return;
      }

      setNotificationLoading(true);
      setNotificationError('');

      try {
        const permissionGranted = await hasGrantedNotificationPermission();
        if (!active) return;

        setNotificationPermissionGranted(permissionGranted);

        const settings = permissionGranted
          ? (await syncDevicePushToken(session.token.access_token)).settings
          : await loadNotificationSettings(session.token.access_token);

        if (!active) return;

        debugNotificationSettings('load', { permissionGranted });
        applyNotificationSettings(settings);
      } catch {
        if (active) {
          setNotificationError('Gagal memuat setelan notifikasi');
        }
      } finally {
        if (active) {
          setNotificationLoading(false);
        }
      }
    };

    void loadSessionAndNotifications();
    return () => { active = false; };
  }, [applyNotificationSettings]);

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
      budgetAmount?: number;
      budgetWarningEnabled?: boolean;
      budgetWarningThreshold?: number;
      weeklySummaryEnabled?: boolean;
      weeklySummaryDay?: number;
      largeTransactionEnabled?: boolean;
      largeTransactionThreshold?: number;
      goalReminderEnabled?: boolean;
      goalReminderDaysBefore?: number;
      pushToken?: string;
    }) => {
      const session = await getAuthSession();
      if (!session) return false;

      setNotificationSaving(true);
      setNotificationError('');

      const payload: UpdateNotificationSettingsPayload = {};
      if (nextState.enabled !== undefined) payload.enabled = nextState.enabled;
      if (nextState.dailyExpenseReminderEnabled !== undefined) payload.daily_expense_reminder_enabled = nextState.dailyExpenseReminderEnabled;
      if (nextState.dailyExpenseReminderTime !== undefined) payload.daily_expense_reminder_time = nextState.dailyExpenseReminderTime;
      if (nextState.debtPaymentReminderEnabled !== undefined) payload.debt_payment_reminder_enabled = nextState.debtPaymentReminderEnabled;
      if (nextState.debtPaymentReminderTime !== undefined) payload.debt_payment_reminder_time = nextState.debtPaymentReminderTime;
      if (nextState.debtPaymentReminderDaysBefore !== undefined) payload.debt_payment_reminder_days_before = nextState.debtPaymentReminderDaysBefore;
      if (nextState.salaryReminderEnabled !== undefined) payload.salary_reminder_enabled = nextState.salaryReminderEnabled;
      if (nextState.salaryReminderTime !== undefined) payload.salary_reminder_time = nextState.salaryReminderTime;
      if (nextState.salaryReminderDaysBefore !== undefined) payload.salary_reminder_days_before = nextState.salaryReminderDaysBefore;
      if (nextState.salaryDay !== undefined) payload.salary_day = nextState.salaryDay;
      if (nextState.budgetAmount !== undefined) payload.budget_amount = nextState.budgetAmount;
      if (nextState.budgetWarningEnabled !== undefined) payload.budget_warning_enabled = nextState.budgetWarningEnabled;
      if (nextState.budgetWarningThreshold !== undefined) payload.budget_warning_threshold = nextState.budgetWarningThreshold;
      if (nextState.weeklySummaryEnabled !== undefined) payload.weekly_summary_enabled = nextState.weeklySummaryEnabled;
      if (nextState.weeklySummaryDay !== undefined) payload.weekly_summary_day = nextState.weeklySummaryDay;
      if (nextState.largeTransactionEnabled !== undefined) payload.large_transaction_enabled = nextState.largeTransactionEnabled;
      if (nextState.largeTransactionThreshold !== undefined) payload.large_transaction_threshold = nextState.largeTransactionThreshold;
      if (nextState.goalReminderEnabled !== undefined) payload.goal_reminder_enabled = nextState.goalReminderEnabled;
      if (nextState.goalReminderDaysBefore !== undefined) payload.goal_reminder_days_before = nextState.goalReminderDaysBefore;
      if (nextState.pushToken !== undefined) payload.push_token = nextState.pushToken;

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
            if (!refreshed) throw error;
            response = await updateNotificationSettings(refreshed.token.access_token, payload);
          } else {
            throw error;
          }
        }

        applyNotificationSettings(response.Data ?? payload, currentNotificationSettings);
        return true;
      } catch (error) {
        setNotificationError(error instanceof ApiRequestError && error.message ? error.message : 'Gagal menyimpan setelan notifikasi');
        return false;
      } finally {
        setNotificationSaving(false);
      }
    },
    [applyNotificationSettings, currentNotificationSettings]
  );

  const handlePushToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;

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

    if (!token) {
      setNotificationError('Gagal mengambil token push perangkat');
      return;
    }

    await persistNotificationSettings({ enabled: true, pushToken: token });
  }, [notificationLoading, notificationPermissionGranted, notificationSaving, persistNotificationSettings, pushToggleActive, pushTokenReady]);

  const handleDailyReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ dailyExpenseReminderEnabled: !dailyExpenseReminderEnabled });
  }, [dailyExpenseReminderEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleDebtReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ debtPaymentReminderEnabled: !debtPaymentReminderEnabled });
  }, [debtPaymentReminderEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleSalaryReminderToggle = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ salaryReminderEnabled: !salaryReminderEnabled });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, salaryReminderEnabled]);

  const handlePickReminderTime = useCallback(
    (kind: 'daily' | 'debt' | 'salary') => {
      if (notificationLoading || notificationSaving) return;

      const currentValue = kind === 'daily' ? dailyExpenseReminderTime : kind === 'debt' ? debtPaymentReminderTime : salaryReminderTime;

      DateTimePickerAndroid.open({
        value: parseTimeValue(currentValue),
        mode: 'time',
        is24Hour: true,
        onChange: async (event, selectedDate) => {
          if (event.type !== 'set' || !selectedDate) return;
          const nextTime = formatTimeValue(selectedDate);

          if (kind === 'daily') await persistNotificationSettings({ dailyExpenseReminderTime: nextTime });
          else if (kind === 'salary') await persistNotificationSettings({ salaryReminderTime: nextTime });
          else await persistNotificationSettings({ debtPaymentReminderTime: nextTime });
        },
      });
    },
    [dailyExpenseReminderTime, debtPaymentReminderTime, notificationLoading, notificationSaving, persistNotificationSettings, salaryReminderTime]
  );

  const handleAdjustSalaryDay = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ salaryDay: clampNumber(salaryDay + delta, 1, 31) });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, salaryDay]);

  const handleAdjustSalaryDaysBefore = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ salaryReminderDaysBefore: clampNumber(salaryReminderDaysBefore + delta, 0, 31) });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, salaryReminderDaysBefore]);

  const handleAdjustDebtDaysBefore = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ debtPaymentReminderDaysBefore: clampNumber(debtPaymentReminderDaysBefore + delta, 0, 31) });
  }, [debtPaymentReminderDaysBefore, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleAdjustBudgetWarningThreshold = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ budgetWarningThreshold: clampNumber(budgetWarningThreshold + delta, 1, 100) });
  }, [budgetWarningThreshold, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleAdjustWeeklySummaryDay = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ weeklySummaryDay: (weeklySummaryDay + delta + 7) % 7 });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, weeklySummaryDay]);

  const handleAdjustGoalReminderDaysBefore = useCallback(async (delta: number) => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ goalReminderDaysBefore: clampNumber(goalReminderDaysBefore + delta, 0, 31) });
  }, [goalReminderDaysBefore, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleToggleBudgetWarning = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ budgetWarningEnabled: !budgetWarningEnabled });
  }, [budgetWarningEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleToggleWeeklySummary = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ weeklySummaryEnabled: !weeklySummaryEnabled });
  }, [notificationLoading, notificationSaving, persistNotificationSettings, weeklySummaryEnabled]);

  const handleToggleLargeTransaction = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ largeTransactionEnabled: !largeTransactionEnabled });
  }, [largeTransactionEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleToggleGoalReminder = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ goalReminderEnabled: !goalReminderEnabled });
  }, [goalReminderEnabled, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleBudgetAmountSave = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ budgetAmount: parseCurrencyInput(budgetAmountInput) });
  }, [budgetAmountInput, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleLargeTransactionThresholdSave = useCallback(async () => {
    if (notificationLoading || notificationSaving) return;
    await persistNotificationSettings({ largeTransactionThreshold: parseCurrencyInput(largeTransactionThresholdInput) });
  }, [largeTransactionThresholdInput, notificationLoading, notificationSaving, persistNotificationSettings]);

  const handleOpenNotificationSoundSettings = useCallback(async () => {
    try {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Finance GO Alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      });

      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
          { key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_PACKAGE_NAME },
          { key: 'android.provider.extra.CHANNEL_ID', value: NOTIFICATION_CHANNEL_ID },
        ]);
        return;
      }

      await Linking.openSettings();
    } catch (error) {
      debugNotificationSettings('sound-settings-open-failed', { error });
      await Linking.openSettings().catch(() => {});
    }
  }, []);

  const handleSendTestNotification = useCallback(async () => {
    if (testNotificationSending) return;

    setTestNotificationSending(true);
    setTestNotificationResult('idle');

    try {
      const sent = await sendTestNotification();
      setTestNotificationResult(sent ? 'success' : 'error');
    } catch {
      setTestNotificationResult('error');
    } finally {
      setTestNotificationSending(false);
    }
  }, [testNotificationSending]);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.shellTextPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('settings.notifications')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Master Toggle */}
        <View style={styles.masterToggleCard}>
          <View style={styles.masterToggleLeft}>
            <View style={styles.masterToggleIcon}>
              <MaterialCommunityIcons name="bell-ring" size={28} color={pushToggleActive ? colors.primary : colors.icon} />
            </View>
            <View style={styles.masterToggleCopy}>
              <Text style={styles.masterToggleTitle}>{t('settings.notificationsLabel')}</Text>
              <Text style={styles.masterToggleSubtitle}>
                {pushToggleActive ? 'Aktif' : 'Nonaktif'}
              </Text>
            </View>
          </View>
          <Switch
            value={pushToggleActive}
            onValueChange={() => void handlePushToggle()}
            trackColor={{ false: colors.shellCardMuted, true: alpha(colors.primary, 0.4) }}
            thumbColor={pushToggleActive ? colors.primary : colors.outlineVariant}
            disabled={notificationLoading || notificationSaving}
          />
        </View>

        {/* Sound Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suara Notifikasi</Text>
          <View style={styles.soundCard}>
            <Pressable
              onPress={() => void handleOpenNotificationSoundSettings()}
              style={styles.soundRow}>
              <View style={styles.soundLeft}>
                <View style={styles.soundIcon}>
                  <MaterialCommunityIcons name="volume-high" size={22} color={colors.primary} />
                </View>
                <View style={styles.soundCopy}>
                  <Text style={styles.soundTitle}>Suara Notifikasi</Text>
                  <Text style={styles.soundSubtitle}>Pilih nada notifikasi Finance GO dari pengaturan perangkat</Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name="open-in-new"
                size={24}
                color={colors.icon}
              />
            </Pressable>
            <Text style={styles.soundHelperText}>
              Kamu bisa memilih nada bawaan perangkat untuk notifikasi Finance GO melalui pengaturan aplikasi.
            </Text>

            <Pressable
              onPress={() => void handleSendTestNotification()}
              disabled={testNotificationSending}
              style={styles.testButton}>
              <MaterialCommunityIcons name="bell-check" size={18} color={colors.primary} />
              <Text style={styles.testButtonText}>
                {testNotificationSending ? 'Mengirim...' : 'Test Suara'}
              </Text>
            </Pressable>

            {testNotificationResult === 'success' && (
              <Text style={styles.successText}>Notifikasi test terkirim!</Text>
            )}
          </View>
        </View>

        {/* Reminder Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pengingat</Text>

          {/* Daily Expense */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="cash-fast" size={20} color={colors.primary} />
                <Text style={styles.reminderTitle}>{t('settings.dailyExpenseReminder')}</Text>
              </View>
              <Switch
                value={dailyExpenseReminderEnabled}
                onValueChange={() => void handleDailyReminderToggle()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.primary, 0.4) }}
                thumbColor={dailyExpenseReminderEnabled ? colors.primary : colors.outlineVariant}
              />
            </View>
            {dailyExpenseReminderEnabled && (
              <Pressable
                onPress={() => handlePickReminderTime('daily')}
                style={styles.timeButton}>
                <MaterialCommunityIcons name="clock-outline" size={16} color={colors.primary} />
                <Text style={styles.timeButtonText}>{dailyExpenseReminderTime}</Text>
              </Pressable>
            )}
          </View>

          {/* Debt Payment */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.secondary} />
                <Text style={styles.reminderTitle}>{t('settings.debtPaymentReminder')}</Text>
              </View>
              <Switch
                value={debtPaymentReminderEnabled}
                onValueChange={() => void handleDebtReminderToggle()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.secondary, 0.4) }}
                thumbColor={debtPaymentReminderEnabled ? colors.secondary : colors.outlineVariant}
              />
            </View>
            {debtPaymentReminderEnabled && (
              <View style={styles.reminderDetails}>
                <Pressable onPress={() => handlePickReminderTime('debt')} style={styles.timeButton}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color={colors.primary} />
                  <Text style={styles.timeButtonText}>{debtPaymentReminderTime}</Text>
                </Pressable>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Hari sebelum:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => void handleAdjustDebtDaysBefore(-1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{debtPaymentReminderDaysBefore}</Text>
                    <Pressable onPress={() => void handleAdjustDebtDaysBefore(1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Salary Reminder */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="cash-plus" size={20} color={colors.secondary} />
                <Text style={styles.reminderTitle}>{t('settings.salaryReminder')}</Text>
              </View>
              <Switch
                value={salaryReminderEnabled}
                onValueChange={() => void handleSalaryReminderToggle()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.secondary, 0.4) }}
                thumbColor={salaryReminderEnabled ? colors.secondary : colors.outlineVariant}
              />
            </View>
            {salaryReminderEnabled && (
              <View style={styles.reminderDetails}>
                <Pressable onPress={() => handlePickReminderTime('salary')} style={styles.timeButton}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color={colors.primary} />
                  <Text style={styles.timeButtonText}>{salaryReminderTime}</Text>
                </Pressable>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Tanggal gaji:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => handleAdjustSalaryDay(-1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{salaryDay}</Text>
                    <Pressable onPress={() => handleAdjustSalaryDay(1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Hari sebelum:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => handleAdjustSalaryDaysBefore(-1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{salaryReminderDaysBefore}</Text>
                    <Pressable onPress={() => handleAdjustSalaryDaysBefore(1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="cash-multiple" size={20} color={colors.primary} />
                <Text style={styles.reminderTitle}>Budget bulanan</Text>
              </View>
            </View>
            <View style={styles.inputShell}>
              <TextInput
                value={budgetAmountInput}
                onChangeText={(value) => setBudgetAmountInput(formatCurrencyInput(value))}
                onBlur={() => void handleBudgetAmountSave()}
                keyboardType="number-pad"
                placeholder="1000000"
                placeholderTextColor={colors.shellTextMuted}
                editable={!notificationLoading && !notificationSaving}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.reminderTitle}>Peringatan budget</Text>
              </View>
              <Switch
                value={budgetWarningEnabled}
                onValueChange={() => void handleToggleBudgetWarning()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.primary, 0.4) }}
                thumbColor={budgetWarningEnabled ? colors.primary : colors.outlineVariant}
              />
            </View>
            {budgetWarningEnabled && (
              <View style={styles.reminderDetails}>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Ambang peringatan:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => void handleAdjustBudgetWarningThreshold(-5)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{budgetWarningThreshold}%</Text>
                    <Pressable onPress={() => void handleAdjustBudgetWarningThreshold(5)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="calendar-week" size={20} color={colors.secondary} />
                <Text style={styles.reminderTitle}>Ringkasan mingguan</Text>
              </View>
              <Switch
                value={weeklySummaryEnabled}
                onValueChange={() => void handleToggleWeeklySummary()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.secondary, 0.4) }}
                thumbColor={weeklySummaryEnabled ? colors.secondary : colors.outlineVariant}
              />
            </View>
            {weeklySummaryEnabled && (
              <View style={styles.reminderDetails}>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Hari laporan:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => void handleAdjustWeeklySummaryDay(-1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{DAY_LABELS[weeklySummaryDay] ?? weeklySummaryDay}</Text>
                    <Pressable onPress={() => void handleAdjustWeeklySummaryDay(1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="cash-fast" size={20} color={colors.secondary} />
                <Text style={styles.reminderTitle}>Transaksi besar</Text>
              </View>
              <Switch
                value={largeTransactionEnabled}
                onValueChange={() => void handleToggleLargeTransaction()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.secondary, 0.4) }}
                thumbColor={largeTransactionEnabled ? colors.secondary : colors.outlineVariant}
              />
            </View>
            {largeTransactionEnabled && (
              <View style={styles.reminderDetails}>
                <View style={styles.inputShell}>
                  <TextInput
                    value={largeTransactionThresholdInput}
                    onChangeText={(value) => setLargeTransactionThresholdInput(formatCurrencyInput(value))}
                    onBlur={() => void handleLargeTransactionThresholdSave()}
                    keyboardType="number-pad"
                    placeholder="1000000"
                    placeholderTextColor={colors.shellTextMuted}
                    editable={!notificationLoading && !notificationSaving}
                    style={styles.input}
                  />
                </View>
              </View>
            )}
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderLeft}>
                <MaterialCommunityIcons name="flag-checkered" size={20} color={colors.primary} />
                <Text style={styles.reminderTitle}>Pengingat target</Text>
              </View>
              <Switch
                value={goalReminderEnabled}
                onValueChange={() => void handleToggleGoalReminder()}
                trackColor={{ false: colors.shellCardMuted, true: alpha(colors.primary, 0.4) }}
                thumbColor={goalReminderEnabled ? colors.primary : colors.outlineVariant}
              />
            </View>
            {goalReminderEnabled && (
              <View style={styles.reminderDetails}>
                <View style={styles.counterRow}>
                  <Text style={styles.counterLabel}>Hari sebelum jatuh tempo:</Text>
                  <View style={styles.counterGroup}>
                    <Pressable onPress={() => void handleAdjustGoalReminderDaysBefore(-1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="minus" size={16} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.counterValue}>{goalReminderDaysBefore}</Text>
                    <Pressable onPress={() => void handleAdjustGoalReminderDaysBefore(1)} style={styles.counterButton}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Notification Inbox Link */}
        <Pressable
          onPress={() => {
            showTransitionOverlay();
            requestAnimationFrame(() => router.push('/notifications'));
          }}
          style={styles.inboxCard}>
          <MaterialCommunityIcons name="inbox-outline" size={22} color={colors.primary} />
          <Text style={styles.inboxText}>{t('settings.notificationInbox')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.icon} />
        </Pressable>

        {notificationError ? (
          <Text style={styles.errorText}>{notificationError}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 14, 28),
      paddingBottom: 150,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '800',
      color: colors.shellTextPrimary,
    },
    headerSpacer: {
      width: 44,
    },
    masterToggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.shellCard,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    masterToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    masterToggleIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    masterToggleCopy: {
      gap: 2,
    },
    masterToggleTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.shellTextPrimary,
    },
    masterToggleSubtitle: {
      fontSize: 13,
      color: colors.shellTextMuted,
      fontWeight: '600',
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 4,
    },
    soundCard: {
      backgroundColor: colors.shellCard,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 12,
    },
    soundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    soundLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    soundIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: alpha(colors.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    soundCopy: {
      gap: 2,
    },
    soundTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.shellTextPrimary,
    },
    soundSubtitle: {
      fontSize: 13,
      color: colors.shellTextMuted,
      lineHeight: 18,
      maxWidth: 220,
    },
    soundHelperText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    testButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: alpha(colors.primary, 0.1),
    },
    testButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    successText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.secondary,
      textAlign: 'center',
    },
    reminderCard: {
      backgroundColor: colors.shellCard,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 10,
    },
    reminderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    reminderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    reminderTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.shellTextPrimary,
    },
    reminderDetails: {
      gap: 10,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
    },
    inputShell: {
      borderRadius: 12,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
    },
    input: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      fontWeight: '700',
      paddingVertical: 10,
    },
    timeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    timeButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.shellTextPrimary,
    },
    counterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    counterLabel: {
      fontSize: 13,
      color: colors.shellTextMuted,
      fontWeight: '600',
    },
    counterGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    counterButton: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    counterValue: {
      minWidth: 36,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '800',
      color: colors.shellTextPrimary,
    },
    inboxCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.shellCard,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    inboxText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: colors.shellTextPrimary,
    },
    errorText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.danger,
      textAlign: 'center',
    },
  });
