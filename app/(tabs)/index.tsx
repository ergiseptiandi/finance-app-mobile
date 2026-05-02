import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { DashboardSkeleton } from '@/components/ui/skeleton';
import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import {
  DailySpendingItem,
  DashboardComparisonData,
  DashboardInsightData,
  DashboardSummaryData,
  getDashboardInsights,
  getComparison,
  getDailySpending,
  getDashboardSummary,
  getMonthlySpending,
  MonthlySpendingItem,
  type DashboardPeriodParams,
} from '@/lib/api/dashboard';
import { listTransactions, type TransactionRecord } from '@/lib/api/transactions';
import { listWallets, type WalletRecord } from '@/lib/api/wallets';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { loadUnreadNotificationCount } from '@/lib/notification-unread-count';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';
import { toast } from '@/components/ui/toast';

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
  insights: DashboardInsightData[];
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

type BudgetRingProps = {
  accent: string;
  label: string;
  progress: number;
  size?: number;
  value: string;
  valueLabel: string;
  textColor: string;
  trackColor: string;
};

const BudgetRing = ({
  accent,
  label,
  progress,
  size = 118,
  value,
  valueLabel,
  textColor,
  trackColor,
}: BudgetRingProps) => {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = clampPercent(progress);
  const strokeDashoffset = circumference * (1 - normalizedProgress / 100);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="budget-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.92} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0.72} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#budget-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}>
          <Text
            numberOfLines={1}
            style={{
            color: textColor,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
          {label}
        </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
            color: textColor,
            fontSize: 20,
            lineHeight: 24,
            fontWeight: '900',
            letterSpacing: -0.8,
          }}>
          {value}
        </Text>
          <Text
            numberOfLines={1}
            style={{
            color: textColor,
            fontSize: 12,
            fontWeight: '700',
            opacity: 0.8,
          }}>
          {valueLabel}
        </Text>
      </View>
    </View>
  );
};

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

const extractComparisonWindowValue = (
  data: DashboardComparisonData | null,
  windowKey: keyof Pick<DashboardComparisonData, 'today_vs_yesterday' | 'this_month_vs_last_month'>,
  field: keyof NonNullable<DashboardComparisonData['today_vs_yesterday']>
) => {
  const windowData = data?.[windowKey];
  return toNumber(windowData?.[field]);
};

const formatExpenseCurrency = (value: number, locale: string) => {
  if (value <= 0) {
    return formatDetailCurrency(0, locale);
  }

  return formatSignedCurrency(-Math.abs(value), locale);
};

const formatPercentValue = (value: number) => `${Math.round(value)}%`;

const getInsightTone = (severity?: string) => {
  switch (severity) {
    case 'critical':
      return 'danger' as const;
    case 'warning':
      return 'warning' as const;
    default:
      return 'primary' as const;
  }
};

const getInsightIcon = (severity?: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (severity) {
    case 'critical':
      return 'alert-octagon-outline';
    case 'warning':
      return 'alert-outline';
    default:
      return 'information-outline';
  }
};

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

