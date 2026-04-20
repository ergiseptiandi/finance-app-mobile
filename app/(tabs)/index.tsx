import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardSkeleton } from '@/components/ui/skeleton';
import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import {
  DailySpendingItem,
  DashboardComparisonData,
  DashboardSummaryData,
  getComparison,
  getDailySpending,
  getDashboardSummary,
  getMonthlySpending,
  MonthlySpendingItem,
  type DashboardPeriodParams,
} from '@/lib/api/dashboard';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';

type TrendMode = 'daily' | 'monthly';
type DashboardDateFilterMode = 'month' | 'range';

type TrendPoint = {
  label: string;
  value: number;
  active?: boolean;
};

type ActivityItem = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  meta: string;
  amount: string;
  kind: string;
  positive?: boolean;
};

type DashboardFilters = {
  dateMode: DashboardDateFilterMode;
  month: string;
  startDate: string;
  endDate: string;
};

type MonthPickerState = {
  year: number;
  monthIndex: number;
};

type DashboardCacheState = {
  summary: DashboardSummaryData | null;
  dailySpending: DailySpendingItem[];
  monthlySpending: MonthlySpendingItem[];
  comparison: DashboardComparisonData | null;
  displayName: string;
};

const MONTH_INPUT_PATTERN = /^\d{4}-\d{2}$/;
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getCurrentMonthInputValue = () => new Date().toISOString().slice(0, 7);

const getMonthPickerStateFromInput = (value: string): MonthPickerState => {
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

const createDefaultDashboardFilters = (): DashboardFilters => ({
  dateMode: 'month',
  month: getCurrentMonthInputValue(),
  startDate: '',
  endDate: '',
});

const buildDashboardQueryParams = (filters: DashboardFilters): DashboardPeriodParams => {
  if (filters.dateMode === 'month') {
    return {
      month: filters.month,
    };
  }

  return {
    start_date: filters.startDate,
    end_date: filters.endDate,
  };
};

const createDashboardCacheSuffix = (filters: DashboardFilters) =>
  [
    filters.dateMode,
    filters.month,
    filters.startDate,
    filters.endDate,
  ].join('|');

const formatCompactCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);

const formatDetailCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const formatSignedCurrency = (value: number, locale: string) => {
  const formatted = formatDetailCurrency(Math.abs(value), locale);
  return value >= 0 ? formatted : `-${formatted}`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const toNumber = (value: unknown) => {
  const nextValue = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const parseDateValue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const toPickerDate = (value: string) => {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return new Date();
  }

  return parsed;
};

const toDateInputLabel = (value: string, locale: string) => {
  const parsed = toPickerDate(value);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

const toMonthInputLabel = (value: string, locale: string) => {
  if (!MONTH_INPUT_PATTERN.test(value)) {
    return value;
  }

  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index);

const getFilterRangeMonths = (startDate: string, endDate: string) => {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);

  if (!start || !end) {
    return Number.POSITIVE_INFINITY;
  }

  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
};

const getDashboardFilterLabel = (filters: DashboardFilters, locale: string) => {
  if (filters.dateMode === 'month') {
    return toMonthInputLabel(filters.month, locale);
  }

  if (!DATE_INPUT_PATTERN.test(filters.startDate) || !DATE_INPUT_PATTERN.test(filters.endDate)) {
    return '';
  }

  return `${toDateInputLabel(filters.startDate, locale)} - ${toDateInputLabel(filters.endDate, locale)}`;
};

const toDashboardFilterPickerValue = (filters: DashboardFilters, target: 'month' | 'startDate' | 'endDate') => {
  if (target === 'month') {
    return toPickerDate(`${filters.month}-01`);
  }

  if (target === 'startDate') {
    return toPickerDate(filters.startDate);
  }

  return toPickerDate(filters.endDate);
};

const toDayLabel = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
  }).format(date);
};

const toShortMonth = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
  })
    .format(date)
    .toUpperCase();
};

