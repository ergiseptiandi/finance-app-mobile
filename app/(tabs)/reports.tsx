import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { ReportsSkeleton } from '@/components/ui/skeleton';
import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import { getNotificationSettings } from '@/lib/api/notifications';
import {
  getAverageDailySpending,
  getExpenseByCategory,
  getHighestSpendingCategory,
  getRemainingBalance,
  getSpendingTrends,
  type AverageDailySpendingData,
  type ExpenseByCategoryItem,
  type HighestSpendingCategoryData,
  type RemainingBalanceData,
  type ReportsPeriodData,
  type ReportsPeriodParams,
  type SpendingTrendItem,
} from '@/lib/api/reports';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';

type TrendMode = 'trend' | 'categories' | 'calendar';
type ReportsFilterMode = 'month' | 'year' | 'custom' | 'cycle';
type MetricTone = 'primary' | 'secondary' | 'warning' | 'danger' | 'teal';
type ReportsDateTarget = 'startDate' | 'endDate' | null;
type ReportRingProps = {
  accent: string;
  label: string;
  progress: number;
  size?: number;
  value: string;
  valueLabel: string;
  textColor: string;
  trackColor: string;
};

type ReportsCacheState = {
  expenseByCategory: ExpenseByCategoryItem[];
  spendingTrends: SpendingTrendItem[];
  highestCategory: HighestSpendingCategoryData | null;
  averageDaily: AverageDailySpendingData | null;
  remainingBalance: RemainingBalanceData | null;
};

type ReportsFilters = {
  mode: ReportsFilterMode;
  month: string;
  year: string;
  startDate: string;
  endDate: string;
};

type MonthPickerState = {
  year: number;
  monthIndex: number;
};

const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index);

const getCurrentMonthInputValue = () => new Date().toISOString().slice(0, 7);
const getCurrentYearInputValue = () => String(new Date().getFullYear());

const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const computeSalaryCycleDates = (salaryDay: number): { startDate: string; endDate: string } => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  let cycleStart: Date;
  let cycleEnd: Date;

  if (currentDay >= salaryDay) {
    cycleStart = new Date(currentYear, currentMonth, salaryDay);
    const nextMonth = currentMonth + 1;
    cycleEnd = new Date(currentYear, nextMonth, salaryDay - 1);
  } else {
    const prevMonth = currentMonth - 1;
    cycleStart = new Date(currentYear, prevMonth, salaryDay);
    cycleEnd = new Date(currentYear, currentMonth, salaryDay - 1);
  }

  return {
    startDate: toLocalDateString(cycleStart),
    endDate: toLocalDateString(cycleEnd),
  };
};

const createDefaultReportsFilters = (salaryDay?: number): ReportsFilters => {
  if (salaryDay && salaryDay >= 1 && salaryDay <= 31) {
    const cycleDates = computeSalaryCycleDates(salaryDay);
    return {
      mode: 'cycle',
      month: '',
      year: getCurrentYearInputValue(),
      startDate: cycleDates.startDate,
      endDate: cycleDates.endDate,
    };
  }
  return {
    mode: 'month',
    month: getCurrentMonthInputValue(),
    year: getCurrentYearInputValue(),
    startDate: '',
    endDate: '',
  };
};

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

const buildReportsQueryParams = (filters: ReportsFilters): ReportsPeriodParams => {
  if (filters.mode === 'year') {
    return { year: filters.year };
  }

  if (filters.mode === 'custom' || filters.mode === 'cycle') {
    return {
      start_date: filters.startDate,
      end_date: filters.endDate,
    };
  }

  return {
    month: filters.month,
  };
};

const createReportsCacheSuffix = (filters: ReportsFilters) =>
  [filters.mode, filters.month, filters.year, filters.startDate, filters.endDate].join('|');

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));

const formatCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const formatCompactCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);

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
  return Number.isNaN(date.getTime()) ? null : date;
};

const toShortMonth = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).toUpperCase();
};

const toLongMonth = (value: string, fallback: string, locale: string) => {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getReportsPeriodLabel = (period: ReportsPeriodData | null | undefined, locale: string) => {
  if (!period) {
    return '';
  }

  if (period.mode === 'year' && period.year) {
    return String(period.year);
  }

  if (period.mode === 'custom' && period.start_date && period.end_date) {
    return `${toLongMonth(period.start_date, period.start_date, locale)} - ${toLongMonth(period.end_date, period.end_date, locale)}`;
  }

  if (period.month) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(`${period.month}-01T00:00:00`)
    );
  }

  return period.mode ? String(period.mode) : '';
};

const getTrendLabel = (item: SpendingTrendItem, index: number, locale: string) => {
  const base = String(item.period ?? item.date ?? item.month ?? item.label ?? '');
  if (base && /^\d{4}-\d{2}$/.test(base)) {
    return toShortMonth(base, `M${index + 1}`, locale);
  }

  if (base && /^\d{4}-\d{2}-\d{2}$/.test(base)) {
    return new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(parseDateValue(base) ?? new Date());
  }

  return toShortMonth(base, `M${index + 1}`, locale);
};

const getIncomeTrendValue = (item: SpendingTrendItem) => toNumber(item.income);
const getExpenseTrendValue = (item: SpendingTrendItem) => toNumber(item.expense ?? item.amount);
const getNetCashflowTrendValue = (item: SpendingTrendItem) => toNumber(item.net_cashflow);

const getCategoryShare = (item: ExpenseByCategoryItem, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (toNumber(item.amount) / total) * 100)) : 0;

const normalizeCategoryLabel = (category: string, language: string) => {
  const normalized = category.trim().toLowerCase();

  if (normalized === 'debt payment') {
    return language === 'id' ? 'Pembayaran utang' : 'Debt payment';
  }

  return category.trim();
};

const getCategoryIcon = (category: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  const normalized = category.trim().toLowerCase();

  if (normalized.includes('debt payment') || normalized.includes('pembayaran utang')) {
    return 'bank-transfer';
  }
  if (normalized.includes('food') || normalized.includes('makan') || normalized.includes('dining')) {
    return 'silverware-fork-knife';
  }
  if (normalized.includes('transport') || normalized.includes('transpor') || normalized.includes('travel')) {
    return 'train-car';
  }
  if (normalized.includes('shopping') || normalized.includes('belanja')) {
    return 'shopping-outline';
  }
  if (normalized.includes('health') || normalized.includes('kesehatan')) {
    return 'heart-pulse';
  }
  if (normalized.includes('bill') || normalized.includes('tagihan') || normalized.includes('utility')) {
    return 'receipt-text-outline';
  }
  if (normalized.includes('salary') || normalized.includes('income') || normalized.includes('pendapatan')) {
    return 'cash-multiple';
  }

  return 'shape-outline';
};

const getCategoryTone = (index: number): MetricTone => {
  if (index === 0) return 'primary';
  if (index === 1) return 'secondary';
  if (index === 2) return 'warning';
  return 'danger';
};