export default function DashboardScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const { isOffline } = useNetworkStatus();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, width, insets.top, insets.bottom);
  const [trendMode, setTrendMode] = useState<TrendMode>('monthly');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [dailySpending, setDailySpending] = useState<DailySpendingItem[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpendingItem[]>([]);
  const [comparison, setComparison] = useState<DashboardComparisonData | null>(null);
  const [insights, setInsights] = useState<DashboardInsightData[]>([]);
  const [displayName, setDisplayName] = useState('Kinetic Pulse');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
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
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.greeting.morning');
    if (hour < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(lastUpdated);
  };

  const filtersRef = useRef<DashboardFilters>(createDefaultDashboardFilters());
  const hasDashboardSnapshot = Boolean(summary || comparison || dailySpending.length || monthlySpending.length);
  const sectionAnimations = useMemo(
    () => Array.from({ length: 14 }, () => new Animated.Value(0)),
    []
  );
  const sectionRevealStyles = useMemo(
    () =>
      sectionAnimations.map((value) => ({
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      })),
    [sectionAnimations]
  );

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    sectionAnimations.forEach((value) => value.setValue(0));

    if (loading) {
      return;
    }

    Animated.stagger(
      70,
      sectionAnimations.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [filters.dateMode, filters.endDate, filters.month, filters.startDate, loading, sectionAnimations]);

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
      setInsights(cached.data.insights ?? []);
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
            getDashboardInsights(accessToken, dashboardParams),
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

        const [summaryResult, dailyResult, monthlyResult, comparisonResult, insightsResult] = results;
        const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value.Data : summary;
        const nextDailySpending =
          dailyResult.status === 'fulfilled' ? dailyResult.value.Data : dailySpending;
        const nextMonthlySpending =
          monthlyResult.status === 'fulfilled' ? monthlyResult.value.Data : monthlySpending;
        const nextComparison =
          comparisonResult.status === 'fulfilled' ? comparisonResult.value.Data : comparison;
        const nextInsights = insightsResult.status === 'fulfilled' ? insightsResult.value.Data : insights;

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

        if (insightsResult.status === 'fulfilled') {
          setInsights(nextInsights);
        }

        await writeScreenCache(buildScreenCacheKey('dashboard', session.user.id, cacheSuffix), {
          summary: nextSummary,
          dailySpending: nextDailySpending,
          monthlySpending: nextMonthlySpending,
          comparison: nextComparison,
          insights: nextInsights,
          displayName: nextDisplayName,
        });

        setLastUpdated(new Date());

        listTransactions(session.token.access_token, { page: 1, per_page: 5 })
          .then((txResponse) => {
            setRecentTransactions(txResponse.Data.data ?? []);
          })
          .catch(() => {});

        listWallets(session.token.access_token)
          .then((walletResponse) => {
            setWallets(walletResponse.Data ?? []);
          })
          .catch(() => {});

        const hasHardFailure = results.some(
          (result) =>
            result.status === 'rejected' &&
            !(result.reason instanceof ApiRequestError && result.reason.status === 401)
        );

        if (hasHardFailure) {
          if (isOffline && hasDashboardSnapshot) {
            return;
          }

          setError(isOffline ? t('common.offlineLoadError') : t('dashboard.partialError'));
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          router.replace('/login');
          return;
        }

        if (isOffline && hasDashboardSnapshot) {
          setError('');
          return;
        }

        setError(isOffline ? t('common.offlineLoadError') : t('dashboard.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [comparison, dailySpending, hasDashboardSnapshot, insights, isOffline, monthlySpending, summary, t]
  );

  const loadUnreadNotifications = useCallback(async () => {
    try {
      const session = await getAuthSession();

      if (!session) {
        setUnreadNotificationCount(0);
        return;
      }

      try {
        setUnreadNotificationCount(await loadUnreadNotificationCount(session.token.access_token));
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) {
            setUnreadNotificationCount(await loadUnreadNotificationCount(refreshed.token.access_token));
          }
        }
      }
    } catch {
      setUnreadNotificationCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(false, filtersRef.current);
      void loadUnreadNotifications();
    }, [loadDashboard, loadUnreadNotifications])
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

  const totalBalance = toNumber(summary?.total_balance);
  const netWorth = toNumber(summary?.net_worth ?? totalBalance);
  const periodBalance = toNumber(summary?.period_balance);
  const monthlyIncome = toNumber(summary?.monthly_income);
  const monthlyExpense = toNumber(summary?.monthly_expense);
  const consumptionExpense = toNumber(summary?.consumption_expense ?? monthlyExpense);
  const debtRepayment = toNumber(summary?.debt_repayment ?? 0);
  const netCashflow = toNumber(summary?.net_cashflow ?? monthlyIncome - consumptionExpense);
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
    (totalBalance > 0 ? (remainingDebt / totalBalance) * 100 : 0)
  );
  const debtCompletion = toNumber(dashboardDebt?.completion_rate);
  const debtHealthScore = clampPercent(100 - Math.max(0, debtToIncome));
  const debtHealthLabel =
    debtHealthScore >= 75
      ? language === 'id'
        ? 'Sehat'
        : 'Healthy'
      : debtHealthScore >= 45
        ? language === 'id'
          ? 'Waspada'
          : 'Watch'
        : language === 'id'
          ? 'Perlu perhatian'
          : 'Needs attention';
  const todayExpense = extractComparisonWindowValue(comparison, 'today_vs_yesterday', 'current') ||
    extractComparisonValue(comparison, ['today_expense', 'today', 'todayAmount']);
  const yesterdayExpense = extractComparisonWindowValue(comparison, 'today_vs_yesterday', 'previous') ||
    extractComparisonValue(comparison, ['yesterday_expense', 'yesterday', 'yesterdayAmount']);
  const thisMonthExpense = extractComparisonWindowValue(comparison, 'this_month_vs_last_month', 'current') ||
    extractComparisonValue(comparison, ['this_month_expense', 'thisMonth', 'this_month']);
  const lastMonthExpense = extractComparisonWindowValue(comparison, 'this_month_vs_last_month', 'previous') ||
    extractComparisonValue(comparison, ['last_month_expense', 'lastMonth', 'last_month']);

  const monthlyMomentum =
    toNumber(comparison?.this_month_vs_last_month?.percentage_change) ||
    (lastMonthExpense > 0
      ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100
      : thisMonthExpense > 0
        ? 100
        : 0);
  const momentumPrefix = monthlyMomentum > 0 ? '+' : '';
  const momentumIcon = monthlyMomentum >= 0 ? 'trending-up' : 'trending-down';
  const activePeriodLabel = getDashboardFilterLabel(filters, locale) || t('dashboard.filter.currentPeriod');
  const filterModeLabel =
    filters.dateMode === 'month' ? t('dashboard.filter.monthMode') : t('dashboard.filter.rangeMode');
  const budgetSummary = summary?.budget_summary ?? null;
  const budgetGoalsProgress = summary?.goals_progress ?? [];
  const budgetPreview = budgetGoalsProgress.slice(0, 2);
  const budgetUsage = toNumber(budgetSummary?.usage_rate);
  const budgetActiveGoals = budgetGoalsProgress.length;
  const budgetOverBudgetCount = budgetGoalsProgress.filter((goal) => goal?.status === 'over_budget').length;
  const budgetOnTrackCount = budgetGoalsProgress.filter((goal) => goal?.status === 'on_track').length;
  const budgetActiveLabel = language === 'id' ? 'Aktif' : 'Active';
  const budgetHealthyLabel = language === 'id' ? 'Sehat' : 'Healthy';
  const budgetStatusLabel = budgetSummary
    ? budgetSummary.is_over_budget
      ? t('dashboard.budgetOverBudget')
      : budgetUsage >= 80
        ? t('dashboard.budgetOnTrack')
      : t('dashboard.budgetUnderBudget')
    : t('dashboard.budgetEmptyState');
  const categoryBreakdownPreview = summary?.category_breakdown_preview ?? [];
  const categoryTopThree = categoryBreakdownPreview.slice(0, 3);
  const cashflowSignalLabel =
    savingsRate >= 0
      ? language === 'id'
        ? 'Arus kas positif'
        : 'Positive cashflow'
      : language === 'id'
        ? 'Arus kas negatif'
        : 'Negative cashflow';
  const budgetSignalLabel =
    budgetSummary?.is_over_budget
      ? language === 'id'
        ? 'Lewat batas'
        : 'Over budget'
      : budgetUsage >= 80
        ? language === 'id'
          ? 'Mendekati batas'
          : 'Near limit'
        : language === 'id'
          ? 'Aman'
          : 'Healthy';
  const debtSignalLabel = debtHealthLabel;

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

  const dashboardInsights = useMemo<DashboardInsightData[]>(() => {
    if (insights.length > 0) {
      return insights;
    }

    if (!summary) {
      return [];
    }

    return [
      {
        type: 'summary',
        code: 'summary_fallback',
        title: t('dashboard.summaryInsightTitle'),
        message: t('dashboard.insightBody', {
          amount: formatDetailCurrency(totalBalance, locale),
        }),
        severity: 'info',
      },
    ];
  }, [insights, locale, summary, t, totalBalance]);
  const priorityInsights = dashboardInsights.slice(0, 3);

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
  const activityPreviewItems = activityItems.slice(0, 2);

  const summaryHighlights = useMemo(
    () => [
      {
        label: language === 'id' ? 'Saldo Total' : 'Total Balance',
        value: formatCompactCurrency(totalBalance, locale),
        meta: language === 'id' ? 'Seluruh saldo wallet' : 'All wallet balances',
      },
      {
        label: language === 'id' ? 'Pemasukan' : 'Income',
        value: formatCompactCurrency(monthlyIncome, locale),
        meta: language === 'id' ? 'Total pemasukan periode' : 'Period total income',
      },
      {
        label: language === 'id' ? 'Pengeluaran Konsumsi' : 'Consumption',
        value: formatCompactCurrency(consumptionExpense, locale),
        meta: language === 'id' ? 'Tanpa bayar utang' : 'Excluding debt payments',
      },
      {
        label: language === 'id' ? 'Arus Kas Bersih' : 'Net Cashflow',
        value: formatSignedCurrency(netCashflow, locale),
        meta: language === 'id' ? 'Pemasukan dikurangi konsumsi' : 'Income minus consumption',
      },
    ],
    [consumptionExpense, locale, monthlyIncome, netCashflow, t, totalBalance, language]
  );

  return (
    <View style={styles.root}>
      <StatusBar animated style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadDashboard(true, filtersRef.current);
              void loadUnreadNotifications();
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.topBar, sectionRevealStyles[0]]}>
          <View style={styles.brandBlock}>
            <View style={styles.brandAvatar}>
              <MaterialCommunityIcons name="account-circle" size={20} color={colors.primary} />
            </View>
            <View style={{ gap: 2 }}>
              <Text numberOfLines={1} style={styles.brandGreeting}>
                {getTimeGreeting()}
              </Text>
              <Text numberOfLines={1} style={styles.brandName}>
                {displayName}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => router.push('/notifications')} style={styles.iconButton}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={colors.shellTextPrimary} />
              {unreadNotificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </Animated.View>

        {loading ? (
          <DashboardSkeleton colors={colors} />
        ) : (
          <>
            <Animated.View style={[styles.heroBlock, sectionRevealStyles[1]]}>
              <Text style={styles.kicker}>{t('dashboard.kicker')}</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.62}
                style={styles.heroAmount}>
                {formatCompactCurrency(totalBalance, locale)}
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
            </Animated.View>

            <Animated.View style={[styles.filterCard, sectionRevealStyles[2]]}>
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
            </Animated.View>

            <Animated.View style={[styles.liquidCard, sectionRevealStyles[3]]}>
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
            </Animated.View>

            <Animated.View style={[styles.summaryCard, sectionRevealStyles[4]]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('dashboard.summary.title')}</Text>
                  <Text style={styles.cardTitle}>{activePeriodLabel}</Text>
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
            </Animated.View>

            <Animated.View style={[styles.summaryCard, sectionRevealStyles[5]]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('dashboard.budgetGoals')}</Text>
                  <Text style={styles.cardTitle}>{t('dashboard.budgetGoalsTitle')}</Text>
                </View>
              </View>

              <View style={styles.budgetSnapshotRow}>
                <View style={styles.budgetRingShell}>
                  <BudgetRing
                    accent={budgetSummary?.is_over_budget ? colors.danger : colors.primary}
                    label={t('dashboard.budgetUsage')}
                    progress={budgetUsage}
                    value={formatPercentValue(budgetUsage)}
                    valueLabel={budgetStatusLabel}
                    textColor={colors.shellTextPrimary}
                    trackColor={colors.shellCardSoft}
                  />
                </View>

                <View style={styles.budgetSnapshotCopy}>
                  <Text style={styles.budgetSnapshotEyebrow}>{t('dashboard.budgetGoals')}</Text>
                  <Text style={styles.budgetSnapshotTitle}>{budgetStatusLabel}</Text>
                  <Text style={styles.budgetSnapshotBody}>
                    {budgetSummary
                      ? language === 'id'
                        ? `Sisa budget ${formatCompactCurrency(toNumber(budgetSummary.remaining), locale)} dari target bulan ini.`
                        : `Budget left ${formatCompactCurrency(toNumber(budgetSummary.remaining), locale)} from this month target.`
                      : t('dashboard.budgetEmptyBody')}
                  </Text>

                  <View style={styles.budgetSnapshotStats}>
                    <View style={styles.budgetSnapshotStat}>
                      <Text style={styles.budgetSnapshotStatLabel}>{budgetActiveLabel}</Text>
                      <Text style={styles.budgetSnapshotStatValue}>{budgetActiveGoals}</Text>
                    </View>
                    <View style={styles.budgetSnapshotStat}>
                      <Text style={styles.budgetSnapshotStatLabel}>{budgetHealthyLabel}</Text>
                      <Text style={styles.budgetSnapshotStatValue}>{budgetOnTrackCount}</Text>
                    </View>
                  </View>
                  {budgetOverBudgetCount > 0 ? (
                    <Text style={styles.budgetSnapshotNote}>
                      {language === 'id'
                        ? `${budgetOverBudgetCount} target melewati batas`
                        : `${budgetOverBudgetCount} goals over budget`}
                    </Text>
                  ) : null}
                </View>
              </View>

              {budgetSummary ? (
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryMetric}>
                    <Text style={styles.summaryMetricLabel}>{t('dashboard.budgetMonthly')}</Text>
                    <Text style={styles.summaryMetricValue}>{formatCompactCurrency(toNumber(budgetSummary.monthly_budget), locale)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={styles.summaryMetricLabel}>{t('dashboard.budgetSpent')}</Text>
                    <Text style={styles.summaryMetricValue}>{formatCompactCurrency(toNumber(budgetSummary.spent), locale)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={styles.summaryMetricLabel}>{t('dashboard.budgetRemaining')}</Text>
                    <Text style={styles.summaryMetricValue}>{formatCompactCurrency(toNumber(budgetSummary.remaining), locale)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={styles.summaryMetricLabel}>{t('dashboard.budgetUsage')}</Text>
                    <Text style={styles.summaryMetricValue}>{formatPercentValue(toNumber(budgetSummary.usage_rate))}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.budgetEmptyState}>
                  <MaterialCommunityIcons name="target" size={22} color={colors.shellTextMuted} />
                  <Text style={styles.budgetEmptyTitle}>{t('dashboard.budgetEmptyTitle')}</Text>
                  <Text style={styles.budgetEmptyBody}>{t('dashboard.budgetEmptyBody')}</Text>
                </View>
              )}

              {budgetSummary?.is_over_budget ? (
                <View style={styles.budgetAlert}>
                  <Text style={styles.budgetAlertText}>
                    {t('dashboard.budgetOverBudgetBody', {
                      amount: formatCompactCurrency(toNumber(budgetSummary.over_budget_amount), locale),
                    })}
                  </Text>
                </View>
              ) : null}

              {budgetPreview.length > 0 ? (
                <View style={styles.budgetPreviewList}>
                  {budgetPreview.map((goal) => {
                    const tone =
                      goal.status === 'over_budget'
                        ? colors.danger
                        : goal.status === 'on_track'
                          ? colors.secondary
                          : colors.primary;

                    return (
                      <View key={`${goal.name}-${goal.target_amount}`} style={styles.budgetPreviewItem}>
                        <View style={styles.budgetPreviewHeader}>
                          <View style={styles.budgetPreviewCopy}>
                            <Text numberOfLines={1} style={styles.budgetPreviewTitle}>
                              {goal.name}
                            </Text>
                            <Text style={styles.budgetPreviewMeta}>
                              {formatCompactCurrency(toNumber(goal.current_amount), locale)} / {formatCompactCurrency(toNumber(goal.target_amount), locale)}
                            </Text>
                          </View>
                          <View style={[styles.budgetPreviewPill, { backgroundColor: alpha(tone, 0.14) }]}>
                            <Text style={[styles.budgetPreviewPillText, { color: tone }]}>{formatPercentValue(toNumber(goal.progress_percentage))}</Text>
                          </View>
                        </View>
                        <View style={styles.budgetPreviewTrack}>
                          <View style={[styles.budgetPreviewFill, { width: `${clampPercent(toNumber(goal.progress_percentage))}%`, backgroundColor: tone }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Pressable onPress={() => router.push('/budgets')} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>{t('dashboard.manageBudgetGoals')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.card, sectionRevealStyles[6]]}>
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
                  trendPoints.map((point, index) => (
                    <Pressable
                      key={`${point.label}-${point.value}`}
                      onPress={() => setSelectedBarIndex(selectedBarIndex === index ? null : index)}
                      style={styles.trendItem}>
                      {selectedBarIndex === index ? (
                        <View style={styles.tooltipContainer}>
                          <Text style={styles.tooltipText}>
                            {formatCompactCurrency(point.value, locale)}
                          </Text>
                          <View style={styles.tooltipArrow} />
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.trendBar,
                          { height: `${Math.max(26, (point.value / trendPeak) * 100)}%` },
                          point.active && styles.trendBarActive,
                          selectedBarIndex === index && { backgroundColor: colors.primary },
                        ]}
                      />
                      <Text numberOfLines={1} style={styles.trendLabel}>
                        {point.label}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.trendEmpty}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={22} color={colors.shellTextMuted} />
                    <Text style={styles.trendEmptyTitle}>{t('dashboard.noTrendData')}</Text>
                    <Text style={styles.trendEmptyMeta}>{t('dashboard.noTrendDataBody')}</Text>
                  </View>
                )}
              </View>
            </Animated.View>

            <Animated.View style={[styles.card, sectionRevealStyles[7]]}>
              <View style={styles.debtStatusRow}>
                <View style={[styles.debtStatusPill, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.1) }]}>
                  <Text style={[styles.debtStatusPillText, { color: colors.primary }]}>{debtHealthLabel}</Text>
                </View>
                <Text style={styles.debtStatusMeta}>
                  {language === 'id'
                    ? `Skor kesehatan ${formatPercentValue(debtHealthScore)}`
                    : `Health score ${formatPercentValue(debtHealthScore)}`}
                </Text>
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

              <View style={styles.debtStatusTrack}>
                <View
                  style={[
                    styles.debtStatusFill,
                    {
                      width: `${debtHealthScore}%`,
                      backgroundColor:
                        debtHealthScore >= 75
                          ? colors.secondary
                          : debtHealthScore >= 45
                            ? colors.warning
                            : colors.danger,
                    },
                  ]}
                />
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.cardEyebrow}>{t('dashboard.leverageRatio')}</Text>
                <Text style={styles.metricValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
                <Text style={styles.metricMeta}>{t('dashboard.debtBalanceRatio', { percent: formatPercentValue(Math.max(0, debtToBalance)) })}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    router.navigate('/debt');
                  }}
                  style={[styles.secondaryAction, { flex: 1 }]}>
                  <Text style={styles.secondaryActionText}>{t('dashboard.consolidate')}</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    toast.info(language === 'id' ? 'Buka halaman utang untuk bayar' : 'Open debt page to make payment');
                    router.navigate('/debt');
                  }}
                  style={[styles.secondaryAction, { flex: 1, backgroundColor: colors.warning }]}>
                  <MaterialCommunityIcons name="cash-fast" size={16} color={colors.onPrimary} />
                  <Text style={styles.secondaryActionText}>
                    {language === 'id' ? 'Bayar Utang' : 'Pay Debt'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View style={[styles.card, sectionRevealStyles[8]]}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{t('dashboard.recentTransactions')}</Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    router.navigate('/activity');
                  }}>
                  <Text style={styles.linkText}>{t('dashboard.recentTransactionsViewAll')}</Text>
                </Pressable>
              </View>

              <View style={styles.activityList}>
                {recentTransactions.length > 0 ? (
                  recentTransactions.map((tx) => {
                    const isIncome = tx.type === 'income';
                    const iconBg = alpha(isIncome ? colors.secondaryAccent : colors.primary, isDark ? 0.18 : 0.1);
                    return (
                      <View key={tx.id} style={styles.activityItem}>
                        <View style={styles.activityLeft}>
                          <View style={[styles.activityIconWrap, { backgroundColor: iconBg }]}>
                            <MaterialCommunityIcons
                              name={isIncome ? 'cash-fast' : 'cart-outline'}
                              size={18}
                              color={isIncome ? colors.secondaryAccent : colors.primary}
                            />
                          </View>
                          <View style={styles.activityCopy}>
                            <Text numberOfLines={1} style={styles.activityTitle}>
                              {tx.category}
                            </Text>
                            <Text numberOfLines={1} style={styles.activityMeta}>
                              {tx.description?.trim() || tx.category} • {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(tx.date))}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.activityRight}>
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                            style={[styles.activityAmount, isIncome && styles.activityAmountPositive]}>
                            {isIncome ? '+' : '-'}{formatCompactCurrency(tx.amount, locale)}
                          </Text>
                          <Text numberOfLines={1} style={styles.activityKind}>
                            {isIncome ? t('activity.transactions.income') : t('activity.transactions.expense')}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
                    <MaterialCommunityIcons name="swap-horizontal" size={24} color={colors.shellTextMuted} />
                    <Text style={{ color: colors.shellTextMuted, fontSize: 13, fontWeight: '600' }}>
                      {t('dashboard.recentTransactionsEmpty')}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>

            {summary?.upcoming_bills && Number(summary.upcoming_bills.count) > 0 ? (
              <Animated.View style={[styles.card, sectionRevealStyles[9]]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{t('dashboard.upcomingBills')}</Text>
                  <MaterialCommunityIcons name="calendar-clock-outline" size={14} color={colors.danger} />
                </View>
                <View style={styles.billsRow}>
                  <View style={styles.billsIconWrap}>
                    <MaterialCommunityIcons name="receipt-text-outline" size={18} color={colors.danger} />
                  </View>
                  <View style={styles.billsCopy}>
                    <Text style={styles.billsTitle}>
                      {t('dashboard.upcomingBillsCount', { count: String(summary.upcoming_bills.count) })}
                    </Text>
                    {summary.upcoming_bills.next_due_date ? (
                      <Text style={styles.billsMeta}>
                        {t('dashboard.upcomingBillsNextDue')}: {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(summary.upcoming_bills.next_due_date))}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.billsRight}>
                    <Text style={styles.billsAmount}>
                      {formatCompactCurrency(Number(summary.upcoming_bills.total_amount) || 0, locale)}
                    </Text>
                    <Text style={styles.billsMeta}>{t('dashboard.upcomingBillsTotal')}</Text>
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {wallets.length > 0 ? (
              <Animated.View style={[styles.card, sectionRevealStyles[10]]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{t('dashboard.walletSummary')}</Text>
                  <Text style={styles.cardEyebrow}>
                    {formatCompactCurrency(
                      wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0),
                      locale
                    )}
                  </Text>
                </View>
                {wallets.slice(0, 4).map((wallet) => (
                  <View key={wallet.id} style={styles.walletItem}>
                    <View style={styles.walletLeft}>
                      <View style={styles.walletIconWrap}>
                        <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
                      </View>
                      <Text numberOfLines={1} style={styles.walletName}>{wallet.name}</Text>
                    </View>
                    <Text style={styles.walletBalance}>
                      {formatCompactCurrency(Number(wallet.balance) || 0, locale)}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            ) : null}

            {summary?.top_merchants_preview && summary.top_merchants_preview.length > 0 ? (
              <Animated.View style={[styles.card, sectionRevealStyles[11]]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{t('dashboard.topMerchants')}</Text>
                  <Text style={styles.cardEyebrow}>{t('dashboard.topMerchantsBody')}</Text>
                </View>
                {summary.top_merchants_preview.slice(0, 3).map((merchant, index) => (
                  <View key={merchant.merchant_name} style={styles.merchantItem}>
                    <View style={styles.merchantLeft}>
                      <View style={styles.merchantRank}>
                        <Text style={styles.merchantRankText}>{index + 1}</Text>
                      </View>
                      <View>
                        <Text numberOfLines={1} style={styles.merchantName}>{merchant.merchant_name}</Text>
                        <Text style={styles.merchantMeta}>
                          {t('dashboard.topMerchantsCount', { count: String(merchant.transaction_count) })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.merchantRight}>
                      <Text style={styles.merchantAmount}>
                        {formatCompactCurrency(Number(merchant.amount) || 0, locale)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : null}

            <Animated.View style={[styles.insightCard, sectionRevealStyles[12]]}>
              <View style={styles.insightHero}>
                <View style={styles.insightHeroTop}>
                  <View style={styles.insightHeroBadge}>
                    <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.insightHeroCopy}>
                    <Text style={styles.insightBadge}>{t('dashboard.pulseInsight')}</Text>
                    <Text style={styles.insightTitle}>{t('dashboard.insightsSectionTitle')}</Text>
                    <Text style={styles.insightText}>{t('dashboard.insightsSectionBody')}</Text>
                  </View>
                </View>
                <View style={styles.insightHeroPill}>
                  <MaterialCommunityIcons name="priority-high" size={12} color={colors.primary} />
                  <Text style={styles.insightHeroPillText}>
                    {language === 'id' ? '3 prioritas' : '3 priorities'}
                  </Text>
                </View>
              </View>
              <View style={styles.insightSignalGrid}>
                <View style={styles.insightSignalCard}>
                  <View style={[styles.insightSignalIcon, { backgroundColor: alpha(colors.onPrimary, 0.12) }]}>
                    <MaterialCommunityIcons name="bank-outline" size={16} color={colors.secondary} />
                  </View>
                  <Text style={styles.insightSignalLabel}>
                    {language === 'id' ? 'Utang' : 'Debt'}
                  </Text>
                  <Text style={styles.insightSignalValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
                  <Text style={styles.insightSignalMeta}>{debtSignalLabel}</Text>
                </View>

                <View style={styles.insightSignalCard}>
                  <View style={[styles.insightSignalIcon, { backgroundColor: alpha(colors.onPrimary, 0.12) }]}>
                    <MaterialCommunityIcons name="wallet-outline" size={16} color={colors.warning} />
                  </View>
                  <Text style={styles.insightSignalLabel}>
                    {language === 'id' ? 'Budget' : 'Budget'}
                  </Text>
                  <Text style={styles.insightSignalValue}>{formatPercentValue(budgetUsage)}</Text>
                  <Text style={styles.insightSignalMeta}>{budgetSignalLabel}</Text>
                </View>
              </View>

              <View style={styles.insightCompareStrip}>
                <View style={styles.insightCompareIcon}>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={15} color={colors.primary} />
                </View>
                <View style={styles.insightCompareCopy}>
                  <Text style={styles.insightCompareTitle}>
                    {language === 'id' ? 'Utang vs arus kas' : 'Debt vs cash flow'}
                  </Text>
                  <Text style={styles.insightCompareMeta}>
                    {language === 'id'
                      ? `Utang ${formatPercentValue(Math.max(0, debtToIncome))} · Arus kas ${formatPercentValue(Math.max(0, savingsRate))} · ${cashflowSignalLabel}`
                      : `Debt ${formatPercentValue(Math.max(0, debtToIncome))} · Cash flow ${formatPercentValue(Math.max(0, savingsRate))} · ${cashflowSignalLabel}`}
                  </Text>
                </View>
                <View style={styles.insightCompareChips}>
                  <View style={[styles.insightCompareChip, { backgroundColor: colors.shellCardSoft, borderWidth: 1, borderColor: colors.shellBorder }]}>
                    <Text style={[styles.insightCompareChipText, { color: colors.danger }]}>
                      {formatPercentValue(Math.max(0, debtToIncome))}
                    </Text>
                  </View>
                  <View style={[styles.insightCompareChip, { backgroundColor: colors.shellCardSoft, borderWidth: 1, borderColor: colors.shellBorder }]}>
                    <Text style={[styles.insightCompareChipText, { color: colors.secondary }]}>
                      {formatPercentValue(Math.max(0, savingsRate))}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.insightCategorySection}>
                <View style={styles.insightSectionHeader}>
                  <Text style={styles.insightSectionTitle}>
                    {language === 'id' ? 'Komposisi pengeluaran' : 'Spending composition'}
                  </Text>
                  <Text style={styles.insightSectionMeta}>
                    {language === 'id'
                      ? '3 kategori terbesar periode aktif'
                      : 'Top 3 categories for the active period'}
                  </Text>
                </View>

                {categoryTopThree.length > 0 ? (
                  <>
                    <View style={styles.insightStackBar}>
                      {categoryTopThree.map((item, index) => {
                        const value = Math.max(0, toNumber(item.percentage));
                        const tone =
                          index === 0
                            ? colors.primary
                            : index === 1
                              ? colors.secondary
                              : colors.warning;

                        return (
                          <View
                            key={`${item.category}-${index}`}
                            style={[
                              styles.insightStackSegment,
                              {
                                width: `${Math.max(8, value)}%`,
                                backgroundColor: tone,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>

                    <View style={styles.insightCategoryList}>
                      {categoryTopThree.map((item, index) => {
                        const value = Math.max(0, toNumber(item.percentage));
                        const icon = getCategoryIcon(item.category);
                        const tone =
                          index === 0
                            ? colors.primary
                            : index === 1
                              ? colors.secondary
                              : colors.warning;

                        return (
                          <View key={`${item.category}-${item.amount}`} style={styles.insightCategoryItem}>
                            <View style={[styles.insightCategoryIcon, { backgroundColor: alpha(tone, 0.14) }]}>
                              <MaterialCommunityIcons name={icon} size={15} color={tone} />
                            </View>
                            <View style={styles.insightCategoryCopy}>
                              <Text numberOfLines={1} style={styles.insightCategoryTitle}>
                                {normalizeCategoryLabel(item.category, language)}
                              </Text>
                              <Text style={styles.insightCategoryMeta}>
                                {formatCompactCurrency(toNumber(item.amount), locale)}
                              </Text>
                            </View>
                            <View style={styles.insightCategoryRight}>
                              <Text style={styles.insightCategoryPercent}>{formatPercentValue(value)}</Text>
                              <View style={styles.insightCategoryBarTrack}>
                                <View
                                  style={[
                                    styles.insightCategoryBarFill,
                                    {
                                      width: `${Math.max(8, value)}%`,
                                      backgroundColor: tone,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <Text style={styles.insightEmptyText}>
                    {language === 'id' ? 'Belum ada komposisi kategori untuk ditampilkan.' : 'No category composition is available yet.'}
                  </Text>
                )}
              </View>

              <View style={styles.insightList}>
                {priorityInsights.length > 0 ? (
                  priorityInsights.map((item) => {
                    const toneKey = getInsightTone(item.severity);
                    const tone =
                      toneKey === 'danger'
                        ? colors.danger
                        : toneKey === 'warning'
                          ? colors.warning
                          : colors.primary;
                    const label =
                      toneKey === 'danger'
                        ? language === 'id'
                          ? 'Prioritas tinggi'
                          : 'High priority'
                        : toneKey === 'warning'
                          ? language === 'id'
                            ? 'Perlu perhatian'
                            : 'Needs attention'
                          : language === 'id'
                            ? 'Informasi'
                            : 'Info';

                    return (
                      <View key={`${item.code}-${item.title}`} style={styles.insightItem}>
                        <View style={[styles.insightItemRail, { backgroundColor: tone }]} />
                        <View style={[styles.insightItemIcon, { backgroundColor: alpha(tone, 0.14) }]}>
                          <MaterialCommunityIcons name={getInsightIcon(item.severity)} size={15} color={tone} />
                        </View>
                        <View style={styles.insightItemCopy}>
                          <View style={styles.insightItemHead}>
                            <Text style={[styles.insightItemTag, { color: tone }]}>{label}</Text>
                          </View>
                          <Text style={styles.insightItemTitle}>{item.title}</Text>
                          <Text style={styles.insightItemText}>{item.message}</Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.insightEmptyText}>{t('dashboard.insightsEmptyBody')}</Text>
                )}
              </View>

              <Pressable
                onPress={() => {
                  router.navigate('/reports');
                }}
                style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>{t('dashboard.optimizeStrategy')}</Text>
              </Pressable>
            </Animated.View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>

      {fabMenuOpen ? (
        <Pressable style={styles.fabOverlay} onPress={() => setFabMenuOpen(false)} />
      ) : null}

      <View style={styles.fabContainer}>
        {fabMenuOpen ? (
          <View style={styles.fabMenu}>
            <Pressable
              onPress={() => { setFabMenuOpen(false); router.push('/wallets'); }}
              style={styles.fabMenuItem}>
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.fabMenuLabel}>Wallet</Text>
            </Pressable>
            <Pressable
              onPress={() => { setFabMenuOpen(false); router.push('/categories'); }}
              style={styles.fabMenuItem}>
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.secondaryAccent, 0.12) }]}>
                <MaterialCommunityIcons name="shape-outline" size={18} color={colors.secondaryAccent} />
              </View>
              <Text style={styles.fabMenuLabel}>Kategori</Text>
            </Pressable>
            <Pressable
              onPress={() => { setFabMenuOpen(false); router.push('/budgets'); }}
              style={styles.fabMenuItem}>
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.warning, 0.12) }]}>
                <MaterialCommunityIcons name="flag-outline" size={18} color={colors.warning} />
              </View>
              <Text style={styles.fabMenuLabel}>Anggaran</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => setFabMenuOpen(!fabMenuOpen)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
          <MaterialCommunityIcons
            name={fabMenuOpen ? 'close' : 'plus'}
            size={26}
            color={colors.onPrimary}
          />
        </Pressable>
      </View>

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

    </View>
  );
}

const createStyles = (colors: AppColorTheme, width: number, topInset: number, bottomInset: number) => {
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
      alignItems: 'center',      gap: 12,
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
    brandGreeting: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    lastUpdatedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.shellCardMuted,
    },
    lastUpdatedText: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    iconButton: {
      position: 'relative',
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    notificationBadge: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      borderRadius: 999,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
      borderWidth: 2,
      borderColor: colors.shellBackground,
    },
    notificationBadgeText: {
      color: colors.onPrimary,
      fontSize: 9,
      lineHeight: 12,
      fontWeight: '900',
    },
    loadingState: {
      marginTop: 20,
      borderRadius: 24,
      backgroundColor: colors.shellCardSoft,
      paddingVertical: 40,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    loadingText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    heroBlock: {
      gap: 12,
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: compact ? 18 : 20,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    filterCard: {
      borderRadius: 20,
      backgroundColor: colors.shellCardSoft,
      padding: compact ? 14 : 16,
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
      fontSize: 12,
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
      gap: 12,
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
      fontSize: 12,
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
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: compact ? 17 : 19,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    summaryCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: compact ? 18 : 20,
      gap: 14,
      borderWidth: 1,
      borderColor: alpha(colors.primary, isDark ? 0.16 : 0.1),
    },
    liquidCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCardMuted,
      padding: compact ? 18 : 20,
      gap: 14,
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
      gap: 12,
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
    summaryBadgeDanger: {
      backgroundColor: alpha(colors.danger, isDark ? 0.18 : 0.12),
    },
    summaryBadgeLabel: {
      color: colors.shellTextPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryBadgeLabelDanger: {
      color: colors.danger,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    summaryMetric: {
      width: compact ? '100%' : '48%',
      borderRadius: 16,
      backgroundColor: colors.shellCardSoft,
      padding: 13,
      gap: 6,
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
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      flexShrink: 1,
    },
    budgetEmptyState: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    budgetEmptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    budgetEmptyBody: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    budgetAlert: {      borderRadius: 20,
      backgroundColor: alpha(colors.danger, isDark ? 0.14 : 0.1),
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    budgetAlertText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    budgetPreviewList: {
      gap: 8,
    },
    budgetPreviewItem: {
      gap: 6,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      padding: 12,
    },
    budgetPreviewHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    budgetPreviewCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    budgetPreviewTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    budgetPreviewMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    budgetPreviewPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    budgetPreviewPillText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    budgetPreviewTrack: {
      height: 3,
      borderRadius: 999,
      backgroundColor: colors.shellCard,
      overflow: 'hidden',
    },
    budgetPreviewFill: {
      height: '100%',
      borderRadius: 999,
    },
    summaryStatsRow: {
      flexDirection: compact ? 'column' : 'row',
      gap: 12,
    },
    summaryStatPill: {
      flex: 1,
      width: compact ? '100%' : undefined,
      borderRadius: 16,
      backgroundColor: colors.shellCardSoft,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 3,
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
    budgetSnapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 2,
    },
    budgetRingShell: {
      width: 118,
      alignItems: 'center',
      justifyContent: 'center',
    },
    budgetSnapshotCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    budgetSnapshotEyebrow: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      lineHeight: 14,
    },
    budgetSnapshotTitle: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    budgetSnapshotBody: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    budgetSnapshotStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    budgetSnapshotStat: {
      flexGrow: 1,
      minWidth: 86,
      borderRadius: 14,
      backgroundColor: colors.shellCardSoft,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    budgetSnapshotStatLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      lineHeight: 12,
    },
    budgetSnapshotStatValue: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 18,
      fontWeight: '900',
    },
    budgetSnapshotNote: {
      color: colors.warning,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    segmentedControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      backgroundColor: colors.shellCardSoft,
      borderRadius: 16,
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
      position: 'relative',
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
      shadowColor: alpha(colors.primary, 0.2),
      shadowOpacity: 1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
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
      width: 36,
      height: 36,
      borderRadius: 10,
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
    debtStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    debtStatusPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    debtStatusPillText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    debtStatusMeta: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextMuted,      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      textAlign: 'right',
    },
    debtStatusTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.shellCardSoft,
      overflow: 'hidden',
      marginTop: 2,
    },
    debtStatusFill: {
      height: '100%',
      borderRadius: 999,
    },
    metricCard: {
      borderRadius: 16,
      backgroundColor: colors.shellCardSoft,
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
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
    },
    secondaryAction: {
      minHeight: 54,
      borderRadius: 20,
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
      gap: 12,
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
      width: 36,
      height: 36,
      borderRadius: 10,
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
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
    },
    activityMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    activityRight: {
      width: compact ? 84 : 96,
      alignItems: 'flex-end',
      gap: 3,
    },
    activityAmount: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 14 : 16,
      lineHeight: compact ? 18 : 20,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    activityAmountPositive: {
      color: colors.secondary,
    },
    activityKind: {
      color: colors.shellTextSoft,
      fontSize: 9,
      fontWeight: '700',
    },
    insightCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCardStrong,
      padding: compact ? 18 : 20,
      gap: 16,
      overflow: 'hidden',
      shadowColor: alpha(colors.shellTextPrimary, 0.08),
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    insightBadge: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      backgroundColor: colors.shellCardSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    insightHero: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 12,
    },
    insightHeroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    insightHeroBadge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardSoft,
      flexShrink: 0,
    },
    insightHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    insightHeroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      borderRadius: 999,
      backgroundColor: colors.shellCardSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexShrink: 0,
      marginTop: 4,
    },
    insightHeroPillText: {
      color: colors.shellTextPrimary,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    insightTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 30 : 32,
      fontWeight: '800',
      letterSpacing: -1,
    },
    insightText: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    insightSignalGrid: {
      flexDirection: compact ? 'column' : 'row',
      gap: 12,
    },
    insightSignalCard: {
      flex: 1,
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      padding: 14,
      gap: 5,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      minHeight: 108,
    },
    insightSignalIcon: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    insightSignalLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    insightSignalValue: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    insightSignalMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
    },
    insightCompareStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    insightCompareIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardSoft,
      flexShrink: 0,
    },
    insightCompareCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    insightCompareTitle: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    insightCompareMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    insightCompareChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    insightCompareChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    insightCompareChipText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    insightCategorySection: {
      gap: 12,
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    insightSectionHeader: {
      gap: 2,
    },
    insightSectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    insightSectionMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    insightStackBar: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.shellCardSoft,
      overflow: 'hidden',
      gap: 2,
    },
    insightStackSegment: {
      height: '100%',
      borderRadius: 999,
    },
    insightCategoryList: {
      gap: 8,
    },
    insightCategoryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    insightCategoryIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    insightCategoryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    insightCategoryTitle: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
    },
    insightCategoryMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 14,
      fontWeight: '500',
    },
    insightCategoryRight: {
      width: 108,
      alignItems: 'flex-end',
      gap: 4,
    },
    insightCategoryPercent: {
      color: colors.onPrimary,
      fontSize: 12,
      lineHeight: 13,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    insightCategoryBarTrack: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.shellCardSoft,
      overflow: 'hidden',
    },
    insightCategoryBarFill: {
      height: '100%',
      borderRadius: 999,
    },
    insightList: {
      gap: 12,
    },
    insightItem: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: alpha(colors.onPrimary, 0.12),
    },
    insightItemRail: {
      width: 3,
      alignSelf: 'stretch',
      borderRadius: 999,
      marginTop: 3,
      opacity: 0.75,
    },
    insightItemCopy: {
      flex: 1,
      gap: 4,
    },
    insightItemHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    insightItemTag: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      backgroundColor: colors.shellCardSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    insightItemIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardSoft,
      marginTop: 2,
      flexShrink: 0,
    },
    insightItemTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    insightItemText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
    },
    insightEmptyText: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    primaryAction: {
      alignSelf: 'flex-start',
      minHeight: 56,
      borderRadius: 20,
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
      gap: 12,
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
      fontSize: 12,
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
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    filterDatePickerCard: {
      borderRadius: 20,
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
      gap: 12,
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
      borderRadius: 20,
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
      gap: 12,
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
    fabContainer: {
      position: 'absolute',
      bottom: Math.max(bottomInset + 90, 100),
      right: 18,
      zIndex: 100,
      alignItems: 'flex-end',
      gap: 12,
    },
    fabOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.3)',
      zIndex: 99,
    },
    fabMenu: {
      gap: 10,
    },
    fabMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.shellCard,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    fabMenuIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabMenuLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    fab: {
      width: 60,
      height: 60,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.32,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    fabPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.95 }],
    },
    merchantItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: alpha(colors.surfaceContainerHighest, 0.2),
    },
    merchantLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    merchantRank: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.1),
    },
    merchantRankText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    merchantName: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    merchantMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '500',
    },
    merchantRight: {
      alignItems: 'flex-end',
    },
    merchantAmount: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    billsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: alpha(colors.surfaceContainerHighest, 0.2),
    },
    billsIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.danger, 0.1),
    },
    billsCopy: {
      flex: 1,
      gap: 2,
    },
    billsTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    billsMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    billsRight: {
      alignItems: 'flex-end',
    },
    billsAmount: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '800',
    },
    walletItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: alpha(colors.surfaceContainerHighest, 0.2),
    },
    walletLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    walletIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.1),
    },
    walletName: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    walletBalance: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    tooltipContainer: {
      position: 'absolute',
      top: -36,
      left: '50%',
      transform: [{ translateX: -40 }],
      backgroundColor: colors.shellTextPrimary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: 'center',
    },
    tooltipText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '700',
    },
    tooltipArrow: {
      position: 'absolute',
      bottom: -5,
      left: '50%',
      transform: [{ translateX: -3 }],
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderTopWidth: 6,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: colors.shellTextPrimary,
    },
  });
};