const extractComparisonValue = (data: DashboardComparisonData | null, keys: string[]) => {
  if (!data) {
    return 0;
  }

  for (const key of keys) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const formatExpenseCurrency = (value: number, locale: string) => {
  if (value <= 0) {
    return formatDetailCurrency(0, locale);
  }

  return formatSignedCurrency(-Math.abs(value), locale);
};

const formatPercentValue = (value: number) => `${Math.round(value)}%`;

export default function DashboardScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, width, insets.top);
  const [trendMode, setTrendMode] = useState<TrendMode>('monthly');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [dailySpending, setDailySpending] = useState<DailySpendingItem[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpendingItem[]>([]);
  const [comparison, setComparison] = useState<DashboardComparisonData | null>(null);
  const [displayName, setDisplayName] = useState('Kinetic Pulse');
  const [filters, setFilters] = useState<DashboardFilters>(createDefaultDashboardFilters);
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(createDefaultDashboardFilters);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [monthPickerState, setMonthPickerState] = useState<MonthPickerState>(() =>
    getMonthPickerStateFromInput(createDefaultDashboardFilters().month)
  );
  const [iosFilterDatePickerVisible, setIosFilterDatePickerVisible] = useState(false);
  const [filterDateTarget, setFilterDateTarget] = useState<'startDate' | 'endDate' | null>(null);
  const filtersRef = useRef<DashboardFilters>(createDefaultDashboardFilters());
  const hasDashboardSnapshot = Boolean(summary || comparison || dailySpending.length || monthlySpending.length);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    let active = true;

    const hydrateDashboardCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const nextDisplayName = session.user.name || 'Kinetic Pulse';
      setDisplayName(nextDisplayName);

      const cached = await readScreenCache<DashboardCacheState>(
        buildScreenCacheKey('dashboard', session.user.id, createDashboardCacheSuffix(filtersRef.current))
      );

      if (!cached || !active) {
        return;
      }

      setSummary(cached.data.summary);
      setDailySpending(cached.data.dailySpending);
      setMonthlySpending(cached.data.monthlySpending);
      setComparison(cached.data.comparison);
      setDisplayName(cached.data.displayName || nextDisplayName);
      setLoading(false);
    };

    hydrateDashboardCache();

    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(
    async (
      isRefresh = false,
      appliedFilters: DashboardFilters = filtersRef.current,
      forceLoading = false
    ) => {
      const shouldShowSkeleton = forceLoading || (!isRefresh && !hasDashboardSnapshot);

      if (isRefresh) {
        setRefreshing(true);
      } else if (shouldShowSkeleton) {
        setLoading(true);
      }

      setError('');

      try {
        const session = await getAuthSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        const nextDisplayName = session.user.name || 'Kinetic Pulse';
        setDisplayName(nextDisplayName);
        const dashboardParams = buildDashboardQueryParams(appliedFilters);
        const cacheSuffix = createDashboardCacheSuffix(appliedFilters);

        const fetchBundle = async (accessToken: string) =>
          Promise.allSettled([
            getDashboardSummary(accessToken, dashboardParams),
            getDailySpending(accessToken, dashboardParams),
            getMonthlySpending(accessToken, dashboardParams),
            getComparison(accessToken),
          ]);

        let results = await fetchBundle(session.token.access_token);

        const hasUnauthorized = results.some(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof ApiRequestError &&
            result.reason.status === 401
        );

        if (hasUnauthorized && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) {
            results = await fetchBundle(refreshed.token.access_token);
          }
        }

        const [summaryResult, dailyResult, monthlyResult, comparisonResult] = results;
        const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value.Data : summary;
        const nextDailySpending =
          dailyResult.status === 'fulfilled' ? dailyResult.value.Data : dailySpending;
        const nextMonthlySpending =
          monthlyResult.status === 'fulfilled' ? monthlyResult.value.Data : monthlySpending;
        const nextComparison =
          comparisonResult.status === 'fulfilled' ? comparisonResult.value.Data : comparison;

        if (summaryResult.status === 'fulfilled') {
          setSummary(nextSummary);
        }

        if (dailyResult.status === 'fulfilled') {
          setDailySpending(nextDailySpending);
        }

        if (monthlyResult.status === 'fulfilled') {
          setMonthlySpending(nextMonthlySpending);
        }

        if (comparisonResult.status === 'fulfilled') {
          setComparison(nextComparison);
        }

        await writeScreenCache(buildScreenCacheKey('dashboard', session.user.id, cacheSuffix), {
          summary: nextSummary,
          dailySpending: nextDailySpending,
          monthlySpending: nextMonthlySpending,
          comparison: nextComparison,
          displayName: nextDisplayName,
        });

        const hasHardFailure = results.some(
          (result) =>
            result.status === 'rejected' &&
            !(result.reason instanceof ApiRequestError && result.reason.status === 401)
        );

        if (hasHardFailure) {
          setError(t('dashboard.partialError'));
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          router.replace('/login');
          return;
        }

        setError(t('dashboard.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [comparison, dailySpending, hasDashboardSnapshot, monthlySpending, summary, t]
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(false, filtersRef.current);
    }, [loadDashboard])
  );

  const openFilterModal = useCallback(() => {
    setDraftFilters(filters);
    setFilterError('');
    setFilterDateTarget(null);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(true);
  }, [filters]);

  const closeFilterModal = useCallback(() => {
    setFilterModalVisible(false);
    setFilterError('');
    setFilterDateTarget(null);
    setMonthPickerVisible(false);
    setIosFilterDatePickerVisible(false);
  }, []);

  const openMonthPicker = useCallback(() => {
    setMonthPickerState(getMonthPickerStateFromInput(draftFilters.month));
    setMonthPickerVisible(true);
  }, [draftFilters.month]);

  const closeMonthPicker = useCallback(() => {
    setMonthPickerVisible(false);
  }, []);

  const applyMonthPicker = useCallback(() => {
    const nextMonth = `${String(monthPickerState.year).padStart(4, '0')}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}`;
    setDraftFilters((current) => ({
      ...current,
      month: nextMonth,
    }));
    setMonthPickerVisible(false);
  }, [monthPickerState.monthIndex, monthPickerState.year]);

  const handleFilterDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android' && event.type === 'dismissed') {
        return;
      }

      if (!selectedDate || !filterDateTarget) {
        return;
      }

      setDraftFilters((current) => ({
        ...current,
        [filterDateTarget]: selectedDate.toISOString().slice(0, 10),
      }));
    },
    [filterDateTarget]
  );

  const openFilterDatePicker = useCallback(
    (target: 'startDate' | 'endDate') => {
      const currentDate = toDashboardFilterPickerValue(draftFilters, target);
      setFilterDateTarget(target);

      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: currentDate,
          mode: 'date',
          onChange: handleFilterDateChange,
        });
        return;
      }

      setIosFilterDatePickerVisible(true);
    },
    [draftFilters, handleFilterDateChange]
  );

  const resetFilters = useCallback(() => {
    const nextFilters = createDefaultDashboardFilters();
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setFilterDateTarget(null);
    setMonthPickerVisible(false);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(false);
    void loadDashboard(false, nextFilters, true);
  }, [loadDashboard]);

  const applyFilters = useCallback(() => {
    if (draftFilters.dateMode === 'month') {
      if (!MONTH_INPUT_PATTERN.test(draftFilters.month)) {
        setFilterError(t('dashboard.filter.monthInvalid'));
        return;
      }
    } else {
      if (!DATE_INPUT_PATTERN.test(draftFilters.startDate) || !DATE_INPUT_PATTERN.test(draftFilters.endDate)) {
        setFilterError(t('dashboard.filter.rangeRequired'));
        return;
      }

      const start = parseDateValue(draftFilters.startDate);
      const end = parseDateValue(draftFilters.endDate);

      if (!start || !end || start.getTime() > end.getTime()) {
        setFilterError(t('dashboard.filter.rangeInvalid'));
        return;
      }

      if (getFilterRangeMonths(draftFilters.startDate, draftFilters.endDate) > 2) {
        setFilterError(t('dashboard.filter.rangeTooLong'));
        return;
      }
    }

    const nextFilters = {
      ...draftFilters,
      month: draftFilters.dateMode === 'month' ? draftFilters.month : '',
      startDate: draftFilters.dateMode === 'range' ? draftFilters.startDate : '',
      endDate: draftFilters.dateMode === 'range' ? draftFilters.endDate : '',
    };

    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setFilterDateTarget(null);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(false);
    void loadDashboard(false, nextFilters, true);
  }, [draftFilters, loadDashboard, t]);

  const currentBalance = toNumber(summary?.total_balance);
  const monthlyIncome = toNumber(summary?.monthly_income);
  const monthlyExpense = toNumber(summary?.monthly_expense);
  const netCashflow = toNumber(summary?.net_cashflow ?? monthlyIncome - monthlyExpense);
  const savingsRate = toNumber(
    summary?.savings_rate ?? (monthlyIncome > 0 ? (netCashflow / monthlyIncome) * 100 : 0)
  );
  const expenseRatio = toNumber(
    summary?.expense_ratio ?? (monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0)
  );
  const dashboardDebt = summary?.debt ?? null;
  const remainingDebt = toNumber(dashboardDebt?.remaining_debt);
  const totalDebt = toNumber(dashboardDebt?.total_debt);
  const debtToIncome = toNumber(
    dashboardDebt?.debt_to_income_ratio ??
    (monthlyIncome > 0 ? (remainingDebt / monthlyIncome) * 100 : 0)
  );
  const debtToBalance = toNumber(
    dashboardDebt?.debt_to_balance_ratio ??
    (currentBalance > 0 ? (remainingDebt / currentBalance) * 100 : 0)
  );
  const debtCompletion = toNumber(dashboardDebt?.completion_rate);
  const todayExpense = extractComparisonValue(comparison, ['today_expense', 'today', 'todayAmount']);
  const yesterdayExpense = extractComparisonValue(comparison, [
    'yesterday_expense',
    'yesterday',
    'yesterdayAmount',
  ]);
  const thisMonthExpense = extractComparisonValue(comparison, [
    'this_month_expense',
    'thisMonth',
    'this_month',
  ]);
  const lastMonthExpense = extractComparisonValue(comparison, [
    'last_month_expense',
    'lastMonth',
    'last_month',
  ]);

  const monthlyMomentum =
    lastMonthExpense > 0
      ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100
      : thisMonthExpense > 0
        ? 100
        : 0;
  const momentumPrefix = monthlyMomentum > 0 ? '+' : '';
  const momentumIcon = monthlyMomentum >= 0 ? 'trending-up' : 'trending-down';
  const activePeriodLabel = getDashboardFilterLabel(filters, locale) || t('dashboard.filter.currentPeriod');
  const filterModeLabel =
    filters.dateMode === 'month' ? t('dashboard.filter.monthMode') : t('dashboard.filter.rangeMode');
  const dashboardAlert = summary?.alerts?.[0] ?? null;

  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (trendMode === 'daily' && dailySpending.length > 0) {
      return dailySpending.slice(-7).map((item, index, items) => ({
        label: toDayLabel(item.date, `D${index + 1}`, locale),
        value: toNumber(item.amount),
        active: index === items.length - 1,
      }));
    }

    if (monthlySpending.length > 0) {
      return monthlySpending.slice(-7).map((item, index, items) => ({
        label: toShortMonth(String(item.date ?? item.month ?? item.label ?? ''), `M${index + 1}`, locale),
        value: toNumber(item.amount),
        active: index === items.length - 2 || index === items.length - 1,
      }));
    }

    return [];
  }, [dailySpending, locale, monthlySpending, trendMode]);

  const trendPeak = Math.max(...trendPoints.map((item) => item.value), 1);
  const liquidProgress = clampPercent(savingsRate > 0 ? savingsRate : 12);

  const insightTitle = dashboardAlert?.title ?? t('dashboard.summaryInsightTitle');
  const insightBody =
    dashboardAlert?.message ??
    (summary
      ? `Cashflow bersih ${formatSignedCurrency(netCashflow, locale)} dengan expense ratio ${formatPercentValue(
        Math.max(0, expenseRatio)
      )}.`
      : t('dashboard.summaryInsightBody'));

  const activityItems = useMemo<ActivityItem[]>(
    () => [
      {
        icon: 'calendar-today',
        title: t('dashboard.activity.todayExpense'),
        meta: t('dashboard.activity.todayExpenseMeta'),
        amount: formatExpenseCurrency(todayExpense, locale),
        kind: t('dashboard.activity.expense'),
      },
      {
        icon: 'history',
        title: t('dashboard.activity.yesterdayExpense'),
        meta: t('dashboard.activity.yesterdayExpenseMeta'),
        amount: formatExpenseCurrency(yesterdayExpense, locale),
        kind: t('dashboard.activity.expense'),
      },
      {
        icon: 'calendar-month-outline',
        title: t('dashboard.activity.periodExpense', { period: activePeriodLabel }),
        meta: t('dashboard.activity.periodExpenseMeta'),
        amount: formatExpenseCurrency(monthlyExpense, locale),
        kind: t('dashboard.activity.expense'),
      },
    ],
    [activePeriodLabel, locale, monthlyExpense, t, todayExpense, yesterdayExpense]
  );

  const summaryHighlights = useMemo(
    () => [
      {
        label: t('dashboard.summary.balance'),
        value: formatCompactCurrency(currentBalance, locale),
        meta: t('dashboard.summary.balanceMeta'),
      },
      {
        label: t('dashboard.summary.income'),
        value: formatCompactCurrency(monthlyIncome, locale),
        meta: t('dashboard.summary.incomeMeta'),
      },
      {
        label: t('dashboard.summary.expense'),
        value: formatCompactCurrency(monthlyExpense, locale),
        meta: t('dashboard.summary.expenseMeta'),
      },
      {
        label: t('dashboard.summary.cashflow'),
        value: formatSignedCurrency(netCashflow, locale),
        meta: t('dashboard.summary.cashflowMeta'),
      },
    ],
    [currentBalance, locale, monthlyExpense, monthlyIncome, netCashflow, t]
  );

  return (
    <View style={styles.root}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadDashboard(true, filtersRef.current);
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandBlock}>
            <View style={styles.brandAvatar}>
              <MaterialCommunityIcons name="account-circle" size={20} color={colors.primary} />
            </View>
            <Text numberOfLines={1} style={styles.brandName}>
              {displayName}
            </Text>
          </View>

          <Pressable style={styles.iconButton}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={colors.shellTextPrimary} />
          </Pressable>
        </View>

        {loading ? (
          <DashboardSkeleton colors={colors} />
        ) : (
          <>
            <View style={styles.heroBlock}>
              <Text style={styles.kicker}>{t('dashboard.kicker')}</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.62}
                style={styles.heroAmount}>
                {formatCompactCurrency(currentBalance, locale)}
              </Text>

              <View style={styles.momentumRow}>
                <View style={styles.momentumBadge}>
                  <MaterialCommunityIcons name={momentumIcon} size={12} color={colors.secondaryAccent} />
                  <Text style={styles.momentumBadgeText}>
                    {momentumPrefix}
                    {monthlyMomentum.toFixed(1)}%{' '}
                    {filters.dateMode === 'month' ? t('dashboard.thisMonth') : t('dashboard.filter.currentPeriod')}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.momentumHint}>
                  {t('dashboard.vsLastQuarterPeak')}
                </Text>
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.filterCardHeader}>
                <View style={styles.filterCardCopy}>
                  <Text style={styles.filterCardKicker}>{t('dashboard.filter.kicker')}</Text>
                  <Text numberOfLines={1} style={styles.filterCardTitle}>
                    {activePeriodLabel}
                  </Text>
                  <Text style={styles.filterCardMeta}>{filterModeLabel}</Text>
                </View>

                <Pressable onPress={openFilterModal} style={styles.filterCardAction}>
                  <MaterialCommunityIcons name="tune-variant" size={16} color={colors.onPrimary} />
                  <Text style={styles.filterCardActionText}>{t('dashboard.filter.action')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.liquidCard}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.cardEyebrow}>{t('dashboard.liquidCashFlow')}</Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={styles.liquidAmount}>
                    {formatSignedCurrency(netCashflow, locale)}
                  </Text>
                </View>
                <View style={styles.cardIconShell}>
                  <MaterialCommunityIcons name="wallet-plus-outline" size={18} color={isDark ? colors.secondaryAccent : colors.warning} />
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFillPrimary, { width: `${liquidProgress}%` }]} />
              </View>

              <View style={styles.liquidMetaRow}>
                <Text style={styles.cardMeta}>
                  {t('dashboard.opEx')}: {formatCompactCurrency(monthlyExpense, locale)}
                </Text>
                <Text style={styles.cardMeta}>
                  {t('dashboard.burn')}: {formatPercentValue(Math.max(0, expenseRatio))}
                </Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('dashboard.summary.title')}</Text>
                  <Text style={styles.cardTitle}>{activePeriodLabel}</Text>
                </View>
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeLabel}>{t('dashboard.filter.currentPeriod')}</Text>
                </View>
              </View>

              <View style={styles.summaryGrid}>
                {summaryHighlights.map((item) => (
                  <View key={item.label} style={styles.summaryMetric}>
                    <Text style={styles.summaryMetricLabel}>
                      {item.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      style={styles.summaryMetricValue}>
                      {item.value}
                    </Text>
                    <Text style={styles.summaryMetricMeta}>
                      {item.meta}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.summaryStatsRow}>
                <View style={styles.summaryStatPill}>
                  <Text style={styles.summaryStatLabel}>{t('dashboard.summary.savingsRate')}</Text>
                  <Text style={styles.summaryStatValue}>{formatPercentValue(Math.max(0, savingsRate))}</Text>
                </View>
                <View style={styles.summaryStatPill}>
                  <Text style={styles.summaryStatLabel}>{t('dashboard.summary.debtLoad')}</Text>
                  <Text style={styles.summaryStatValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('dashboard.spendingTrends')}</Text>
                <View style={styles.segmentedControl}>
                  <Pressable
                    onPress={() => setTrendMode('daily')}
                    style={[styles.segmentButton, trendMode === 'daily' && styles.segmentButtonMuted]}>
                    <Text style={[styles.segmentLabel, trendMode === 'daily' && styles.segmentLabelActive]}>
                      {t('dashboard.daily')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTrendMode('monthly')}
                    style={[styles.segmentButton, trendMode === 'monthly' && styles.segmentButtonActive]}>
                    <Text style={[styles.segmentLabel, trendMode === 'monthly' && styles.segmentLabelSelected]}>
                      {t('dashboard.monthly')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.trendChart}>
                {trendPoints.length > 0 ? (
                  trendPoints.map((point) => (
                    <View key={`${point.label}-${point.value}`} style={styles.trendItem}>
                      <View
                        style={[
                          styles.trendBar,
                          { height: `${Math.max(26, (point.value / trendPeak) * 100)}%` },
                          point.active && styles.trendBarActive,
                        ]}
                      />
                      <Text numberOfLines={1} style={styles.trendLabel}>
                        {point.label}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.trendEmpty}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={22} color={colors.shellTextMuted} />
                    <Text style={styles.trendEmptyTitle}>{t('dashboard.noTrendData')}</Text>
                    <Text style={styles.trendEmptyMeta}>{t('dashboard.noTrendDataBody')}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.debtIconWrap}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.danger} />
              </View>
              <Text style={styles.cardTitle}>{t('dashboard.debtHealth')}</Text>
              <Text style={styles.cardDescription}>
                {dashboardDebt
                  ? t('dashboard.debtHealthBody', {
                    remaining: formatCompactCurrency(remainingDebt, locale),
                    total: formatCompactCurrency(totalDebt, locale),
                    percent: formatPercentValue(Math.max(0, debtCompletion || debtToIncome)),
                  })
                  : t('dashboard.noDebtData')}
              </Text>

              <View style={styles.metricCard}>
                <Text style={styles.cardEyebrow}>{t('dashboard.leverageRatio')}</Text>
                <Text style={styles.metricValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
                <Text style={styles.metricMeta}>{t('dashboard.debtBalanceRatio', { percent: formatPercentValue(Math.max(0, debtToBalance)) })}</Text>
              </View>

              <Pressable
                onPress={() => {
                  router.replace('/debt');
                }}
                style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>{t('dashboard.consolidate')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{t('dashboard.kineticActivity')}</Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    router.replace('/activity');
                  }}>
                  <Text style={styles.linkText}>{t('dashboard.viewLedger')}</Text>
                </Pressable>
              </View>

              <View style={styles.activityList}>
                {activityItems.map((item) => (
                  <View key={`${item.title}-${item.amount}`} style={styles.activityItem}>
                    <View style={styles.activityLeft}>
                      <View style={styles.activityIconWrap}>
                        <MaterialCommunityIcons
                          name={item.icon}
                          size={18}
                          color={item.positive ? colors.secondaryAccent : colors.primary}
                        />
                      </View>
                      <View style={styles.activityCopy}>
                        <Text numberOfLines={2} style={styles.activityTitle}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={2} style={styles.activityMeta}>
                          {item.meta}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.activityRight}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={[styles.activityAmount, item.positive && styles.activityAmountPositive]}>
                        {item.amount}
                      </Text>
                      <Text numberOfLines={1} style={styles.activityKind}>
                        {item.kind}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.insightCard}>
              <Text style={styles.insightBadge}>{t('dashboard.pulseInsight')}</Text>
              <Text style={styles.insightTitle}>{insightTitle}</Text>
              <Text style={styles.insightText}>{insightBody}</Text>
              <Pressable
                onPress={() => {
                  router.replace('/reports');
                }}
                style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>{t('dashboard.optimizeStrategy')}</Text>
              </Pressable>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>

      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeFilterModal}>
        <KeyboardAvoidingView
          style={styles.filterModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
          <View style={styles.filterModalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeFilterModal} />
            <View style={styles.filterModalSheet}>
              <View style={styles.filterModalHandle} />
              <View style={styles.filterModalBody}>
                <View style={styles.filterModalHeader}>
                  <View style={styles.filterModalHeaderCopy}>
                    <Text style={styles.filterModalKicker}>{t('dashboard.filter.kicker')}</Text>
                    <Text style={styles.filterModalTitle}>{t('dashboard.filter.title')}</Text>
                    <Text style={styles.filterModalSubtitle}>{t('dashboard.filter.helper')}</Text>
                  </View>
                  <Pressable onPress={closeFilterModal} style={styles.filterModalClose}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.filterModalScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.filterModalContent}>
                  <View style={styles.filterSectionCard}>
                    <View style={styles.filterSectionHeader}>
                      <View style={styles.filterSectionIcon}>
                        <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.filterSectionCopy}>
                        <Text style={styles.filterSectionTitle}>{t('dashboard.filter.dateTitle')}</Text>
                        <Text style={styles.filterSectionSubtitle}>{t('dashboard.filter.dateHelper')}</Text>
                      </View>
                    </View>

                    <View style={styles.filterModeRow}>
                      {(['month', 'range'] as DashboardDateFilterMode[]).map((mode) => {
                        const active = draftFilters.dateMode === mode;

                        return (
                          <Pressable
                            key={mode}
                            onPress={() =>
                              setDraftFilters((current) => ({
                                ...current,
                                dateMode: mode,
                                month: mode === 'month' ? current.month || getCurrentMonthInputValue() : current.month,
                                startDate: mode === 'range' ? current.startDate : '',
                                endDate: mode === 'range' ? current.endDate : '',
                              }))
                            }
                            style={[
                              styles.filterModeButton,
                              active && {
                                backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.1),
                                borderColor: alpha(colors.primary, isDark ? 0.38 : 0.28),
                              },
                            ]}>
                            <View
                              style={[
                                styles.filterModeIcon,
                                { backgroundColor: active ? alpha(colors.primary, 0.16) : colors.shellCardMuted },
                              ]}>
                              <MaterialCommunityIcons
                                name={mode === 'month' ? 'calendar-month-outline' : 'calendar-range-outline'}
                                size={16}
                                color={active ? colors.primary : colors.shellTextMuted}
                              />
                            </View>
                            <Text style={[styles.filterModeLabel, active && { color: colors.primary }]}>
                              {mode === 'month' ? t('dashboard.filter.monthMode') : t('dashboard.filter.rangeMode')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {draftFilters.dateMode === 'month' ? (
                      <View style={styles.filterFieldGroup}>
                        <Text style={styles.filterFieldLabel}>{t('dashboard.filter.monthLabel')}</Text>
                        <Pressable
                          onPress={openMonthPicker}
                          style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                          <View style={styles.filterPickerIcon}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.filterPickerCopy}>
                            <Text style={styles.filterPickerValue}>{toMonthInputLabel(draftFilters.month, locale)}</Text>
                            <Text style={styles.filterPickerMeta}>{t('dashboard.filter.monthHelper')}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                        </Pressable>
                        <Text style={styles.filterFieldHelper}>{t('dashboard.filter.monthHelper')}</Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.filterFieldGroup}>
                          <Text style={styles.filterFieldLabel}>{t('dashboard.filter.startDate')}</Text>
                          <Pressable
                            onPress={() => openFilterDatePicker('startDate')}
                            style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                            <View style={styles.filterPickerIcon}>
                              <MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} />
                            </View>
                            <View style={styles.filterPickerCopy}>
                              <Text style={styles.filterPickerValue}>
                                {draftFilters.startDate
                                  ? toDateInputLabel(draftFilters.startDate, locale)
                                  : t('dashboard.filter.startDatePlaceholder')}
                              </Text>
                              <Text style={styles.filterPickerMeta}>{t('dashboard.filter.dateHelper')}</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                          </Pressable>
                        </View>

                        <View style={styles.filterFieldGroup}>
                          <Text style={styles.filterFieldLabel}>{t('dashboard.filter.endDate')}</Text>
                          <Pressable
                            onPress={() => openFilterDatePicker('endDate')}
                            style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                            <View style={styles.filterPickerIcon}>
                              <MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} />
                            </View>
                            <View style={styles.filterPickerCopy}>
                              <Text style={styles.filterPickerValue}>
                                {draftFilters.endDate
                                  ? toDateInputLabel(draftFilters.endDate, locale)
                                  : t('dashboard.filter.endDatePlaceholder')}
                              </Text>
                              <Text style={styles.filterPickerMeta}>{t('dashboard.filter.dateHelper')}</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                          </Pressable>
                        </View>

                        {Platform.OS === 'ios' && iosFilterDatePickerVisible && filterDateTarget ? (
                          <View style={styles.filterDatePickerCard}>
                            <DateTimePicker
                              value={toDashboardFilterPickerValue(draftFilters, filterDateTarget)}
                              mode="date"
                              display="spinner"
                              onChange={handleFilterDateChange}
                              accentColor={colors.primary}
                              themeVariant={isDark ? 'dark' : 'light'}
                            />
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>

                  {!!filterError ? (
                    <View style={styles.filterErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.filterErrorText}>{filterError}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.filterModalFooter}>
                  <View style={styles.filterModalActions}>
                    <Pressable onPress={resetFilters} style={styles.filterSecondaryButton}>
                      <Text style={styles.filterSecondaryButtonText}>{t('dashboard.filter.reset')}</Text>
                    </Pressable>
                    <Pressable onPress={applyFilters} style={styles.filterPrimaryButton}>
                      <Text style={styles.filterPrimaryButtonText}>{t('dashboard.filter.apply')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={monthPickerVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closeMonthPicker}>
        <View style={styles.monthPickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMonthPicker} />
          <View style={styles.monthPickerSheet}>
            <View style={styles.monthPickerHandle} />
            <View style={styles.monthPickerHeader}>
              <View style={styles.monthPickerHeaderCopy}>
                <Text style={styles.monthPickerKicker}>{t('dashboard.filter.monthMode')}</Text>
                <Text style={styles.monthPickerTitle}>{t('dashboard.filter.monthLabel')}</Text>
                <Text style={styles.monthPickerSubtitle}>{t('dashboard.filter.monthHelper')}</Text>
              </View>
              <Pressable onPress={closeMonthPicker} style={styles.monthPickerClose}>
                <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
              </Pressable>
            </View>

            <View style={styles.monthPickerYearRow}>
              <Pressable
                onPress={() =>
                  setMonthPickerState((current) => ({
                    ...current,
                    year: current.year - 1,
                  }))
                }
                style={styles.monthPickerYearButton}>
                <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
              </Pressable>
              <Text style={styles.monthPickerYearText}>{monthPickerState.year}</Text>
              <Pressable
                onPress={() =>
                  setMonthPickerState((current) => ({
                    ...current,
                    year: current.year + 1,
                  }))
                }
                style={styles.monthPickerYearButton}>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.monthPickerGrid}>
              {MONTH_INDEXES.map((monthIndex) => {
                const selected = monthPickerState.monthIndex === monthIndex;
                const monthLabel = new Intl.DateTimeFormat(locale, { month: 'short' })
                  .format(new Date(2020, monthIndex, 1))
                  .replace(/\.$/, '');

                return (
                  <Pressable
                    key={monthIndex}
                    onPress={() =>
                      setMonthPickerState((current) => ({
                        ...current,
                        monthIndex,
                      }))
                    }
                    style={[
                      styles.monthPickerChip,
                      selected && {
                        backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12),
                        borderColor: alpha(colors.primary, isDark ? 0.42 : 0.28),
                      },
                    ]}>
                    <Text style={[styles.monthPickerChipText, selected && { color: colors.primary }]}>
                      {monthLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.monthPickerActions}>
              <Pressable onPress={closeMonthPicker} style={styles.monthPickerSecondaryButton}>
                <Text style={styles.monthPickerSecondaryButtonText}>{t('dashboard.filter.reset')}</Text>
              </Pressable>
              <Pressable onPress={applyMonthPicker} style={styles.monthPickerPrimaryButton}>
                <Text style={styles.monthPickerPrimaryButtonText}>{t('dashboard.filter.apply')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Pressable style={styles.fab}>
        <MaterialCommunityIcons name="plus" size={28} color={colors.shellFabIcon} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, width: number, topInset: number) => {
  const compact = width < 360;
  const isDark = colors.background === Colors.dark.background;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingTop: Math.max(topInset + 14, 28),
      paddingHorizontal: compact ? 16 : 18,
      paddingBottom: 164,
      gap: 20,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    brandBlock: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
    brandName: {
      flex: 1,
      minWidth: 0,
      color: colors.primary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.8,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    loadingState: {
      marginTop: 20,
      borderRadius: 30,
      backgroundColor: colors.shellCard,
      paddingVertical: 48,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    loadingText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    heroBlock: {
      gap: 10,
    },
    filterCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: compact ? 16 : 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    filterCardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    filterCardKicker: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    filterCardTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 18 : 20,
      lineHeight: compact ? 24 : 26,
      fontWeight: '800',
      letterSpacing: -0.7,
    },
    filterCardMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    filterCardAction: {
      flexShrink: 0,
      minHeight: 40,
      borderRadius: 14,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
    },
    filterCardActionText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    kicker: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 3.2,
    },
    heroAmount: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 44 : 56,
      lineHeight: compact ? 48 : 62,
      fontWeight: '900',
      letterSpacing: -2.4,
    },
    momentumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
    },
    momentumBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 16,
      backgroundColor: alpha(colors.secondary, isDark ? 0.28 : 0.12),
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    momentumBadgeText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    momentumHint: {
      flexShrink: 1,
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    card: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: compact ? 18 : 20,
      gap: 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    summaryCard: {
      borderRadius: 28,
      backgroundColor: alpha(colors.primary, isDark ? 0.14 : 0.08),
      padding: compact ? 18 : 20,
      gap: 18,
      borderWidth: 1,
      borderColor: alpha(colors.primary, isDark ? 0.24 : 0.16),
    },
    liquidCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCardStrong,
      padding: compact ? 18 : 20,
      gap: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
    },
    sectionTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    cardEyebrow: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    liquidAmount: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 18 : 20,
      lineHeight: compact ? 22 : 24,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    cardIconShell: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? alpha(colors.secondary, 0.22) : colors.warningSoft,
      borderWidth: 1,
      borderColor: isDark ? alpha(colors.secondary, 0.18) : alpha(colors.warning, 0.2),
      shadowColor: isDark ? colors.background : colors.warningSoft,
      shadowOpacity: isDark ? 0 : 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    progressTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    progressFillPrimary: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    liquidMetaRow: {
      flexDirection: compact ? 'column' : 'row',
      alignItems: compact ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardMeta: {
      flex: 1,
      width: compact ? '100%' : undefined,
      color: colors.shellTextSoft,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    cardTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: compact ? 23 : 25,
      lineHeight: compact ? 30 : 32,
      fontWeight: '800',
      letterSpacing: -1.1,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    summaryBadge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextPrimary, isDark ? 0.12 : 0.08),
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    summaryBadgeLabel: {
      color: colors.shellTextPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    summaryMetric: {
      width: compact ? '100%' : '48%',
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      padding: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    summaryMetricLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      lineHeight: 14,
    },
    summaryMetricValue: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 18 : 20,
      lineHeight: compact ? 24 : 26,
      fontWeight: '900',
      letterSpacing: -0.7,
      width: '100%',
      flexShrink: 1,
      textAlign: 'left',
      includeFontPadding: false,
    },
    summaryMetricMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
      flexShrink: 1,
    },
    summaryStatsRow: {
      flexDirection: compact ? 'column' : 'row',
      gap: 10,
    },
    summaryStatPill: {
      flex: 1,
      width: compact ? '100%' : undefined,
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
      alignItems: 'flex-start',
    },
    summaryStatLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryStatValue: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '900',
    },
    segmentedControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      backgroundColor: colors.shellCardMuted,
      borderRadius: 18,
      padding: 4,
    },
    segmentButton: {
      minWidth: compact ? 56 : 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    segmentButtonMuted: {
      backgroundColor: alpha(colors.shellTextPrimary, isDark ? 0.08 : 0.06),
    },
    segmentButtonActive: {
      backgroundColor: colors.primary,
    },
    segmentLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.shellTextMuted,
    },
    segmentLabelActive: {
      color: colors.shellTextPrimary,
    },
    segmentLabelSelected: {
      color: colors.onPrimary,
    },
    trendChart: {
      height: compact ? 180 : 208,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: compact ? 8 : 10,
      paddingTop: 8,
    },
    trendItem: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
    },
    trendBar: {
      width: '100%',
      minHeight: 34,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      backgroundColor: colors.shellCardMuted,
    },
    trendBarActive: {
      backgroundColor: colors.primary,
      shadowColor: alpha(colors.primary, 0.35),
      shadowOpacity: 1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    trendLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
    },
    trendEmpty: {
      flex: 1,
      minHeight: 160,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 20,
    },
    trendEmptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    trendEmptyMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    debtIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.danger, isDark ? 0.16 : 0.1),
    },
    cardDescription: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    metricCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 4,
    },
    metricValue: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    metricMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
    },
    secondaryAction: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.shellTextPrimary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    secondaryActionText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    linkText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    activityList: {
      gap: 18,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    activityLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    activityIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardSoft,
    },
    activityCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    activityTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    activityMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    activityRight: {
      width: compact ? 92 : 106,
      alignItems: 'flex-end',
      gap: 3,
    },
    activityAmount: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 15 : 18,
      lineHeight: compact ? 20 : 22,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    activityAmountPositive: {
      color: colors.secondary,
    },
    activityKind: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '700',
    },
    insightCard: {
      borderRadius: 24,
      backgroundColor: colors.primary,
      padding: compact ? 22 : 24,
      gap: 16,
      overflow: 'hidden',
      shadowColor: alpha(colors.primary, 0.32),
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    insightBadge: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      backgroundColor: alpha(colors.onPrimary, 0.16),
      paddingHorizontal: 10,
      paddingVertical: 6,
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    insightTitle: {
      color: colors.onPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 30 : 32,
      fontWeight: '800',
      letterSpacing: -1,
    },
    insightText: {
      color: alpha(colors.onPrimary, 0.9),
      fontSize: 16,
      lineHeight: 26,
      fontWeight: '500',
    },
    primaryAction: {
      alignSelf: 'flex-start',
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.onPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      marginTop: 4,
    },
    primaryActionText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    filterModalOverlay: {
      flex: 1,
    },
    filterModalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    filterModalSheet: {
      maxHeight: '90%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.shellBackground,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      overflow: 'hidden',
    },
    filterModalHandle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 999,
      marginTop: 10,
      marginBottom: 12,
      backgroundColor: colors.shellCardMuted,
    },
    filterModalBody: {
      gap: 16,
      paddingHorizontal: compact ? 16 : 18,
      paddingBottom: 16,
    },
    filterModalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    filterModalHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    filterModalKicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    filterModalTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 28 : 30,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    filterModalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    filterModalClose: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterModalScroll: {
      maxHeight: compact ? 360 : 420,
    },
    filterModalContent: {
      gap: 14,
      paddingBottom: 4,
    },
    filterSectionCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: compact ? 16 : 18,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterSectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    filterSectionIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    filterSectionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    filterSectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    filterSectionSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    filterModeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    filterModeButton: {
      flexGrow: 1,
      flexBasis: '48%',
      minHeight: 52,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterModeIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterModeLabel: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    filterFieldGroup: {
      gap: 8,
    },
    filterFieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    filterFieldHelper: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    filterPickerShell: {
      minHeight: 56,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    filterPickerPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.995 }],
    },
    filterPickerIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
      flexShrink: 0,
    },
    filterPickerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    filterPickerValue: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    filterPickerMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    filterDatePickerCard: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      marginTop: 4,
    },
    filterErrorCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 16,
      backgroundColor: alpha(colors.danger, isDark ? 0.16 : 0.08),
      padding: 14,
      borderWidth: 1,
      borderColor: alpha(colors.danger, isDark ? 0.32 : 0.2),
    },
    filterErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    filterModalFooter: {
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
      paddingHorizontal: compact ? 16 : 18,
      paddingTop: 14,
      paddingBottom: 16,
      backgroundColor: colors.shellBackground,
    },
    filterModalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    filterSecondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterSecondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    filterPrimaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    filterPrimaryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    monthPickerOverlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: compact ? 16 : 20,
      backgroundColor: alpha(colors.inverseSurface, isDark ? 0.7 : 0.36),
    },
    monthPickerSheet: {
      borderRadius: 28,
      backgroundColor: colors.shellBackground,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: compact ? 16 : 18,
      gap: 16,
      overflow: 'hidden',
    },
    monthPickerHandle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
    },
    monthPickerHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    monthPickerHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    monthPickerKicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    monthPickerTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 21 : 23,
      lineHeight: compact ? 27 : 29,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    monthPickerSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    monthPickerClose: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    monthPickerYearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      padding: 10,
    },
    monthPickerYearButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    monthPickerYearText: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    monthPickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    monthPickerChip: {
      width: '31%',
      minHeight: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    monthPickerChipText: {
      color: colors.shellTextSecondary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    monthPickerActions: {
      flexDirection: 'row',
      gap: 10,
    },
    monthPickerSecondaryButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    monthPickerSecondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    monthPickerPrimaryButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    monthPickerPrimaryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 116,
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.shellFab,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: alpha(colors.shellFab, 0.4),
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 18,
    },
  });
};
