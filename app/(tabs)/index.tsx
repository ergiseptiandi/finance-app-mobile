import { DashboardSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import {
  getComparison,
  getDailySpending,
  getDashboardInsights,
  getDashboardSummary,
  getMonthlySpending,
  type DailySpendingItem,
  type DashboardComparisonData,
  type DashboardInsightData,
  type DashboardSummaryData,
  type MonthlySpendingItem,
} from '@/lib/api/dashboard';
import { getNotificationSettings } from '@/lib/api/notifications';
import { listTransactions, type TransactionRecord } from '@/lib/api/transactions';
import { listWallets, type WalletRecord } from '@/lib/api/wallets';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { loadUnreadNotificationCount } from '@/lib/notification-unread-count';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildDashboardQueryParams,
  clampPercent,
  computeSalaryCycleDates,
  createDashboardCacheSuffix,
  createDefaultDashboardFilters,
  DATE_INPUT_PATTERN,
  extractComparisonValue,
  extractComparisonWindowValue,
  formatCompactCurrency,
  formatSignedCurrency,
  getDashboardFilterLabel,
  getFilterRangeMonths,
  getMonthPickerStateFromInput,
  parseDateValue,
  toDashboardFilterPickerValue,
  toDayLabel,
  toLocalDateString,
  toNumber,
  toShortMonth,
  type DashboardFilters,
  type MonthPickerState,
  type TrendMode,
  type TrendPoint,
} from '@/components/dashboard/dashboard-utils';
import { createStyles } from './dashboard/styles';
import {
  DashboardHero,
  DashboardFilterCard,
  DashboardLiquidCard,
  DashboardSummary,
  DashboardBudget,
  DashboardTrends,
  DashboardDebt,
  DashboardTransactions,
  DashboardShowMore,
  DashboardExpandedSections,
} from './dashboard/dashboard-sections';
import { DashboardFab } from './dashboard/dashboard-fab';
import { FilterModal, MonthPickerModal, DebtPayModal } from './dashboard/dashboard-modals';

