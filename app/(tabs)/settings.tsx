import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  Platform,
  View,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
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
import { requestCsvExport, type ExportPeriodMode, type ExportScope } from '@/lib/api/export';

const DEVICE_NAME = getDeviceName();
const getCurrentMonthValue = () => new Date().toISOString().slice(0, 7);
const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index);

type ExportDateTarget = 'startDate' | 'endDate' | null;

type ExportMonthPickerState = {
  year: number;
  monthIndex: number;
};

const getExportMonthPickerStateFromInput = (value: string): ExportMonthPickerState => {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return {
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      monthIndex: Number.isFinite(month) ? Math.min(11, Math.max(0, month - 1)) : new Date().getMonth(),
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
};

const parseExportDateValue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatExportDateLabel = (value: string, locale: string) => {
  const date = parseExportDateValue(value);

  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatExportMonthChipLabel = (monthIndex: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2020, monthIndex, 1)).replace(/\.$/, '').toUpperCase();

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
  const locale = language === 'id' ? 'id-ID' : 'en-US';
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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('transactions');
  const [exportPeriodMode, setExportPeriodMode] = useState<ExportPeriodMode>('month');
  const [exportMonthPickerState, setExportMonthPickerState] = useState<ExportMonthPickerState>(() =>
    getExportMonthPickerStateFromInput(getCurrentMonthValue())
  );
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportDateTarget, setExportDateTarget] = useState<ExportDateTarget>(null);
  const [iosExportDatePickerVisible, setIosExportDatePickerVisible] = useState(false);
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

  const withAuthorizedRequest = useCallback(
    async <T,>(task: (accessToken: string) => Promise<T>) => {
      const session = await getAuthSession();

      if (!session) {
        router.replace('/login');
        throw new Error('missing_session');
      }

      try {
        return await task(session.token.access_token);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) {
            return task(refreshed.token.access_token);
          }
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace('/login');
        }

        throw error;
      }
    },
    []
  );

  const saveCsvExport = useCallback(async (csv: string, fileName: string) => {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }

    const safeFileName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    const file = new File(Paths.cache, safeFileName);
    file.write(csv);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: safeFileName,
      });
      return;
    }

    console.warn('Sharing is unavailable on this device, export file remains in cache:', file.uri);
  }, []);

  const openExportModal = useCallback(() => {
    setExportScope('transactions');
    setExportPeriodMode('month');
    setExportMonthPickerState(getExportMonthPickerStateFromInput(getCurrentMonthValue()));
    setExportStartDate('');
    setExportEndDate('');
    setExportDateTarget(null);
    setIosExportDatePickerVisible(false);
    setExportModalOpen(true);
  }, []);

  const closeExportModal = useCallback(() => {
    setExportModalOpen(false);
    setExportDateTarget(null);
    setIosExportDatePickerVisible(false);
  }, []);

  const handleExportCustomDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android' && event.type === 'dismissed') {
        return;
      }

      if (!selectedDate || !exportDateTarget) {
        return;
      }

      const nextValue = selectedDate.toISOString().slice(0, 10);
      if (exportDateTarget === 'startDate') {
        setExportStartDate(nextValue);
      } else {
        setExportEndDate(nextValue);
      }

      if (Platform.OS === 'ios') {
        setIosExportDatePickerVisible(false);
      }
    },
    [exportDateTarget]
  );

  const openExportCustomDatePicker = useCallback(
    (target: 'startDate' | 'endDate') => {
      const currentValue = target === 'startDate' ? exportStartDate : exportEndDate;
      const currentDate = parseExportDateValue(currentValue) ?? new Date();
      setExportDateTarget(target);

      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: currentDate,
          mode: 'date',
          onChange: handleExportCustomDateChange,
        });
        return;
      }

      setIosExportDatePickerVisible(true);
    },
    [exportEndDate, exportStartDate, handleExportCustomDateChange]
  );

  const handleExportCsv = useCallback(async () => {
    if (exportingCsv) {
      return;
    }

    setExportingCsv(true);

    try {
      const selectedMonth = `${exportMonthPickerState.year}-${String(exportMonthPickerState.monthIndex + 1).padStart(
        2,
        '0'
      )}`;

      if (exportPeriodMode === 'custom') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(exportStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(exportEndDate)) {
          Alert.alert(t('settings.exportDataTitle'), t('settings.exportCustomInvalid'));
          return;
        }

        const start = parseExportDateValue(exportStartDate);
        const end = parseExportDateValue(exportEndDate);
        if (!start || !end || start.getTime() > end.getTime()) {
          Alert.alert(t('settings.exportDataTitle'), t('settings.exportCustomInvalid'));
          return;
        }
      }

      const exportResult = await withAuthorizedRequest((accessToken) =>
        requestCsvExport(accessToken, {
          scope: exportScope,
          month: exportPeriodMode === 'month' ? selectedMonth : undefined,
          startDate: exportPeriodMode === 'custom' ? exportStartDate : undefined,
          endDate: exportPeriodMode === 'custom' ? exportEndDate : undefined,
          language: language.startsWith('id') ? 'id' : 'en',
        })
      );

      if (exportResult.recordCount <= 0) {
        Alert.alert(t('settings.exportDataTitle'), t('settings.exportEmpty'));
        return;
      }

      await saveCsvExport(exportResult.csv, exportResult.fileName);

      Alert.alert(
        t('settings.exportDataTitle'),
        exportResult.partial ? t('settings.exportPartial') : t('settings.exportSuccess')
      );
      setExportModalOpen(false);
    } catch (error) {
      console.error('Failed to export CSV', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'missing_session') {
        return;
      }

      Alert.alert(t('settings.exportDataTitle'), message === 'sharing_unavailable' ? t('settings.exportSuccess') : t('settings.exportError'));
    } finally {
      setExportingCsv(false);
    }
  }, [
    exportEndDate,
    exportMonthPickerState.monthIndex,
    exportMonthPickerState.year,
    exportPeriodMode,
    exportScope,
    exportStartDate,
    exportingCsv,
    language,
    saveCsvExport,
    t,
    withAuthorizedRequest,
  ]);

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
              icon="target"
              title={t('settings.budgetGoals')}
              subtitle={t('settings.budgetGoalsMeta')}
              iconTone="primary"
              onPress={() => router.push('/budgets')}
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
          <Text style={styles.sectionTitle}>{t('settings.exportData')}</Text>
          <View style={styles.preferenceBlock}>
            <SettingsRow
              colors={colors}
              icon="download-outline"
              title={t('settings.exportDataTitle')}
              subtitle={t('settings.exportDataMeta')}
              iconTone="primary"
              onPress={() => openExportModal()}
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />}
              style={styles.preferenceRow}
            />
          </View>
        </View>

        <Modal transparent visible={exportModalOpen} animationType="fade" onRequestClose={closeExportModal}>
          <Pressable style={styles.exportOverlay} onPress={closeExportModal}>
            <Pressable style={styles.exportSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.exportSheetTitle}>{t('settings.exportDataTitle')}</Text>
              <Text style={styles.exportSheetBody}>{t('settings.exportDataMeta')}</Text>

              <View style={styles.exportSection}>
                <Text style={styles.exportSectionLabel}>{t('settings.exportScope')}</Text>
                <View style={styles.exportSegment}>
                  <Pressable
                    onPress={() => setExportScope('transactions')}
                    style={[
                      styles.exportPill,
                      exportScope === 'transactions' && styles.exportPillActive,
                    ]}>
                    <Text
                      style={[
                        styles.exportPillText,
                        exportScope === 'transactions' && styles.exportPillTextActive,
                      ]}>
                      {t('settings.exportScopeTransactions')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExportScope('debts')}
                    style={[styles.exportPill, exportScope === 'debts' && styles.exportPillActive]}>
                    <Text
                      style={[styles.exportPillText, exportScope === 'debts' && styles.exportPillTextActive]}>
                      {t('settings.exportScopeDebts')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExportScope('reports')}
                    style={[styles.exportPill, exportScope === 'reports' && styles.exportPillActive]}>
                    <Text
                      style={[styles.exportPillText, exportScope === 'reports' && styles.exportPillTextActive]}>
                      {t('settings.exportScopeReports')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.exportSection}>
                <Text style={styles.exportSectionLabel}>{t('settings.exportPeriod')}</Text>
                <View style={styles.exportSegment}>
                  <Pressable
                    onPress={() => setExportPeriodMode('month')}
                    style={[
                      styles.exportPill,
                      exportPeriodMode === 'month' && styles.exportPillActive,
                    ]}>
                    <Text
                      style={[
                        styles.exportPillText,
                        exportPeriodMode === 'month' && styles.exportPillTextActive,
                      ]}>
                      {t('settings.exportPeriodMonth')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExportPeriodMode('custom')}
                    style={[
                      styles.exportPill,
                      exportPeriodMode === 'custom' && styles.exportPillActive,
                    ]}>
                    <Text
                      style={[
                        styles.exportPillText,
                        exportPeriodMode === 'custom' && styles.exportPillTextActive,
                      ]}>
                      {t('settings.exportPeriodCustom')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {exportPeriodMode === 'month' ? (
                <>
                  <View style={styles.exportYearRow}>
                    <Pressable
                      onPress={() =>
                        setExportMonthPickerState((current) => ({
                          ...current,
                          year: current.year - 1,
                        }))
                      }
                      style={styles.exportYearButton}>
                      <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.exportYearText}>{exportMonthPickerState.year}</Text>
                    <Pressable
                      onPress={() =>
                        setExportMonthPickerState((current) => ({
                          ...current,
                          year: current.year + 1,
                        }))
                      }
                      style={styles.exportYearButton}>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.exportMonthGrid}>
                    {MONTH_INDEXES.map((monthIndex) => {
                      const selected = exportMonthPickerState.monthIndex === monthIndex;
                      const monthLabel = formatExportMonthChipLabel(monthIndex, locale);

                      return (
                        <Pressable
                          key={monthIndex}
                          onPress={() =>
                            setExportMonthPickerState((current) => ({
                              ...current,
                              monthIndex,
                            }))
                          }
                          style={[
                            styles.exportMonthChip,
                            selected && {
                              backgroundColor: alpha(colors.primary, 0.12),
                              borderColor: alpha(colors.primary, 0.28),
                            },
                          ]}>
                          <Text style={[styles.exportMonthChipText, selected && { color: colors.primary }]}>
                            {monthLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <View style={styles.exportRangeGrid}>
                  <View style={styles.exportField}>
                    <Text style={styles.exportFieldLabel}>{t('settings.exportStartDate')}</Text>
                    <Pressable
                      onPress={() => openExportCustomDatePicker('startDate')}
                      style={({ pressed }) => [styles.exportPickerShell, pressed && styles.exportPickerPressed]}>
                      <View style={styles.exportPickerIcon}>
                        <MaterialCommunityIcons name="calendar-start-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.exportPickerCopy}>
                        <Text style={styles.exportPickerValue}>
                          {exportStartDate ? formatExportDateLabel(exportStartDate, locale) : t('reports.filter.startDatePlaceholder')}
                        </Text>
                        <Text style={styles.exportPickerMeta}>{t('reports.filter.dateHelper')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                    </Pressable>
                  </View>

                  <View style={styles.exportField}>
                    <Text style={styles.exportFieldLabel}>{t('settings.exportEndDate')}</Text>
                    <Pressable
                      onPress={() => openExportCustomDatePicker('endDate')}
                      style={({ pressed }) => [styles.exportPickerShell, pressed && styles.exportPickerPressed]}>
                      <View style={styles.exportPickerIcon}>
                        <MaterialCommunityIcons name="calendar-end-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.exportPickerCopy}>
                        <Text style={styles.exportPickerValue}>
                          {exportEndDate ? formatExportDateLabel(exportEndDate, locale) : t('reports.filter.endDatePlaceholder')}
                        </Text>
                        <Text style={styles.exportPickerMeta}>{t('reports.filter.dateHelper')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                    </Pressable>
                  </View>

                  {Platform.OS === 'ios' && iosExportDatePickerVisible && exportDateTarget ? (
                    <View style={styles.exportDatePickerCard}>
                      <DateTimePicker
                        value={
                          parseExportDateValue(exportDateTarget === 'startDate' ? exportStartDate : exportEndDate) ??
                          new Date()
                        }
                        mode="date"
                        display="spinner"
                        onChange={handleExportCustomDateChange}
                        accentColor={colors.primary}
                        themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
                      />
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.exportActions}>
                <Pressable onPress={closeExportModal} style={styles.exportSecondaryButton}>
                  <Text style={styles.exportSecondaryButtonText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleExportCsv()}
                  disabled={exportingCsv}
                  style={({ pressed }) => [
                    styles.exportPrimaryButton,
                    pressed && !exportingCsv && styles.exportPrimaryButtonPressed,
                    exportingCsv && styles.exportPrimaryButtonDisabled,
                  ]}>
                  {exportingCsv ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.exportPrimaryButtonText}>{t('settings.exportAction')}</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

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
    exportOverlay: {
      flex: 1,
      backgroundColor: alpha(colors.background, 0.72),
      padding: 18,
      justifyContent: 'center',
    },
    exportSheet: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 18,
      gap: 14,
    },
    exportSheetTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '900',
    },
    exportSheetBody: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
    },
    exportSection: {
      gap: 10,
    },
    exportSectionLabel: {
      color: colors.primary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    exportSegment: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    exportPill: {
      minHeight: 38,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportPillActive: {
      backgroundColor: colors.primary,
    },
    exportPillText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
    },
    exportPillTextActive: {
      color: colors.onPrimary,
    },
    exportField: {
      gap: 8,
    },
    exportYearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    exportYearButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportYearText: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    exportMonthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    exportMonthChip: {
      flexGrow: 1,
      flexBasis: '22%',
      minWidth: 72,
      minHeight: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    exportMonthChipText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    exportRangeGrid: {
      gap: 12,
    },
    exportFieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    exportInputShell: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    exportInput: {
      flex: 1,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 0,
    },
    exportPickerShell: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    exportPickerPressed: {
      opacity: 0.9,
    },
    exportPickerIcon: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportPickerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    exportPickerValue: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    exportPickerMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
    },
    exportDatePickerCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    exportActions: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
    },
    exportSecondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportSecondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    exportPrimaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportPrimaryButtonPressed: {
      opacity: 0.92,
    },
    exportPrimaryButtonDisabled: {
      opacity: 0.72,
    },
    exportPrimaryButtonText: {
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