const ReportRing = ({
  accent,
  label,
  progress,
  size = 120,
  value,
  valueLabel,
  textColor,
  trackColor,
}: ReportRingProps) => {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const strokeDashoffset = circumference * (1 - normalizedProgress / 100);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="report-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.96} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0.72} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#report-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference + ' ' + circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: textColor, fontSize: size >= 120 ? 28 : 24, lineHeight: size >= 120 ? 30 : 26, fontWeight: '900', letterSpacing: -1 }}>
          {value}
        </Text>
        <Text style={{ color: textColor, opacity: 0.82, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <Text style={{ color: textColor, opacity: 0.7, fontSize: 9, fontWeight: '700' }}>
          {valueLabel}
        </Text>
      </View>
    </View>
  );
};
export default function ReportsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const { isOffline } = useNetworkStatus();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const isDark = colorScheme === 'dark';
  const styles = createStyles(colors, compact, insets.top, isDark);

  const [trendMode, setTrendMode] = useState<TrendMode>('categories');
  const [selectedTrendIndex, setSelectedTrendIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategoryItem[]>([]);
  const [spendingTrends, setSpendingTrends] = useState<SpendingTrendItem[]>([]);
  const [highestCategory, setHighestCategory] = useState<HighestSpendingCategoryData | null>(null);
  const [averageDaily, setAverageDaily] = useState<AverageDailySpendingData | null>(null);
  const [remainingBalance, setRemainingBalance] = useState<RemainingBalanceData | null>(null);
  const [filters, setFilters] = useState<ReportsFilters>(() => createDefaultReportsFilters(25));
  const [draftFilters, setDraftFilters] = useState<ReportsFilters>(() => createDefaultReportsFilters(25));
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [monthPickerState, setMonthPickerState] = useState<MonthPickerState>(() =>
    getMonthPickerStateFromInput(createDefaultReportsFilters().month)
  );
  const [iosCustomDatePickerVisible, setIosCustomDatePickerVisible] = useState(false);
  const [customDateTarget, setCustomDateTarget] = useState<ReportsDateTarget>(null);
  const customDateTargetRef = useRef<ReportsDateTarget>(null);
  const filtersRef = useRef<ReportsFilters>(createDefaultReportsFilters(25));
  const [salaryDay, setSalaryDay] = useState<number>(25);
  const hasReportsSnapshot = Boolean(
    expenseByCategory.length || spendingTrends.length || highestCategory || averageDaily || remainingBalance
  );

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    let active = true;

    const hydrateReportsCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const cached = await readScreenCache<ReportsCacheState>(
        buildScreenCacheKey('reports', session.user.id, createReportsCacheSuffix(filtersRef.current))
      );

      if (!cached || !active) {
        return;
      }

      setExpenseByCategory(cached.data.expenseByCategory);
      setSpendingTrends(cached.data.spendingTrends);
      setHighestCategory(cached.data.highestCategory);
      setAverageDaily(cached.data.averageDaily);
      setRemainingBalance(cached.data.remainingBalance);
      setLoading(false);
    };

    hydrateReportsCache();

    return () => {
      active = false;
    };
  }, []);

  const withAuthorizedRequest = useCallback(async <T,>(task: (accessToken: string) => Promise<T>) => {
    const session = await getAuthSession();

    if (!session) {
      router.replace('/login');
      throw new Error('missing_session');
    }

    try {
      return await task(session.token.access_token);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401 && session.token.refresh_token) {
        const refreshed = await refreshStoredAuthSession();
        if (refreshed) {
          return task(refreshed.token.access_token);
        }
      }

      if (err instanceof ApiRequestError && err.status === 401) {
        router.replace('/login');
      }

      throw err;
    }
  }, []);

  const openFilterModal = useCallback(() => {
    setDraftFilters(filters);
    setFilterError('');
    setCustomDateTarget(null);
    setMonthPickerState(getMonthPickerStateFromInput(filters.month));
    setIosCustomDatePickerVisible(false);
    setFilterModalVisible(true);
  }, [filters]);

  const closeFilterModal = useCallback(() => {
    setFilterModalVisible(false);
    setFilterError('');
    setCustomDateTarget(null);
    setIosCustomDatePickerVisible(false);
  }, []);

  const handleCustomDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android' && event.type === 'dismissed') {
        return;
      }

      const target = customDateTargetRef.current;
      if (!selectedDate || !target) {
        return;
      }

      setDraftFilters((current) => ({
        ...current,
        [target]: toLocalDateString(selectedDate),
      }));
    },
    []
  );

  const openCustomDatePicker = useCallback(
    (target: 'startDate' | 'endDate') => {
      const current = target === 'startDate' ? draftFilters.startDate : draftFilters.endDate;
      const currentDate = parseDateValue(current) ?? new Date();
      setCustomDateTarget(target);
      customDateTargetRef.current = target;

      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: currentDate,
          mode: 'date',
          onChange: handleCustomDateChange,
        });
        return;
      }

      setIosCustomDatePickerVisible(true);
    },
    [draftFilters.endDate, draftFilters.startDate, handleCustomDateChange]
  );

  const loadReports = useCallback(
    async (isRefresh = false, appliedFilters: ReportsFilters = filtersRef.current, forceLoading = false) => {
      const shouldShowSkeleton = forceLoading || (!isRefresh && !hasReportsSnapshot);

      if (isRefresh) {
        setRefreshing(true);
      } else if (shouldShowSkeleton) {
        setLoading(true);
      }

      setError('');

      try {
        const queryParams = buildReportsQueryParams(appliedFilters);
        const results = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([
            getExpenseByCategory(accessToken, queryParams),
            getSpendingTrends(accessToken, queryParams),
            getHighestSpendingCategory(accessToken, queryParams),
            getAverageDailySpending(accessToken, queryParams),
            getRemainingBalance(accessToken, queryParams),
          ])
        );

        const [categoryResult, trendResult, highestResult, averageResult, balanceResult] = results;
        const nextExpenseByCategory =
          categoryResult.status === 'fulfilled' ? categoryResult.value.Data?.items ?? [] : expenseByCategory;
        const nextSpendingTrends =
          trendResult.status === 'fulfilled' ? trendResult.value.Data?.items ?? [] : spendingTrends;
        const nextHighestCategory =
          highestResult.status === 'fulfilled' ? highestResult.value.Data ?? null : highestCategory;
        const nextAverageDaily =
          averageResult.status === 'fulfilled' ? averageResult.value.Data ?? null : averageDaily;
        const nextRemainingBalance =
          balanceResult.status === 'fulfilled' ? balanceResult.value.Data ?? null : remainingBalance;

        if (categoryResult.status === 'fulfilled') {
          setExpenseByCategory(nextExpenseByCategory);
        }

        if (trendResult.status === 'fulfilled') {
          setSpendingTrends(nextSpendingTrends);
        }

        if (highestResult.status === 'fulfilled') {
          setHighestCategory(nextHighestCategory);
        }

        if (averageResult.status === 'fulfilled') {
          setAverageDaily(nextAverageDaily);
        }

        if (balanceResult.status === 'fulfilled') {
          setRemainingBalance(nextRemainingBalance);
        }

        const session = await getAuthSession();
        if (session) {
          await writeScreenCache(buildScreenCacheKey('reports', session.user.id, createReportsCacheSuffix(appliedFilters)), {
            expenseByCategory: nextExpenseByCategory,
            spendingTrends: nextSpendingTrends,
            highestCategory: nextHighestCategory,
            averageDaily: nextAverageDaily,
            remainingBalance: nextRemainingBalance,
          });
        }

        if (results.some((result) => result.status === 'rejected')) {
          if (isOffline && hasReportsSnapshot) {
            return;
          }

          setError(isOffline ? t('common.offlineLoadError') : t('reports.partialError'));
        }
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          if (isOffline && hasReportsSnapshot) {
            setError('');
            return;
          }

          setError(isOffline ? t('common.offlineLoadError') : t('reports.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      averageDaily,
      isOffline,
      expenseByCategory,
      hasReportsSnapshot,
      highestCategory,
      remainingBalance,
      spendingTrends,
      t,
      withAuthorizedRequest,
    ]
  );

  const applyFilterDraft = useCallback(() => {
    if (draftFilters.mode === 'month') {
      const selectedMonth = `${monthPickerState.year}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}`;
      if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
        setFilterError(t('reports.filter.monthInvalid'));
        return;
      }
    } else if (draftFilters.mode === 'year') {
      if (!/^\d{4}$/.test(draftFilters.year)) {
        setFilterError(t('reports.filter.yearInvalid'));
        return;
      }
    } else if (draftFilters.mode === 'custom') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFilters.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(draftFilters.endDate)) {
        setFilterError(t('reports.filter.rangeRequired'));
        return;
      }

      const start = parseDateValue(draftFilters.startDate);
      const end = parseDateValue(draftFilters.endDate);
      if (!start || !end || start.getTime() > end.getTime()) {
        setFilterError(t('reports.filter.rangeInvalid'));
        return;
      }

      const diffYears = end.getFullYear() - start.getFullYear();
      const diffMonths = end.getMonth() - start.getMonth();
      const spanMonths = diffYears * 12 + diffMonths;
      if (spanMonths > 12) {
        setFilterError(t('reports.filter.rangeTooLong'));
        return;
      }
    }

    let nextFilters: ReportsFilters;

    if (draftFilters.mode === 'cycle') {
      const cycleDates = computeSalaryCycleDates(salaryDay);
      nextFilters = {
        ...draftFilters,
        month: '',
        year: '',
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate,
      };
    } else {
      nextFilters = {
        ...draftFilters,
        month:
          draftFilters.mode === 'month'
            ? `${monthPickerState.year}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}`
            : '',
        year: draftFilters.mode === 'year' ? draftFilters.year : '',
        startDate: draftFilters.mode === 'custom' ? draftFilters.startDate : '',
        endDate: draftFilters.mode === 'custom' ? draftFilters.endDate : '',
      };
    }

    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setCustomDateTarget(null);
    setIosCustomDatePickerVisible(false);
    setFilterModalVisible(false);
    void loadReports(false, nextFilters, true);
  }, [draftFilters, loadReports, monthPickerState.monthIndex, monthPickerState.year, salaryDay, t]);

  const resetFilters = useCallback(() => {
    const nextFilters = createDefaultReportsFilters(salaryDay);
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setCustomDateTarget(null);
    setIosCustomDatePickerVisible(false);
    setFilterModalVisible(false);
    setMonthPickerState(getMonthPickerStateFromInput(nextFilters.month));
    void loadReports(false, nextFilters, true);
  }, [loadReports, salaryDay]);

  useFocusEffect(
    useCallback(() => {
      loadReports(false, filtersRef.current);
    }, [loadReports])
  );

  useEffect(() => {
    let active = true;
    const fetchSalaryDay = async () => {
      try {
        const session = await getAuthSession();
        if (!session || !active) return;
        const response = await getNotificationSettings(session.token.access_token);
        const day = Number(response.Data?.salary_day);
        if (active && Number.isFinite(day) && day >= 1 && day <= 31) {
          setSalaryDay(day);
          const cycleDates = computeSalaryCycleDates(day);
          const nextFilters: ReportsFilters = {
            mode: 'cycle',
            month: '',
            year: getCurrentYearInputValue(),
            startDate: cycleDates.startDate,
            endDate: cycleDates.endDate,
          };
          setFilters(nextFilters);
          setDraftFilters(nextFilters);
          filtersRef.current = nextFilters;
          void loadReports(false, nextFilters);
        }
      } catch {
        // keep default
      }
    };
    fetchSalaryDay();
    return () => { active = false; };
  }, [loadReports]);

  const totalIncome = toNumber(remainingBalance?.total_income);
  const totalExpense = toNumber(remainingBalance?.total_expense);
  const remaining = toNumber(remainingBalance?.remaining_balance);
  const averageValue = toNumber(averageDaily?.average_daily_spending);
  const elapsedDays = toNumber(averageDaily?.days_count ?? averageDaily?.elapsed_days);

  const categoryTotal = useMemo(
    () => expenseByCategory.reduce((sum, item) => sum + toNumber(item.amount), 0),
    [expenseByCategory]
  );
  const sortedCategories = useMemo(
    () => [...expenseByCategory].sort((left, right) => toNumber(right.amount) - toNumber(left.amount)),
    [expenseByCategory]
  );
  const topCategory = highestCategory ?? sortedCategories[0] ?? null;
  const activePeriodLabel = useMemo(() => {
    if (filters.mode === 'year') {
      return filters.year || t('reports.currentPeriod');
    }

    if (filters.mode === 'cycle' && filters.startDate && filters.endDate) {
      return `${toLongMonth(filters.startDate, filters.startDate, locale)} - ${toLongMonth(
        filters.endDate,
        filters.endDate,
        locale
      )}`;
    }

    if (filters.mode === 'custom' && filters.startDate && filters.endDate) {
      return `${toLongMonth(filters.startDate, filters.startDate, locale)} - ${toLongMonth(
        filters.endDate,
        filters.endDate,
        locale
      )}`;
    }

    return toLongMonth(`${filters.month}-01`, filters.month, locale);
  }, [filters.endDate, filters.mode, filters.month, filters.startDate, filters.year, locale, t]);
  const trendPoints = useMemo(
    () =>
      spendingTrends.map((item, index) => ({
        ...item,
        label: getTrendLabel(item, index, locale),
        expenseValue: getExpenseTrendValue(item),
        incomeValue: getIncomeTrendValue(item),
        netCashflowValue: getNetCashflowTrendValue(item),
      })),
    [locale, spendingTrends]
  );
  const trendMax = Math.max(...trendPoints.map((item) => item.expenseValue), 1);
  const expenseRatio = totalIncome > 0 ? Math.max(0, Math.min(100, (totalExpense / totalIncome) * 100)) : 0;
  const remainingRatio = totalIncome > 0 ? Math.max(0, Math.min(100, (remaining / totalIncome) * 100)) : 0;
  const periodSummaryText = getReportsPeriodLabel(
    remainingBalance?.period ?? highestCategory?.period ?? averageDaily?.period ?? null,
    locale
  );
  const isEmpty =
    !loading && !expenseByCategory.length && !spendingTrends.length && !remainingBalance && !averageDaily && !highestCategory;

  const calendarData = useMemo(() => {
    if (trendMode !== 'calendar' || trendPoints.length === 0) return null;

    const isDaily = trendPoints.some((p) => {
      const key = String(p.period ?? p.date ?? p.month ?? p.label ?? '');
      return /^\d{4}-\d{2}-\d{2}$/.test(key);
    });
    if (!isDaily) return { type: 'not-daily' as const };

    const expenseMap = new Map<string, { income: number; expense: number; net: number }>();
    const maxExpense = Math.max(...trendPoints.map((p) => p.expenseValue), 1);

    for (const p of trendPoints) {
      const key = String(p.period ?? p.date ?? '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        expenseMap.set(key, { income: p.incomeValue, expense: p.expenseValue, net: p.netCashflowValue });
      }
    }

    const firstKey = trendPoints.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(String(p.period ?? p.date ?? '')));
    const firstDateStr = firstKey ? String(firstKey.period ?? firstKey.date ?? '') : '';
    const refDate = firstDateStr ? parseDateValue(firstDateStr) ?? new Date() : new Date();
    const calYear = refDate.getFullYear();
    const calMonth = refDate.getMonth();
    const firstOfMonth = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const startWeekday = firstOfMonth.getDay();
    const calMonthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(firstOfMonth);

    const cells: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(ds);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return {
      type: 'calendar' as const,
      cells,
      expenseMap,
      maxExpense,
      calMonthLabel,
    };
  }, [trendMode, trendPoints, locale]);

  const sectionAnimations = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;
  const sectionRevealStyles = useMemo(
    () =>
      sectionAnimations.map((value) => ({
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            }),
          },
        ],
      })),
    [sectionAnimations]
  );

  useEffect(() => {
    if (loading || isEmpty) {
      sectionAnimations.forEach((value) => value.setValue(0));
      return;
    }

    const animations = sectionAnimations.map((value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );

    Animated.stagger(85, animations).start();
  }, [filters.mode, isEmpty, loading, sectionAnimations, trendMode]);

  const metricCards = [
    {
      icon: 'cash-multiple',
      label: t('reports.totalIncome'),
      value: formatCompactCurrency(totalIncome, locale),
      meta: `${activePeriodLabel} - ${Math.round(remainingRatio)}%`,
      tone: 'primary' as MetricTone,
    },
    {
      icon: 'credit-card-outline',
      label: t('reports.totalExpense'),
      value: formatCompactCurrency(totalExpense, locale),
      meta: `${activePeriodLabel} - ${Math.round(expenseRatio)}%`,
      tone: 'danger' as MetricTone,
    },
    {
      icon: 'wallet-outline',
      label: t('reports.remainingBalance'),
      value: formatCompactCurrency(remaining, locale),
      meta: t('reports.remainingBalanceHelper'),
      tone: 'secondary' as MetricTone,
    },
    {
      icon: 'calendar-clock',
      label: t('reports.avgDailySpending'),
      value: formatCurrency(averageValue, locale),
      meta: elapsedDays > 0 ? t('reports.elapsedDays', { count: elapsedDays }) : activePeriodLabel,
      tone: 'warning' as MetricTone,
    },
    {
      icon: 'bank-transfer',
      label: t('reports.debtRepayment'),
      value: formatCompactCurrency(toNumber(remainingBalance?.debt_repayment ?? 0), locale),
      meta: t('reports.debtRepaymentHelper'),
      tone: 'danger' as MetricTone,
    },
    {
      icon: 'percent-outline',
      label: t('reports.savingsRate'),
      value: `${Math.round(toNumber(remainingBalance?.savings_rate ?? (totalIncome > 0 ? (remaining / totalIncome) * 100 : 0)))}%`,
      meta: t('reports.savingsRateHelper'),
      tone: 'teal' as MetricTone,
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadReports(true)} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <Text style={styles.kicker}>{t('reports.kicker')}</Text>
            <Text style={styles.title}>{t('reports.title')}</Text>
            <Text style={styles.subtitle}>{t('reports.subtitle')}</Text>
          </View>
        </View>

        {loading ? (
          <ReportsSkeleton colors={colors} />
        ) : isEmpty ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="chart-box-outline" size={22} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('reports.emptyTitle')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.filterCard}>
              <View style={styles.filterCardHeader}>
                <View style={styles.filterCardCopy}>
                  <Text style={styles.filterCardKicker}>{t('reports.filter.kicker')}</Text>
                  <Text numberOfLines={1} style={styles.filterCardTitle}>
                    {activePeriodLabel}
                  </Text>
                  <Text style={styles.filterCardMeta}>{periodSummaryText || t('reports.filter.helper')}</Text>
                </View>
                <Pressable onPress={openFilterModal} style={styles.filterCardAction}>
                  <MaterialCommunityIcons name="tune-variant" size={16} color={colors.onPrimary} />
                  <Text style={styles.filterCardActionText}>{t('reports.filter.action')}</Text>
                </Pressable>
              </View>
              <View style={styles.filterBadgeRow}>
                <View style={styles.filterBadge}>
                  <MaterialCommunityIcons
                    name={
                      filters.mode === 'month'
                        ? 'calendar-month-outline'
                        : filters.mode === 'year'
                          ? 'calendar-range-outline'
                          : filters.mode === 'cycle'
                            ? 'calendar-sync-outline'
                            : 'calendar-start-outline'
                    }
                    size={12}
                    color={colors.primary}
                  />
                  <Text style={styles.filterBadgeText}>
                    {filters.mode === 'month'
                      ? t('reports.filter.modeMonth')
                      : filters.mode === 'year'
                        ? t('reports.filter.modeYear')
                        : filters.mode === 'cycle'
                          ? t('reports.filter.modeCycle')
                          : t('reports.filter.modeCustom')}
                  </Text>
                </View>
                <View style={styles.filterBadge}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color={colors.primary} />
                  <Text style={styles.filterBadgeText}>{activePeriodLabel}</Text>
                </View>
              </View>
            </View>

            <Animated.View style={[styles.heroCard, sectionRevealStyles[1]]}>
              <View style={styles.heroLayout}>
                <View style={styles.heroCopy}>
                  <View style={[styles.heroBadge, isDark ? styles.heroBadgeDark : styles.heroBadgeLight]}>
                    <MaterialCommunityIcons name="chart-pie" size={14} color={isDark ? colors.secondaryAccent : colors.primary} />
                    <Text style={[styles.heroBadgeText, isDark ? styles.heroBadgeTextDark : styles.heroBadgeTextLight]}>
                      {activePeriodLabel}
                    </Text>
                  </View>
                  <Text style={[styles.heroNumberLabel, isDark ? styles.heroNumberLabelDark : styles.heroNumberLabelLight]}>
                    {t('reports.remainingBalance')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.62}
                    style={[styles.heroValue, isDark ? styles.heroValueDark : styles.heroValueLight]}>
                    {formatCompactCurrency(remaining, locale)}
                  </Text>
                  <Text style={[styles.heroBody, isDark ? styles.heroBodyDark : styles.heroBodyLight, { fontSize: 11, marginTop: -4 }]}>
                    {t('reports.remainingBalanceHelper')}
                  </Text>

                  <View style={styles.heroMetaRow}>
                    <View style={[styles.heroMetaChip, isDark ? styles.heroMetaChipDark : styles.heroMetaChipLight]}>
                      <MaterialCommunityIcons
                        name="trending-up"
                        size={12}
                        color={isDark ? colors.secondaryAccent : colors.primary}
                      />
                      <Text style={[styles.heroMetaText, isDark ? styles.heroMetaTextDark : styles.heroMetaTextLight]}>
                        {formatCompactCurrency(totalIncome, locale)} {t('reports.totalIncome')}
                      </Text>
                    </View>
                    <View style={[styles.heroMetaChip, isDark ? styles.heroMetaChipDark : styles.heroMetaChipExpense]}>
                      <MaterialCommunityIcons
                        name="trending-down"
                        size={12}
                        color={isDark ? '#FFB4B4' : colors.danger}
                      />
                      <Text style={[styles.heroMetaText, isDark ? styles.heroMetaTextDark : styles.heroMetaTextLight]}>
                        {formatCompactCurrency(totalExpense, locale)} {t('reports.totalExpense')}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.heroBody, isDark ? styles.heroBodyDark : styles.heroBodyLight]}>
                    {topCategory
                      ? t('reports.heroBodyPlain', {
                        category: topCategory.category,
                        amount: formatCompactCurrency(toNumber(topCategory.amount), locale),
                      })
                      : t('reports.heroBodyFallbackPlain')}
                  </Text>
                </View>

                <View style={styles.heroVisual}>
                  <ReportRing
                    accent={isDark ? colors.secondaryAccent : colors.primary}
                    label={language === 'id' ? 'Terpakai' : 'Used'}
                    progress={expenseRatio}
                    value={`${Math.round(expenseRatio)}%`}
                    valueLabel={language === 'id' ? 'dari pendapatan' : 'of income'}
                    textColor={isDark ? colors.onPrimary : colors.shellTextPrimary}
                    trackColor={isDark ? alpha(colors.onPrimary, 0.16) : alpha(colors.shellTextPrimary, 0.12)}
                  />
                  <View style={styles.heroVisualLegend}>
                    <View
                      style={[
                        styles.heroVisualLegendItem,
                        isDark ? styles.heroVisualLegendItemDarkIncome : styles.heroVisualLegendItemLightIncome,
                      ]}>
                      <View style={[styles.heroVisualLegendIcon, isDark ? styles.heroVisualLegendIconDark : styles.heroVisualLegendIconLight]}>
                        <MaterialCommunityIcons
                          name="trending-up"
                          size={12}
                          color={isDark ? colors.secondaryAccent : colors.primary}
                        />
                      </View>
                      <View style={styles.heroVisualLegendText}>
                        <Text style={[styles.heroVisualLegendLabel, isDark ? styles.heroVisualLegendLabelDark : styles.heroVisualLegendLabelLight]}>
                          {language === 'id' ? 'Pendapatan' : 'Income'}
                        </Text>
                        <Text style={[styles.heroVisualLegendValue, isDark ? styles.heroVisualLegendValueDark : styles.heroVisualLegendValueLight]}>
                          {formatCompactCurrency(totalIncome, locale)}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.heroVisualLegendItem,
                        isDark ? styles.heroVisualLegendItemDarkBalance : styles.heroVisualLegendItemLightBalance,
                      ]}>
                      <View style={[styles.heroVisualLegendIcon, isDark ? styles.heroVisualLegendIconDark : styles.heroVisualLegendIconLight]}>
                        <MaterialCommunityIcons
                          name="wallet-outline"
                          size={12}
                          color={isDark ? colors.warning : colors.secondary}
                        />
                      </View>
                      <View style={styles.heroVisualLegendText}>
                        <Text style={[styles.heroVisualLegendLabel, isDark ? styles.heroVisualLegendLabelDark : styles.heroVisualLegendLabelLight]}>
                          {language === 'id' ? 'Sisa' : 'Left'}
                        </Text>
                        <Text style={[styles.heroVisualLegendValue, isDark ? styles.heroVisualLegendValueDark : styles.heroVisualLegendValueLight]}>
                          {formatCompactCurrency(remaining, locale)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            <View style={styles.metricGrid}>
              {metricCards.map((item) => (
                <MetricCard
                  key={item.label}
                  colors={colors}
                  icon={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  tone={item.tone}
                  label={item.label}
                  value={item.value}
                  meta={item.meta}
                />
              ))}
            </View>

            <Animated.View style={[styles.card, sectionRevealStyles[2]]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('reports.expenseByCategory')}</Text>
                  <Text style={styles.cardTitle}>{t('reports.highestCategory')}</Text>
                </View>
                <View style={styles.cardChip}>
                  <Text style={styles.cardChipText}>{formatCompactCurrency(categoryTotal, locale)}</Text>
                </View>
              </View>

              <View style={styles.categoryList}>
                {sortedCategories.length ? (
                  sortedCategories.map((item, index) => {
                    const share = getCategoryShare(item, categoryTotal);
                    const tone = getCategoryTone(index);
                    const palette = metricTonePalette(colors, tone);
                    const icon = getCategoryIcon(item.category);
                    return (
                      <View key={item.category} style={styles.categoryItem}>
                        <View style={styles.categoryItemHeader}>
                          <View style={[styles.categoryIcon, { backgroundColor: palette.iconBackground }]}>
                            <MaterialCommunityIcons name={icon} size={16} color={palette.iconColor} />
                          </View>
                          <View style={styles.categoryItemCopy}>
                            <View style={styles.categoryTopRow}>
                              <Text numberOfLines={1} style={styles.categoryName}>
                                {normalizeCategoryLabel(item.category, language)}
                              </Text>
                              <View style={[styles.categoryRank, { backgroundColor: palette.background }]}>
                                <Text style={[styles.categoryRankText, { color: palette.iconColor }]}>#{index + 1}</Text>
                              </View>
                            </View>
                            <View style={styles.categoryAmountRow}>
                              <Text style={styles.categoryAmount}>{formatCompactCurrency(toNumber(item.amount), locale)}</Text>
                              <Text style={styles.categoryMeta}>{share.toFixed(1)}%</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.categoryTrack}>
                          <View style={[styles.categoryFill, { width: `${Math.max(8, share)}%`, backgroundColor: palette.iconColor }]} />
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyInline}>{t('reports.noCategoryData')}</Text>
                )}
              </View>
            </Animated.View>

            <Animated.View style={[styles.card, sectionRevealStyles[3]]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('reports.spendingTrends')}</Text>
                  <Text style={styles.cardTitle}>{t('reports.monthlyTrend')}</Text>
                  <Text style={styles.trendCardHint}>
                    {language === 'id' ? 'Perbandingan pemasukan dan pengeluaran per periode.' : 'Income vs expense comparison per period.'}
                  </Text>
                </View>
                <View style={styles.segmentedControl}>
                  <Pressable
                    onPress={() => setTrendMode('categories')}
                    style={[styles.segmentButton, trendMode === 'categories' && styles.segmentButtonActive]}>
                    <MaterialCommunityIcons
                      name="chart-bar"
                      size={12}
                      color={trendMode === 'categories' ? colors.onPrimary : colors.shellTextMuted}
                    />
                    <Text style={[styles.segmentLabel, trendMode === 'categories' && styles.segmentLabelActive]}>
                      {t('reports.categories')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTrendMode('trend')}
                    style={[styles.segmentButton, trendMode === 'trend' && styles.segmentButtonActive]}>
                    <MaterialCommunityIcons
                      name="format-list-bulleted"
                      size={12}
                      color={trendMode === 'trend' ? colors.onPrimary : colors.shellTextMuted}
                    />
                    <Text style={[styles.segmentLabel, trendMode === 'trend' && styles.segmentLabelActive]}>
                      {t('reports.trend')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTrendMode('calendar')}
                    style={[styles.segmentButton, trendMode === 'calendar' && styles.segmentButtonActive]}>
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={12}
                      color={trendMode === 'calendar' ? colors.onPrimary : colors.shellTextMuted}
                    />
                    <Text style={[styles.segmentLabel, trendMode === 'calendar' && styles.segmentLabelActive]}>
                      {language === 'id' ? 'Kalender' : 'Calendar'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {trendPoints.length > 0 ? (
                <View style={styles.trendSummaryRow}>
                  <View style={styles.trendSummaryItem}>
                    <View style={[styles.trendSummaryDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.trendSummaryLabel}>{language === 'id' ? 'Masuk' : 'Income'}</Text>
                    <Text numberOfLines={1} style={styles.trendSummaryValue}>
                      {formatCompactCurrency(trendPoints.reduce((sum, p) => sum + p.incomeValue, 0), locale)}
                    </Text>
                  </View>
                  <View style={styles.trendSummaryItem}>
                    <View style={[styles.trendSummaryDot, { backgroundColor: colors.danger }]} />
                    <Text style={styles.trendSummaryLabel}>{language === 'id' ? 'Keluar' : 'Expense'}</Text>
                    <Text numberOfLines={1} style={styles.trendSummaryValue}>
                      {formatCompactCurrency(trendPoints.reduce((sum, p) => sum + p.expenseValue, 0), locale)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {selectedTrendIndex !== null && trendPoints[selectedTrendIndex] ? (
                <View style={styles.trendTooltip}>
                  <Text style={styles.trendTooltipTitle}>{trendPoints[selectedTrendIndex].label}</Text>
                  <View style={styles.trendTooltipRow}>
                    <View style={[styles.trendSummaryDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.trendTooltipText}>
                      {language === 'id' ? 'Masuk' : 'In'}: {formatCompactCurrency(trendPoints[selectedTrendIndex].incomeValue, locale)}
                    </Text>
                  </View>
                  <View style={styles.trendTooltipRow}>
                    <View style={[styles.trendSummaryDot, { backgroundColor: colors.danger }]} />
                    <Text style={styles.trendTooltipText}>
                      {language === 'id' ? 'Keluar' : 'Out'}: {formatCompactCurrency(trendPoints[selectedTrendIndex].expenseValue, locale)}
                    </Text>
                  </View>
                  <View style={styles.trendTooltipRow}>
                    <MaterialCommunityIcons
                      name={trendPoints[selectedTrendIndex].netCashflowValue >= 0 ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={trendPoints[selectedTrendIndex].netCashflowValue >= 0 ? colors.secondary : colors.danger}
                    />
                    <Text style={[styles.trendTooltipText, { color: trendPoints[selectedTrendIndex].netCashflowValue >= 0 ? colors.secondary : colors.danger, fontWeight: '800' }]}>
                      {trendPoints[selectedTrendIndex].netCashflowValue >= 0 ? '+' : ''}{formatCompactCurrency(trendPoints[selectedTrendIndex].netCashflowValue, locale)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {trendMode === 'categories' ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendChartScroll}>
                    <View style={[styles.trendChart, trendPoints.length <= 12 && { width: '100%' }]}>
                      {trendPoints.length ? (
                        trendPoints.map((item, index, items) => {
                          const peakVal = Math.max(...items.map(i => Math.max(i.incomeValue, i.expenseValue)), 1);
                          const incomeHeight = Math.max(6, (item.incomeValue / peakVal) * 100);
                          const expenseHeight = Math.max(6, (item.expenseValue / peakVal) * 100);
                          const selected = selectedTrendIndex === index;
                          const isPositive = item.netCashflowValue >= 0;
                          return (
                            <Pressable
                              key={`${item.date ?? item.month ?? item.label ?? index}`}
                              onPress={() => setSelectedTrendIndex(selected ? null : index)}
                              style={[styles.trendItem, selected && styles.trendItemSelected]}>
                              <View style={styles.trendBarGroup}>
                                <View
                                  style={[
                                    styles.trendBar,
                                    { height: `${incomeHeight}%`, backgroundColor: alpha(colors.primary, selected ? 1 : 0.5) },
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.trendBar,
                                    { height: `${expenseHeight}%`, backgroundColor: alpha(colors.danger, selected ? 1 : 0.5) },
                                  ]}
                                />
                              </View>
                              <View style={[styles.trendNetDot, { backgroundColor: isPositive ? colors.secondary : colors.danger }]} />
                              <Text numberOfLines={1} style={[styles.trendLabel, selected && { color: colors.primary, fontWeight: '800' }]}>
                                {item.label}
                              </Text>
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={styles.emptyInline}>{t('reports.noTrendData')}</Text>
                      )}
                    </View>
                  </ScrollView>
                  {trendPoints.length > 12 ? (
                    <View style={styles.swipeHint}>
                      <MaterialCommunityIcons name="gesture-swipe-horizontal" size={14} color={colors.shellTextMuted} />
                      <Text style={styles.swipeHintText}>
                        {language === 'id' ? 'Geser untuk lihat semua' : 'Swipe to see all'}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : trendMode === 'trend' ? (
                <View style={styles.trendTable}>
                  {trendPoints.length ? (
                    trendPoints.map((item, index) => {
                      const maxVal = Math.max(...trendPoints.map(p => p.expenseValue), 1);
                      const expenseWidth = Math.max(8, (item.expenseValue / maxVal) * 100);
                      const incomeWidth = Math.max(8, (item.incomeValue / maxVal) * 100);
                      const isPositive = item.netCashflowValue >= 0;
                      return (
                        <View key={`${item.label}-${index}`} style={styles.trendRow}>
                          <View style={styles.trendRowHeader}>
                            <Text style={styles.trendRowLabel}>{item.label}</Text>
                            <Text style={styles.trendRowPeriod}>
                              {toLongMonth(String(item.period ?? item.date ?? item.month ?? ''), item.label, locale)}
                            </Text>
                          </View>
                          <View style={styles.trendRowBars}>
                            <View style={styles.trendRowBarLine}>
                              <Text style={styles.trendRowBarLabel}>{language === 'id' ? 'Masuk' : 'In'}</Text>
                              <View style={styles.trendRowTrack}>
                                <View style={[styles.trendRowFillIncome, { width: `${incomeWidth}%` }]} />
                              </View>
                              <Text style={styles.trendRowBarValue}>{formatCompactCurrency(item.incomeValue, locale)}</Text>
                            </View>
                            <View style={styles.trendRowBarLine}>
                              <Text style={styles.trendRowBarLabel}>{language === 'id' ? 'Keluar' : 'Out'}</Text>
                              <View style={styles.trendRowTrack}>
                                <View style={[styles.trendRowFillExpense, { width: `${expenseWidth}%` }]} />
                              </View>
                              <Text style={styles.trendRowBarValue}>{formatCompactCurrency(item.expenseValue, locale)}</Text>
                            </View>
                          </View>
                          <View style={styles.trendRowFooter}>
                            <MaterialCommunityIcons
                              name={isPositive ? 'trending-up' : 'trending-down'}
                              size={12}
                              color={isPositive ? colors.secondary : colors.danger}
                            />
                            <Text style={[styles.trendRowNet, { color: isPositive ? colors.secondary : colors.danger }]}>
                              {isPositive ? '+' : ''}{formatCompactCurrency(item.netCashflowValue, locale)}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.emptyInline}>{t('reports.noTrendData')}</Text>
                  )}
                </View>
              ) : trendMode === 'calendar' ? (
                calendarData?.type === 'not-daily' ? (
                  <View style={styles.calendarEmpty}>
                    <MaterialCommunityIcons name="calendar-remove-outline" size={28} color={colors.outlineVariant} />
                    <Text style={styles.calendarEmptyText}>
                      {language === 'id'
                        ? 'Tampilan kalender tersedia saat filter harian (mode bulan/siklus).'
                        : 'Calendar view is available with daily filter (month/cycle mode).'}
                    </Text>
                  </View>
                ) : calendarData?.type === 'calendar' ? (
                  <View style={styles.calendarContainer}>
                    <Text style={styles.calendarMonthLabel}>{calendarData.calMonthLabel}</Text>
                    <View style={styles.calendarWeekHeader}>
                      {(language === 'id'
                        ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
                        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                      ).map((wd) => (
                        <Text key={wd} style={styles.calendarWeekday}>{wd}</Text>
                      ))}
                    </View>
                    <View style={styles.calendarGrid}>
                      {calendarData.cells.map((cell, idx) => {
                        if (cell === null) {
                          return <View key={`empty-${idx}`} style={styles.calendarCellEmpty} />;
                        }
                        const data = calendarData.expenseMap.get(cell);
                        const dayNum = Number(cell.slice(-2));
                        const hasData = !!data;
                        const intensity = hasData ? Math.min(1, data.expense / calendarData.maxExpense) : 0;
                        const selectedDate = selectedTrendIndex !== null && trendPoints[selectedTrendIndex]
                          ? String(trendPoints[selectedTrendIndex].period ?? trendPoints[selectedTrendIndex].date ?? '')
                          : null;
                        const isSelected = cell === selectedDate;
                        const bgColor = hasData && data.expense > 0
                          ? alpha(colors.danger, 0.12 + intensity * 0.7)
                          : alpha(colors.shellCardMuted, 0.5);
                        const dotColor = hasData && data.net >= 0 ? colors.secondary : colors.danger;

                        return (
                          <Pressable
                            key={cell}
                            onPress={() => {
                              if (!hasData) return;
                              const trendIdx = trendPoints.findIndex((p) =>
                                String(p.period ?? p.date ?? '') === cell
                              );
                              setSelectedTrendIndex(trendIdx >= 0 ? trendIdx : null);
                            }}
                            style={[
                              styles.calendarCell,
                              { backgroundColor: bgColor },
                              isSelected && styles.calendarCellSelected,
                            ]}>
                            <Text style={[styles.calendarDayNum, isSelected && { color: colors.onPrimary, fontWeight: '900' }]}>
                              {dayNum}
                            </Text>
                            {hasData && data.expense > 0 ? (
                              <Text style={styles.calendarCellAmount} numberOfLines={1}>
                                {formatCompactCurrency(data.expense, locale)}
                              </Text>
                            ) : null}
                            {hasData ? (
                              <View style={[styles.calendarDot, { backgroundColor: isSelected ? colors.onPrimary : dotColor }]} />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.calendarLegend}>
                      <Text style={styles.calendarLegendLabel}>
                        {language === 'id' ? 'Lebih gelap = pengeluaran lebih besar' : 'Darker = higher spending'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.emptyInline}>{t('reports.noTrendData')}</Text>
                )
              ) : null}
            </Animated.View>

            <Animated.View style={[styles.insightCard, sectionRevealStyles[4]]}>
              <View style={styles.insightHeaderRow}>
                <View style={styles.insightHeaderBadge}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color={colors.primary} />
                  <Text style={styles.insightBadge}>{t('reports.insightBadge')}</Text>
                </View>
                <View style={styles.insightHeaderPill}>
                  <MaterialCommunityIcons name="star-outline" size={12} color={colors.secondary} />
                  <Text style={styles.insightHeaderPillText}>
                    {language === 'id' ? 'Ringkas' : 'Compact'}
                  </Text>
                </View>
              </View>
              <Text style={styles.insightTitle} numberOfLines={1}>
                {highestCategory ? highestCategory.category : t('reports.noSummaryTitle')}
              </Text>
              <Text style={styles.insightText} numberOfLines={2}>
                {highestCategory
                  ? t('reports.heroBodyPlain', {
                    category: highestCategory.category,
                    amount: formatCompactCurrency(toNumber(highestCategory.amount), locale),
                  })
                  : t('reports.noSummaryBody')}
              </Text>
              <View style={styles.insightStatsRow}>
                <InsightStat colors={colors} label={t('reports.averageDailyTitle')} value={formatCurrency(averageValue, locale)} />
                <InsightStat colors={colors} label={t('reports.elapsedDaysTitle')} value={String(elapsedDays || 0)} />
              </View>
            </Animated.View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeFilterModal}>
        <View style={styles.filterModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeFilterModal} />
          <View style={styles.filterModalSheet}>
            <View style={styles.filterModalHandle} />
            <View style={styles.filterModalBody}>
              <View style={styles.filterModalHeader}>
                <View style={styles.filterModalHeaderCopy}>
                  <Text style={styles.filterModalKicker}>{t('reports.filter.kicker')}</Text>
                  <Text style={styles.filterModalTitle}>{t('reports.filter.title')}</Text>
                  <Text style={styles.filterModalSubtitle}>{t('reports.filter.helper')}</Text>
                </View>
                <Pressable onPress={closeFilterModal} style={styles.filterModalClose}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.filterModalScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.filterModalContent}>
                <View style={styles.filterSectionCard}>
                  <View style={styles.filterModeRow}>
                    {(['month', 'year', 'custom', 'cycle'] as ReportsFilterMode[]).map((mode) => {
                      const active = draftFilters.mode === mode;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              mode,
                              month: mode === 'month' ? current.month || getCurrentMonthInputValue() : current.month,
                              year: mode === 'year' ? current.year || getCurrentYearInputValue() : current.year,
                              startDate: mode === 'custom' ? current.startDate : '',
                              endDate: mode === 'custom' ? current.endDate : '',
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
                              name={
                                mode === 'month'
                                  ? 'calendar-month-outline'
                                  : mode === 'year'
                                    ? 'calendar-range-outline'
                                    : mode === 'cycle'
                                      ? 'calendar-sync-outline'
                                      : 'calendar-start-outline'
                              }
                              size={16}
                              color={active ? colors.primary : colors.shellTextMuted}
                            />
                          </View>
                          <View style={styles.filterModeCopy}>
                            <Text style={[styles.filterModeLabel, active && { color: colors.primary }]}>
                              {mode === 'month'
                                ? t('reports.filter.modeMonth')
                                : mode === 'year'
                                  ? t('reports.filter.modeYear')
                                  : mode === 'cycle'
                                    ? t('reports.filter.modeCycle')
                                    : t('reports.filter.modeCustom')}
                            </Text>
                            <Text style={[styles.filterModeNote, active && { color: colors.primary }]}>
                              {mode === 'month'
                                ? t('reports.filter.modeMonthHelper')
                                : mode === 'year'
                                  ? t('reports.filter.modeYearHelper')
                                  : mode === 'cycle'
                                    ? t('reports.filter.modeCycleHelper')
                                    : t('reports.filter.modeCustomHelper')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  {draftFilters.mode === 'cycle' ? (
                    <View style={styles.filterCycleInfo}>
                      <View style={[styles.filterModeIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.filterCycleText}>
                          {t('reports.filter.cycleDescription', { day: salaryDay })}
                        </Text>
                        <Text style={styles.filterCycleMeta}>
                          {t('reports.filter.cyclePeriod', {
                            start: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                              parseDateValue(computeSalaryCycleDates(salaryDay).startDate) ?? new Date()
                            ),
                            end: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                              parseDateValue(computeSalaryCycleDates(salaryDay).endDate) ?? new Date()
                            ),
                          })}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setFilterModalVisible(false);
                          router.push('/notification-settings');
                        }}
                        style={styles.filterCycleAction}>
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                  ) : draftFilters.mode === 'month' ? (
                    <>
                      <View style={styles.filterYearRow}>
                        <Pressable
                          onPress={() =>
                            setMonthPickerState((current) => ({
                              ...current,
                              year: current.year - 1,
                            }))
                          }
                          style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
                        </Pressable>
                        <Text style={styles.filterYearText}>{monthPickerState.year}</Text>
                        <Pressable
                          onPress={() =>
                            setMonthPickerState((current) => ({
                              ...current,
                              year: current.year + 1,
                            }))
                          }
                          style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
                        </Pressable>
                      </View>

                      <View style={styles.filterMonthGrid}>
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
                                styles.filterMonthChip,
                                selected && {
                                  backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12),
                                  borderColor: alpha(colors.primary, isDark ? 0.42 : 0.28),
                                },
                              ]}>
                              <Text style={[styles.filterMonthChipText, selected && { color: colors.primary }]}>
                                {monthLabel}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : draftFilters.mode === 'year' ? (
                    <>
                      <View style={styles.filterYearRow}>
                        <Pressable
                          onPress={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              year: String(Math.max(2000, Number(current.year || getCurrentYearInputValue()) - 1)),
                            }))
                          }
                          style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
                        </Pressable>
                        <Text style={styles.filterYearText}>{draftFilters.year || getCurrentYearInputValue()}</Text>
                        <Pressable
                          onPress={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              year: String(Number(current.year || getCurrentYearInputValue()) + 1),
                            }))
                          }
                          style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
                        </Pressable>
                      </View>
                      <Text style={styles.filterSectionSubtitle}>{t('reports.filter.yearHelper')}</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.filterFieldGroup}>
                        <Text style={styles.filterFieldLabel}>{t('reports.filter.startDate')}</Text>
                        <Pressable
                          onPress={() => openCustomDatePicker('startDate')}
                          style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                          <View style={styles.filterPickerIcon}>
                            <MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.filterPickerCopy}>
                            <Text style={styles.filterPickerValue}>
                              {draftFilters.startDate
                                ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                                  parseDateValue(draftFilters.startDate) ?? new Date()
                                )
                                : t('reports.filter.startDatePlaceholder')}
                            </Text>
                            <Text style={styles.filterPickerMeta}>{t('reports.filter.dateHelper')}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                        </Pressable>
                      </View>

                      <View style={styles.filterFieldGroup}>
                        <Text style={styles.filterFieldLabel}>{t('reports.filter.endDate')}</Text>
                        <Pressable
                          onPress={() => openCustomDatePicker('endDate')}
                          style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                          <View style={styles.filterPickerIcon}>
                            <MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.filterPickerCopy}>
                            <Text style={styles.filterPickerValue}>
                              {draftFilters.endDate
                                ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                                  parseDateValue(draftFilters.endDate) ?? new Date()
                                )
                                : t('reports.filter.endDatePlaceholder')}
                            </Text>
                            <Text style={styles.filterPickerMeta}>{t('reports.filter.dateHelper')}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                        </Pressable>
                      </View>

                      {Platform.OS === 'ios' && iosCustomDatePickerVisible && customDateTarget ? (
                        <View style={styles.filterDatePickerCard}>
                          <DateTimePicker
                            value={
                              parseDateValue(
                                customDateTarget === 'startDate' ? draftFilters.startDate : draftFilters.endDate
                              ) ?? new Date()
                            }
                            mode="date"
                            display="spinner"
                            onChange={handleCustomDateChange}
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
                    <Text style={styles.filterSecondaryButtonText}>{t('reports.filter.reset')}</Text>
                  </Pressable>
                  <Pressable onPress={applyFilterDraft} style={styles.filterPrimaryButton}>
                    <Text style={styles.filterPrimaryButtonText}>{t('reports.filter.apply')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View >
  );
}

function MetricCard({
  colors,
  icon,
  tone,
  label,
  value,
  meta,
}: {
  colors: AppColorTheme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone: MetricTone;
  label: string;
  value: string;
  meta: string;
}) {
  const palette = metricTonePalette(colors, tone);

  return (
    <View style={[metricStyles(colors).card, { backgroundColor: palette.background }]}>
      <View style={[metricStyles(colors).iconWrap, { backgroundColor: palette.iconBackground }]}>
        <MaterialCommunityIcons name={icon} size={18} color={palette.iconColor} />
      </View>
      <Text style={metricStyles(colors).label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={metricStyles(colors).value}>
        {value}
      </Text>
      <Text style={metricStyles(colors).meta}>{meta}</Text>
    </View>
  );
}

function InsightStat({
  colors,
  label,
  value,
}: {
  colors: AppColorTheme;
  label: string;
  value: string;
}) {
  return (
    <View style={insightStatStyles(colors).card}>
      <Text style={insightStatStyles(colors).label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={insightStatStyles(colors).value}>
        {value}
      </Text>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, compact: boolean, topInset: number, isDark: boolean) =>
  StyleSheet.create({
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
      gap: 18,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    topCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    filterCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: compact ? 16 : 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 4,
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
      gap: 3,
    },
    filterCardKicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2.2,
      textTransform: 'uppercase',
    },
    filterCardTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 17 : 19,
      lineHeight: compact ? 23 : 25,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    filterCardMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
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
    filterBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    filterBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: alpha(colors.primary, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.primary, isDark ? 0.24 : 0.16),
    },
    filterBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    filterSectionCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: 16,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
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
      flexBasis: compact ? '100%' : '31%',
      minHeight: compact ? 88 : 96,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterModeIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
    },
    filterModeLabel: {
      flex: 1,
      width: '100%',
      textAlign: 'center',
      color: colors.shellTextSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    filterModeCopy: {
      width: '100%',
      gap: 2,
      alignItems: 'center',
    },
    filterModeNote: {
      width: '100%',
      textAlign: 'center',
      color: colors.shellTextMuted,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '500',
    },
    filterCycleInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: alpha(colors.primary, isDark ? 0.08 : 0.05),
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: alpha(colors.primary, isDark ? 0.2 : 0.12),
    },
    filterCycleText: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    filterCycleMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
      marginTop: 2,
    },
    filterCycleAction: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    filterYearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    filterYearButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterYearText: {
      flex: 1,
      textAlign: 'center',
      color: colors.shellTextPrimary,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    filterMonthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    filterMonthChip: {
      flexGrow: 1,
      flexBasis: compact ? '30%' : '22%',
      minWidth: 70,
      minHeight: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterMonthChipText: {
      color: colors.shellTextSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    filterFieldGroup: {
      gap: 8,
    },
    filterFieldLabel: {
      color: colors.shellTextSecondary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
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
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterPickerPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    filterPickerIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
    },
    filterPickerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    filterPickerValue: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '800',
    },
    filterPickerMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    filterDatePickerCard: {
      borderRadius: 20,
      backgroundColor: colors.shellCardMuted,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterErrorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 16,
      backgroundColor: alpha(colors.danger, 0.08),
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.16),
    },
    filterErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    filterModalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: alpha(colors.shellBackground, 0.56),
    },
    filterModalSheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.shellBackground,
      paddingTop: 10,
      borderTopWidth: 1,
      borderColor: colors.shellBorder,
      maxHeight: '92%',
    },
    filterModalHandle: {
      alignSelf: 'center',
      width: 48,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.shellBorder,
      marginBottom: 14,
    },
    filterModalBody: {
      paddingHorizontal: compact ? 16 : 18,
      paddingBottom: Math.max(18, 16 + topInset),
      gap: 14,
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
      letterSpacing: 2.2,
      textTransform: 'uppercase',
    },
    filterModalTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 28 : 30,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    filterModalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
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
      maxHeight: '72%',
    },
    filterModalContent: {
      gap: 14,
      paddingBottom: 4,
    },
    filterModalFooter: {
      paddingTop: 4,
    },
    filterModalActions: {
      flexDirection: 'row',
      gap: 10,
    },
    filterSecondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterSecondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    filterPrimaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
    },
    filterPrimaryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    kicker: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 3,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 30 : 34,
      lineHeight: compact ? 36 : 40,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    subtitle: {
      color: colors.shellTextSecondary,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '500',
    },
    loadingState: {
      borderRadius: 28,
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
    emptyState: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      paddingVertical: 32,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    emptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    heroCard: {
      borderRadius: 30,
      backgroundColor: isDark ? colors.primary : colors.shellCardStrong,
      padding: compact ? 20 : 22,
      gap: 16,
      borderWidth: 1,
      borderColor: isDark ? alpha(colors.onPrimary, 0.12) : colors.shellBorder,
      shadowColor: isDark ? colors.primary : alpha(colors.primary, 0.15),
      shadowOpacity: isDark ? 0.28 : 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: isDark ? 6 : 2,
    },
    heroLayout: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 16,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    heroBadgeDark: {
      backgroundColor: alpha(colors.onPrimary, 0.14),
    },
    heroBadgeLight: {
      backgroundColor: alpha(colors.primary, 0.1),
    },
    heroBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.3,
    },
    heroBadgeTextDark: {
      color: colors.onPrimary,
    },
    heroBadgeTextLight: {
      color: colors.primary,
    },
    heroNumberLabel: {
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2,
    },
    heroNumberLabelDark: {
      color: alpha(colors.onPrimary, 0.82),
    },
    heroNumberLabelLight: {
      color: colors.shellTextSoft,
    },
    heroValue: {
      fontSize: compact ? 40 : 48,
      lineHeight: compact ? 44 : 52,
      fontWeight: '900',
      letterSpacing: -1.8,
    },
    heroValueDark: {
      color: colors.onPrimary,
    },
    heroValueLight: {
      color: colors.shellTextPrimary,
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    heroMetaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    heroMetaText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroMetaChipDark: {
      backgroundColor: alpha(colors.onPrimary, 0.12),
    },
    heroMetaChipLight: {
      backgroundColor: alpha(colors.secondaryAccent, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.14),
    },
    heroMetaChipExpense: {
      backgroundColor: alpha(colors.danger, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.16),
    },
    heroMetaTextDark: {
      color: colors.onPrimary,
    },
    heroMetaTextLight: {
      color: colors.shellTextPrimary,
    },
    heroBody: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    heroBodyDark: {
      color: alpha(colors.onPrimary, 0.9),
    },
    heroBodyLight: {
      color: colors.shellTextSecondary,
    },
    heroVisual: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      width: '100%',
      alignSelf: 'stretch',
    },
    heroVisualLegend: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
    },
    heroVisualLegendItem: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
    },
    heroVisualLegendIcon: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    heroVisualLegendIconDark: {
      backgroundColor: alpha(colors.onPrimary, 0.12),
    },
    heroVisualLegendIconLight: {
      backgroundColor: alpha(colors.primary, 0.12),
    },
    heroVisualLegendText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    heroVisualLegendLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    heroVisualLegendValue: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    heroVisualLegendItemDarkIncome: {
      backgroundColor: alpha(colors.onPrimary, 0.1),
      borderColor: alpha(colors.onPrimary, 0.08),
    },
    heroVisualLegendItemDarkBalance: {
      backgroundColor: alpha(colors.onPrimary, 0.1),
      borderColor: alpha(colors.onPrimary, 0.08),
    },
    heroVisualLegendItemLightIncome: {
      backgroundColor: alpha(colors.secondaryAccent, 0.08),
      borderColor: alpha(colors.secondaryAccent, 0.16),
    },
    heroVisualLegendItemLightBalance: {
      backgroundColor: alpha(colors.primary, 0.08),
      borderColor: alpha(colors.primary, 0.16),
    },
    heroVisualLegendLabelDark: {
      color: alpha(colors.onPrimary, 0.78),
    },
    heroVisualLegendLabelLight: {
      color: colors.shellTextSoft,
    },
    heroVisualLegendValueDark: {
      color: colors.onPrimary,
    },
    heroVisualLegendValueLight: {
      color: colors.shellTextPrimary,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    card: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: compact ? 18 : 20,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    cardEyebrow: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    cardTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 28 : 30,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    trendCardHint: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    cardChip: {
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    cardChipText: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    categoryList: {
      gap: 14,
    },
    categoryItem: {
      gap: 10,
    },
    categoryItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryItemCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    categoryIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    categoryTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    categoryAmountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
    },
    categoryName: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    categoryAmount: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '900',
    },
    categoryRank: {
      minWidth: 34,
      height: 22,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryRankText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    categoryTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    categoryFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    categoryMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '700',
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
      minWidth: compact ? 62 : 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 6,
    },
    segmentButtonActive: {
      backgroundColor: colors.primary,
      shadowColor: alpha(colors.primary, 0.28),
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    segmentLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.shellTextMuted,
    },
    segmentLabelActive: {
      color: colors.onPrimary,
    },
    trendSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 4,
    },
    trendSummaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
    },
    trendSummaryDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    trendSummaryLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    trendSummaryValue: {
      color: colors.shellTextPrimary,
      fontSize: 11,
      fontWeight: '800',
      flexShrink: 1,
    },
    trendTooltip: {
      backgroundColor: isDark ? alpha(colors.surfaceContainerHigh, 0.95) : alpha(colors.shellCard, 0.98),
      borderRadius: 14,
      padding: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.2),
    },
    trendTooltipTitle: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 2,
    },
    trendTooltipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    trendTooltipText: {
      color: colors.shellTextSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    trendChartScroll: {
      minWidth: '100%',
    },
    swipeHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 8,
    },
    swipeHintText: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    trendChart: {
      height: compact ? 200 : 230,
      minWidth: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: compact ? 3 : 4,
      paddingTop: 8,
    },
    trendItem: {
      flex: 1,
      minWidth: 28,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      borderRadius: 8,
      paddingTop: 4,
    },
    trendItemSelected: {
      backgroundColor: alpha(colors.primary, isDark ? 0.1 : 0.06),
    },
    trendBarGroup: {
      width: '100%',
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 2,
    },
    trendBar: {
      flex: 1,
      minHeight: 6,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
    },
    trendNetDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    trendLabel: {
      color: colors.shellTextMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    trendTable: {
      gap: 14,
    },
    trendRow: {
      gap: 8,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.shellBorder,
    },
    trendRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    trendRowLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    trendRowPeriod: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    trendRowBars: {
      gap: 6,
    },
    trendRowBarLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trendRowBarLabel: {
      width: 36,
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    trendRowTrack: {
      flex: 1,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    trendRowFillIncome: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    trendRowFillExpense: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.danger,
    },
    trendRowBarValue: {
      width: 60,
      textAlign: 'right',
      color: colors.shellTextSecondary,
      fontSize: 10,
      fontWeight: '700',
    },
    trendRowFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    trendRowNet: {
      fontSize: 11,
      fontWeight: '800',
    },
    calendarContainer: {
      gap: 10,
    },
    calendarMonthLabel: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    calendarWeekHeader: {
      flexDirection: 'row',
      gap: 4,
    },
    calendarWeekday: {
      flex: 1,
      textAlign: 'center',
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    calendarCell: {
      width: `${(100 - 4 * 6) / 7}%`,
      aspectRatio: 1,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    calendarCellEmpty: {
      width: `${(100 - 4 * 6) / 7}%`,
      aspectRatio: 1,
    },
    calendarCellSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    calendarDayNum: {
      color: colors.shellTextPrimary,
      fontSize: 11,
      fontWeight: '700',
    },
    calendarCellAmount: {
      color: colors.shellTextSecondary,
      fontSize: 7,
      fontWeight: '700',
    },
    calendarDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    calendarEmpty: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 20,
    },
    calendarEmptyText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    calendarLegend: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 2,
    },
    calendarLegendLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    insightCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCardStrong,
      padding: compact ? 18 : 20,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    insightHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    insightHeaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    insightHeaderPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexShrink: 0,
    },
    insightHeaderPillText: {
      color: colors.shellTextPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    insightBadge: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      backgroundColor: alpha(colors.primary, 0.12),
      paddingHorizontal: 10,
      paddingVertical: 6,
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    insightTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 20 : 22,
      lineHeight: compact ? 26 : 28,
      fontWeight: '800',
      letterSpacing: -1,
    },
    insightText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    insightStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    emptyInline: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
  });

const metricTonePalette = (colors: AppColorTheme, tone: MetricTone) => {
  const palette = {
    primary: {
      background: alpha(colors.primary, 0.08),
      iconBackground: alpha(colors.primary, 0.14),
      iconColor: colors.primary,
    },
    secondary: {
      background: alpha(colors.secondaryAccent, 0.08),
      iconBackground: alpha(colors.secondaryAccent, 0.14),
      iconColor: colors.secondary,
    },
    warning: {
      background: alpha(colors.warning, 0.08),
      iconBackground: alpha(colors.warning, 0.14),
      iconColor: colors.warning,
    },
    danger: {
      background: alpha(colors.danger, 0.08),
      iconBackground: alpha(colors.danger, 0.14),
      iconColor: colors.danger,
    },
    teal: {
      background: alpha(colors.secondaryAccent, 0.08),
      iconBackground: alpha(colors.secondaryAccent, 0.14),
      iconColor: colors.secondaryAccent,
    },
  } as const;

  return palette[tone];
};

const metricStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      flexBasis: '48%',
      flexGrow: 1,
      minWidth: 138,
      borderRadius: 22,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    value: {
      color: colors.shellTextPrimary,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    meta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
    },
  });

const insightStatStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      flexBasis: '48%',
      flexGrow: 1,
      minWidth: 132,
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      padding: 14,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    label: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    value: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
  });