type DashboardCacheState = {
  summary: DashboardSummaryData | null;
  dailySpending: DailySpendingItem[];
  monthlySpending: MonthlySpendingItem[];
  comparison: DashboardComparisonData | null;
  insights: DashboardInsightData[];
  displayName: string;
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
  const [filters, setFilters] = useState<DashboardFilters>(() => createDefaultDashboardFilters(25));
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(() => createDefaultDashboardFilters(25));
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [monthPickerState, setMonthPickerState] = useState<MonthPickerState>(() =>
    getMonthPickerStateFromInput(createDefaultDashboardFilters().month)
  );
  const [iosFilterDatePickerVisible, setIosFilterDatePickerVisible] = useState(false);
  const [filterDateTarget, setFilterDateTarget] = useState<'startDate' | 'endDate' | null>(null);
  const filterDateTargetRef = useRef<'startDate' | 'endDate' | null>(null);
  const [salaryDay, setSalaryDay] = useState<number>(25);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [, setLastUpdated] = useState<Date | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [showAllSections, setShowAllSections] = useState(false);
  const [debtPayModalVisible, setDebtPayModalVisible] = useState(false);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtPaying, setDebtPaying] = useState(false);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.greeting.morning');
    if (hour < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
  };

  const filtersRef = useRef<DashboardFilters>(createDefaultDashboardFilters(25));
  const hasDashboardSnapshot = Boolean(summary || comparison || dailySpending.length || monthlySpending.length);
  const sectionAnimations = useMemo(() => Array.from({ length: 14 }, () => new Animated.Value(0)), []);
  const sectionRevealStyles = useMemo(
    () => sectionAnimations.map((value) => ({
      opacity: value,
      transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    })),
    [sectionAnimations]
  );

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    sectionAnimations.forEach((value) => value.setValue(0));
    if (loading) return;
    Animated.stagger(70, sectionAnimations.map((value) =>
      Animated.timing(value, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    )).start();
  }, [filters.dateMode, filters.endDate, filters.month, filters.startDate, loading, sectionAnimations]);

  useEffect(() => {
    let active = true;
    const hydrateDashboardCache = async () => {
      const session = await getAuthSession();
      if (!session || !active) return;
      const nextDisplayName = session.user.name || 'Kinetic Pulse';
      setDisplayName(nextDisplayName);
      const cached = await readScreenCache<DashboardCacheState>(
        buildScreenCacheKey('dashboard', session.user.id, createDashboardCacheSuffix(filtersRef.current))
      );
      if (!cached || !active) return;
      setSummary(cached.data.summary);
      setDailySpending(cached.data.dailySpending);
      setMonthlySpending(cached.data.monthlySpending);
      setComparison(cached.data.comparison);
      setInsights(cached.data.insights ?? []);
      setDisplayName(cached.data.displayName || nextDisplayName);
      setLoading(false);
    };
    hydrateDashboardCache();
    return () => { active = false; };
  }, []);

  const loadDashboard = useCallback(async (isRefresh = false, appliedFilters: DashboardFilters = filtersRef.current, forceLoading = false) => {
    const shouldShowSkeleton = forceLoading || (!isRefresh && !hasDashboardSnapshot);
    if (isRefresh) setRefreshing(true);
    else if (shouldShowSkeleton) setLoading(true);
    setError('');
    try {
      const session = await getAuthSession();
      if (!session) { router.replace('/login'); return; }
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
      const hasUnauthorized = results.some((r) => r.status === 'rejected' && r.reason instanceof ApiRequestError && r.reason.status === 401);
      if (hasUnauthorized && session.token.refresh_token) {
        const refreshed = await refreshStoredAuthSession();
        if (refreshed) results = await fetchBundle(refreshed.token.access_token);
      }
      const [summaryResult, dailyResult, monthlyResult, comparisonResult, insightsResult] = results;
      const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value.Data : summary;
      const nextDailySpending = dailyResult.status === 'fulfilled' ? dailyResult.value.Data : dailySpending;
      const nextMonthlySpending = monthlyResult.status === 'fulfilled' ? monthlyResult.value.Data : monthlySpending;
      const nextComparison = comparisonResult.status === 'fulfilled' ? comparisonResult.value.Data : comparison;
      const nextInsights = insightsResult.status === 'fulfilled' ? insightsResult.value.Data : insights;
      if (summaryResult.status === 'fulfilled') setSummary(nextSummary);
      if (dailyResult.status === 'fulfilled') setDailySpending(nextDailySpending);
      if (monthlyResult.status === 'fulfilled') setMonthlySpending(nextMonthlySpending);
      if (comparisonResult.status === 'fulfilled') setComparison(nextComparison);
      if (insightsResult.status === 'fulfilled') setInsights(nextInsights);
      await writeScreenCache(buildScreenCacheKey('dashboard', session.user.id, cacheSuffix), {
        summary: nextSummary, dailySpending: nextDailySpending, monthlySpending: nextMonthlySpending,
        comparison: nextComparison, insights: nextInsights, displayName: nextDisplayName,
      });
      setLastUpdated(new Date());
      listTransactions(session.token.access_token, { page: 1, per_page: 5 }).then((tx) => setRecentTransactions(tx.Data.data ?? [])).catch(() => {});
      listWallets(session.token.access_token).then((w) => setWallets(w.Data ?? [])).catch(() => {});
      const hasHardFailure = results.some((r) => r.status === 'rejected' && !(r.reason instanceof ApiRequestError && r.reason.status === 401));
      if (hasHardFailure) {
        if (isOffline && hasDashboardSnapshot) return;
        setError(isOffline ? t('common.offlineLoadError') : t('dashboard.partialError'));
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) { router.replace('/login'); return; }
      if (isOffline && hasDashboardSnapshot) { setError(''); return; }
      setError(isOffline ? t('common.offlineLoadError') : t('dashboard.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [comparison, dailySpending, hasDashboardSnapshot, insights, isOffline, monthlySpending, summary, t]);

  const loadUnreadNotifications = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session) { setUnreadNotificationCount(0); return; }
      try {
        setUnreadNotificationCount(await loadUnreadNotificationCount(session.token.access_token));
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) setUnreadNotificationCount(await loadUnreadNotificationCount(refreshed.token.access_token));
        }
      }
    } catch { setUnreadNotificationCount(0); }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadDashboard(false, filtersRef.current);
    void loadUnreadNotifications();
  }, [loadDashboard, loadUnreadNotifications]));

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
          const nextFilters: DashboardFilters = { dateMode: 'cycle', month: '', startDate: cycleDates.startDate, endDate: cycleDates.endDate };
          setFilters(nextFilters);
          setDraftFilters(nextFilters);
          filtersRef.current = nextFilters;
          void loadDashboard(false, nextFilters);
        }
      } catch {}
    };
    fetchSalaryDay();
    return () => { active = false; };
  }, [loadDashboard]);

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

  const closeMonthPicker = useCallback(() => { setMonthPickerVisible(false); }, []);

  const applyMonthPicker = useCallback(() => {
    const nextMonth = `${String(monthPickerState.year).padStart(4, '0')}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}`;
    setDraftFilters((cur) => ({ ...cur, month: nextMonth }));
    setMonthPickerVisible(false);
  }, [monthPickerState.monthIndex, monthPickerState.year]);

  const handleFilterDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') return;
    const target = filterDateTargetRef.current;
    if (!selectedDate || !target) return;
    setDraftFilters((cur) => ({ ...cur, [target]: toLocalDateString(selectedDate) }));
  }, []);

  const openFilterDatePicker = useCallback((target: 'startDate' | 'endDate') => {
    const currentDate = toDashboardFilterPickerValue(draftFilters, target);
    setFilterDateTarget(target);
    filterDateTargetRef.current = target;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: currentDate, mode: 'date', onChange: handleFilterDateChange });
      return;
    }
    setIosFilterDatePickerVisible(true);
  }, [draftFilters, handleFilterDateChange]);

  const resetFilters = useCallback(() => {
    const nextFilters = createDefaultDashboardFilters(salaryDay);
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setFilterDateTarget(null);
    setMonthPickerVisible(false);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(false);
    void loadDashboard(false, nextFilters, true);
  }, [loadDashboard, salaryDay]);

  const applyFilters = useCallback(() => {
    if (draftFilters.dateMode === 'month') {
      const selectedMonth = `${monthPickerState.year}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}`;
      if (!/^\d{4}-\d{2}$/.test(selectedMonth)) { setFilterError(t('dashboard.filter.monthInvalid')); return; }
    } else if (draftFilters.dateMode === 'range') {
      if (!DATE_INPUT_PATTERN.test(draftFilters.startDate) || !DATE_INPUT_PATTERN.test(draftFilters.endDate)) {
        setFilterError(t('dashboard.filter.rangeRequired')); return;
      }
      const start = parseDateValue(draftFilters.startDate);
      const end = parseDateValue(draftFilters.endDate);
      if (!start || !end || start.getTime() > end.getTime()) { setFilterError(t('dashboard.filter.rangeInvalid')); return; }
      if (getFilterRangeMonths(draftFilters.startDate, draftFilters.endDate) > 2) { setFilterError(t('dashboard.filter.rangeTooLong')); return; }
    }
    let nextFilters: DashboardFilters;
    if (draftFilters.dateMode === 'cycle') {
      const cycleDates = computeSalaryCycleDates(salaryDay);
      nextFilters = { ...draftFilters, month: '', startDate: cycleDates.startDate, endDate: cycleDates.endDate };
    } else {
      nextFilters = {
        ...draftFilters,
        month: draftFilters.dateMode === 'month' ? `${monthPickerState.year}-${String(monthPickerState.monthIndex + 1).padStart(2, '0')}` : '',
        startDate: draftFilters.dateMode === 'range' ? draftFilters.startDate : '',
        endDate: draftFilters.dateMode === 'range' ? draftFilters.endDate : '',
      };
    }
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setFilterError('');
    setFilterDateTarget(null);
    setIosFilterDatePickerVisible(false);
    setFilterModalVisible(false);
    void loadDashboard(false, nextFilters, true);
  }, [draftFilters, loadDashboard, salaryDay, t, monthPickerState.monthIndex, monthPickerState.year]);

  // Derived values
  const totalBalance = toNumber(summary?.total_balance);
  const monthlyIncome = toNumber(summary?.monthly_income);
  const monthlyExpense = toNumber(summary?.monthly_expense);
  const consumptionExpense = toNumber(summary?.consumption_expense ?? monthlyExpense);
  const netCashflow = toNumber(summary?.net_cashflow ?? monthlyIncome - consumptionExpense);
  const savingsRate = toNumber(summary?.savings_rate ?? (monthlyIncome > 0 ? (netCashflow / monthlyIncome) * 100 : 0));
  const expenseRatio = toNumber(summary?.expense_ratio ?? (monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0));
  const dashboardDebt = summary?.debt ?? null;
  const remainingDebt = toNumber(dashboardDebt?.remaining_debt);
  const totalDebt = toNumber(dashboardDebt?.total_debt);
  const debtToIncome = toNumber(dashboardDebt?.debt_to_income_ratio ?? (monthlyIncome > 0 ? (remainingDebt / monthlyIncome) * 100 : 0));
  const debtToBalance = toNumber(dashboardDebt?.debt_to_balance_ratio ?? (totalBalance > 0 ? (remainingDebt / totalBalance) * 100 : 0));
  const debtCompletion = toNumber(dashboardDebt?.completion_rate);
  const debtHealthScore = clampPercent(100 - Math.max(0, debtToIncome));
  const debtHealthLabel = debtHealthScore >= 75 ? (language === 'id' ? 'Sehat' : 'Healthy') : debtHealthScore >= 45 ? (language === 'id' ? 'Waspada' : 'Watch') : (language === 'id' ? 'Perlu perhatian' : 'Needs attention');
  const thisMonthExpense = extractComparisonWindowValue(comparison, 'this_month_vs_last_month', 'current') || extractComparisonValue(comparison, ['this_month_expense', 'thisMonth', 'this_month']);
  const lastMonthExpense = extractComparisonWindowValue(comparison, 'this_month_vs_last_month', 'previous') || extractComparisonValue(comparison, ['last_month_expense', 'lastMonth', 'last_month']);
  const monthlyMomentum = toNumber(comparison?.this_month_vs_last_month?.percentage_change) || (lastMonthExpense > 0 ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100 : thisMonthExpense > 0 ? 100 : 0);
  const momentumPrefix = monthlyMomentum > 0 ? '+' : '';
  const momentumIcon = monthlyMomentum >= 0 ? 'trending-up' : 'trending-down';
  const activePeriodLabel = getDashboardFilterLabel(filters, locale) || t('dashboard.filter.currentPeriod');
  const filterModeLabel = filters.dateMode === 'month' ? t('dashboard.filter.monthMode') : filters.dateMode === 'cycle' ? t('dashboard.filter.cycleMode') : t('dashboard.filter.rangeMode');
  const budgetSummary = summary?.budget_summary ?? null;
  const budgetGoalsProgress = summary?.goals_progress ?? [];
  const budgetPreview = budgetGoalsProgress.slice(0, 2);
  const budgetUsage = toNumber(budgetSummary?.usage_rate);
  const budgetActiveGoals = budgetGoalsProgress.length;
  const budgetOverBudgetCount = budgetGoalsProgress.filter((g) => g?.status === 'over_budget').length;
  const budgetOnTrackCount = budgetGoalsProgress.filter((g) => g?.status === 'on_track').length;
  const budgetStatusLabel = budgetSummary ? (budgetSummary.is_over_budget ? t('dashboard.budgetOverBudget') : budgetUsage >= 80 ? t('dashboard.budgetOnTrack') : t('dashboard.budgetUnderBudget')) : t('dashboard.budgetEmptyState');
  const categoryBreakdownPreview = summary?.category_breakdown_preview ?? [];
  const categoryTopThree = categoryBreakdownPreview.slice(0, 3);
  const cashflowSignalLabel = savingsRate >= 0 ? (language === 'id' ? 'Arus kas positif' : 'Positive cashflow') : (language === 'id' ? 'Arus kas negatif' : 'Negative cashflow');
  const budgetSignalLabel = budgetSummary?.is_over_budget ? (language === 'id' ? 'Lewat batas' : 'Over budget') : budgetUsage >= 80 ? (language === 'id' ? 'Mendekati batas' : 'Near limit') : (language === 'id' ? 'Aman' : 'Healthy');
  const debtSignalLabel = debtHealthLabel;

  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (trendMode === 'daily' && dailySpending.length > 0) {
      return dailySpending.slice(-7).map((item, index, items) => ({
        label: toDayLabel(item.date, `D${index + 1}`, locale), value: toNumber(item.amount), active: index === items.length - 1,
      }));
    }
    if (monthlySpending.length > 0) {
      return monthlySpending.slice(-7).map((item, index, items) => ({
        label: toShortMonth(String(item.date ?? item.month ?? item.label ?? ''), `M${index + 1}`, locale),
        value: toNumber(item.amount), active: index === items.length - 2 || index === items.length - 1,
      }));
    }
    return [];
  }, [dailySpending, locale, monthlySpending, trendMode]);

  const trendPeak = Math.max(...trendPoints.map((item) => item.value), 1);
  const liquidProgress = clampPercent(savingsRate > 0 ? savingsRate : 12);

  const dashboardInsights = useMemo<DashboardInsightData[]>(() => {
    if (insights.length > 0) return insights;
    if (!summary) return [];
    return [{ type: 'summary', code: 'summary_fallback', title: t('dashboard.summaryInsightTitle'), message: t('dashboard.insightBody', { amount: formatDetailCurrency(totalBalance, locale) }), severity: 'info' }];
  }, [insights, locale, summary, t, totalBalance]);
  const priorityInsights = dashboardInsights.slice(0, 3);

  const summaryHighlights = useMemo(() => [
    { label: language === 'id' ? 'Saldo Total' : 'Total Balance', value: formatCompactCurrency(totalBalance, locale), meta: language === 'id' ? 'Seluruh saldo wallet' : 'All wallet balances' },
    { label: language === 'id' ? 'Pemasukan' : 'Income', value: formatCompactCurrency(monthlyIncome, locale), meta: language === 'id' ? 'Total pemasukan periode' : 'Period total income' },
    { label: language === 'id' ? 'Pengeluaran Konsumsi' : 'Consumption', value: formatCompactCurrency(consumptionExpense, locale), meta: language === 'id' ? 'Tanpa bayar utang' : 'Excluding debt payments' },
    { label: language === 'id' ? 'Arus Kas Bersih' : 'Net Cashflow', value: formatSignedCurrency(netCashflow, locale), meta: language === 'id' ? 'Pemasukan dikurangi konsumsi' : 'Income minus consumption' },
  ], [consumptionExpense, locale, monthlyIncome, netCashflow, totalBalance, language]);

  const handleDebtPay = useCallback(async () => {
    const amount = Number(debtPayAmount);
    if (!amount || amount <= 0) { toast.error(language === 'id' ? 'Masukkan jumlah yang valid' : 'Enter a valid amount'); return; }
    setDebtPaying(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    toast.success(language === 'id' ? 'Pembayaran utang berhasil' : 'Debt payment successful');
    setDebtPaying(false);
    setDebtPayModalVisible(false);
    setDebtPayAmount('');
    void loadDashboard(false, filtersRef.current, true);
  }, [debtPayAmount, language, loadDashboard]);

  return (
    <View style={styles.root}>
      <StatusBar animated style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadDashboard(true, filtersRef.current); void loadUnreadNotifications(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.topBar, sectionRevealStyles[0]]}>
          <View style={styles.brandBlock}>
            <View style={styles.brandAvatar}>
              <MaterialCommunityIcons name="account-circle" size={20} color={colors.primary} />
            </View>
            <View style={{ gap: 2 }}>
              <Text numberOfLines={1} style={styles.brandGreeting}>{getTimeGreeting()}</Text>
              <Text numberOfLines={1} style={styles.brandName}>{displayName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => router.push('/ai-analyst')} style={styles.iconButton} accessibilityLabel={language === 'id' ? 'AI Analis' : 'AI Analyst'} accessibilityRole="button">
              <MaterialCommunityIcons name="lightning-bolt-outline" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.push('/notifications')} style={styles.iconButton} accessibilityLabel={language === 'id' ? 'Notifikasi' : 'Notifications'} accessibilityRole="button">
              <MaterialCommunityIcons name="bell-outline" size={20} color={colors.shellTextPrimary} />
              {unreadNotificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </Animated.View>

        {loading ? (
          <DashboardSkeleton colors={colors} />
        ) : (
          <>
            <DashboardHero colors={colors} styles={styles} locale={locale} t={t} totalBalance={totalBalance} monthlyMomentum={monthlyMomentum} momentumIcon={momentumIcon as keyof typeof MaterialCommunityIcons.glyphMap} momentumPrefix={momentumPrefix} filters={filters} sectionRevealStyles={sectionRevealStyles} />
            <DashboardFilterCard colors={colors} styles={styles} locale={locale} t={t} filters={filters} activePeriodLabel={activePeriodLabel} filterModeLabel={filterModeLabel} openFilterModal={openFilterModal} sectionRevealStyles={sectionRevealStyles} />
            <DashboardLiquidCard colors={colors} styles={styles} locale={locale} t={t} netCashflow={netCashflow} monthlyExpense={monthlyExpense} expenseRatio={expenseRatio} liquidProgress={liquidProgress} sectionRevealStyles={sectionRevealStyles} isDark={isDark} />
            <DashboardSummary colors={colors} styles={styles} locale={locale} t={t} language={language} summaryHighlights={summaryHighlights} savingsRate={savingsRate} debtToIncome={debtToIncome} activePeriodLabel={activePeriodLabel} sectionRevealStyles={sectionRevealStyles} />
            <DashboardBudget colors={colors} styles={styles} locale={locale} t={t} language={language} summary={summary} budgetSummary={budgetSummary} budgetUsage={budgetUsage} budgetStatusLabel={budgetStatusLabel} budgetActiveGoals={budgetActiveGoals} budgetOnTrackCount={budgetOnTrackCount} budgetOverBudgetCount={budgetOverBudgetCount} budgetPreview={budgetPreview} sectionRevealStyles={sectionRevealStyles} />
            <DashboardTrends colors={colors} styles={styles} locale={locale} t={t} trendMode={trendMode} trendPoints={trendPoints} trendPeak={trendPeak} selectedBarIndex={selectedBarIndex} sectionRevealStyles={sectionRevealStyles} onSetTrendMode={setTrendMode} onSetSelectedBarIndex={setSelectedBarIndex} />
            <DashboardDebt colors={colors} styles={styles} locale={locale} t={t} language={language} summary={summary} dashboardDebt={dashboardDebt} remainingDebt={remainingDebt} totalDebt={totalDebt} debtToIncome={debtToIncome} debtToBalance={debtToBalance} debtCompletion={debtCompletion} debtHealthScore={debtHealthScore} debtHealthLabel={debtHealthLabel} sectionRevealStyles={sectionRevealStyles} onOpenDebtPay={() => setDebtPayModalVisible(true)} />
            <DashboardTransactions colors={colors} styles={styles} locale={locale} t={t} language={language} recentTransactions={recentTransactions} sectionRevealStyles={sectionRevealStyles} />
            <DashboardShowMore colors={colors} styles={styles} language={language} showAllSections={showAllSections} onToggle={() => setShowAllSections(!showAllSections)} />
            {showAllSections ? (
              <DashboardExpandedSections colors={colors} styles={styles} locale={locale} t={t} language={language} summary={summary} wallets={wallets} categoryTopThree={categoryTopThree} priorityInsights={priorityInsights} debtToIncome={debtToIncome} savingsRate={savingsRate} budgetUsage={budgetUsage} budgetSignalLabel={budgetSignalLabel} debtSignalLabel={debtSignalLabel} cashflowSignalLabel={cashflowSignalLabel} sectionRevealStyles={sectionRevealStyles} />
            ) : null}
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>

      <DashboardFab colors={colors} styles={styles} t={t} fabMenuOpen={fabMenuOpen} onToggleFab={setFabMenuOpen} />

      <FilterModal
        visible={filterModalVisible} colors={colors} styles={styles} locale={locale} t={t} language={language} isDark={isDark} salaryDay={salaryDay}
        draftFilters={draftFilters} filterError={filterError} monthPickerState={monthPickerState}
        iosFilterDatePickerVisible={iosFilterDatePickerVisible} filterDateTarget={filterDateTarget}
        onClose={closeFilterModal} onOpenMonthPicker={openMonthPicker} onApplyMonthPicker={applyMonthPicker}
        onResetFilters={resetFilters} onApplyFilters={applyFilters}
        onSetDraftFilters={setDraftFilters} onSetMonthPickerState={setMonthPickerState}
        onOpenFilterDatePicker={openFilterDatePicker} onHandleFilterDateChange={handleFilterDateChange}
        onSetIosFilterDatePickerVisible={setIosFilterDatePickerVisible}
      />

      <MonthPickerModal
        visible={monthPickerVisible} colors={colors} styles={styles} locale={locale} t={t} language={language} isDark={isDark}
        monthPickerState={monthPickerState} onClose={closeMonthPicker} onApply={applyMonthPicker} onSetMonthPickerState={setMonthPickerState}
      />

      <DebtPayModal
        visible={debtPayModalVisible} colors={colors} styles={styles} t={t} language={language}
        debtPayAmount={debtPayAmount} debtPaying={debtPaying}
        onClose={() => { setDebtPayModalVisible(false); setDebtPayAmount(''); }}
        onSetAmount={setDebtPayAmount} onPay={handleDebtPay} onSetPaying={setDebtPaying}
      />
    </View>
  );
}


