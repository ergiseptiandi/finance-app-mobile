import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { ApiRequestError, refreshToken } from '@/lib/api/auth';
import { getAuthSession, saveAuthSession } from '@/lib/auth-session';
import {
  DashboardComparisonData,
  DashboardSummaryData,
  DailySpendingItem,
  ExpenseVsSalaryData,
  MonthlySpendingItem,
  getComparison,
  getDailySpending,
  getDashboardSummary,
  getExpenseVsSalary,
  getMonthlySpending,
} from '@/lib/api/dashboard';

type TrendMode = 'daily' | 'monthly';

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

const formatCompactCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const formatDetailCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const formatSignedCurrency = (value: number, locale: string) => {
  const formatted = formatDetailCurrency(Math.abs(value), locale);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));

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

export default function DashboardScreen() {
  const colorScheme = useColorScheme() ?? 'light';
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
  const [expenseVsSalary, setExpenseVsSalary] = useState<ExpenseVsSalaryData | null>(null);
  const [displayName, setDisplayName] = useState('Kinetic Pulse');

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const session = await getAuthSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      setDisplayName(session.user.name || 'Kinetic Pulse');

      const fetchBundle = async (accessToken: string) =>
        Promise.allSettled([
          getDashboardSummary(accessToken),
          getDailySpending(accessToken),
          getMonthlySpending(accessToken),
          getComparison(accessToken),
          getExpenseVsSalary(accessToken),
        ]);

      let results = await fetchBundle(session.token.access_token);

      const hasUnauthorized = results.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof ApiRequestError &&
          result.reason.status === 401
      );

      if (hasUnauthorized && session.token.refresh_token) {
        const refreshed = await refreshToken({
          refresh_token: session.token.refresh_token,
        });
        await saveAuthSession(refreshed.Data);
        results = await fetchBundle(refreshed.Data.token.access_token);
      }

      const [summaryResult, dailyResult, monthlyResult, comparisonResult, ratioResult] = results;

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.Data);
      }

      if (dailyResult.status === 'fulfilled') {
        setDailySpending(dailyResult.value.Data);
      }

      if (monthlyResult.status === 'fulfilled') {
        setMonthlySpending(monthlyResult.value.Data);
      }

      if (comparisonResult.status === 'fulfilled') {
        setComparison(comparisonResult.value.Data);
      }

      if (ratioResult.status === 'fulfilled') {
        setExpenseVsSalary(ratioResult.value.Data);
      }

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
  }, [t]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const currentBalance = toNumber(summary?.total_balance);
  const monthlyIncome = toNumber(summary?.monthly_income);
  const monthlyExpense = toNumber(summary?.monthly_expense);
  const liquidCashFlow = monthlyIncome - monthlyExpense;
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

  const salaryAmount = toNumber(expenseVsSalary?.salary_amount ?? expenseVsSalary?.salary);
  const expenseAmount = toNumber(expenseVsSalary?.expense_amount ?? expenseVsSalary?.expense);
  const debtRatioRaw =
    toNumber(expenseVsSalary?.percentage) ||
    (salaryAmount > 0 ? (expenseAmount / salaryAmount) * 100 : 0);
  const debtRatio = Math.max(0, Math.min(100, Math.round(debtRatioRaw)));
  const leverageRatio = Math.max(0.08, Math.min(0.99, debtRatio / 100));

  const monthlyMomentum =
    lastMonthExpense > 0
      ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100
      : thisMonthExpense > 0
        ? 100
        : 0;
  const momentumPrefix = monthlyMomentum > 0 ? '+' : '';
  const momentumIcon = monthlyMomentum >= 0 ? 'trending-up' : 'trending-down';
  const activeMonthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date());

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

    return [
      { label: 'JAN', value: 40 },
      { label: 'FEB', value: 58 },
      { label: 'MAR', value: 49 },
      { label: 'APR', value: 72 },
      { label: 'MAY', value: 44 },
      { label: 'JUN', value: 92, active: true },
      { label: 'JUL', value: 61 },
    ];
  }, [dailySpending, locale, monthlySpending, trendMode]);

  const trendPeak = Math.max(...trendPoints.map((item) => item.value), 1);
  const liquidProgress = Math.max(12, Math.min(100, debtRatio > 0 ? 100 - debtRatio : 72));
  const projectedWorth = Math.max(0, currentBalance + Math.max(liquidCashFlow, 0) * 6);

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
        title: t('dashboard.activity.monthExpense', { month: activeMonthLabel }),
        meta: t('dashboard.activity.monthExpenseMeta'),
        amount: formatExpenseCurrency(thisMonthExpense || monthlyExpense, locale),
        kind: t('dashboard.activity.expense'),
      },
    ],
    [activeMonthLabel, locale, monthlyExpense, t, thisMonthExpense, todayExpense, yesterdayExpense]
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
            onRefresh={() => loadDashboard(true)}
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
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{t('dashboard.loading')}</Text>
          </View>
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
                    {monthlyMomentum.toFixed(1)}% {t('dashboard.thisMonth')}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.momentumHint}>
                  {t('dashboard.vsLastQuarterPeak')}
                </Text>
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
                    {formatSignedCurrency(liquidCashFlow, locale)}
                  </Text>
                </View>
                <View style={styles.cardIconShell}>
                  <MaterialCommunityIcons name="wallet-plus-outline" size={18} color={colors.secondaryAccent} />
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFillPrimary, { width: `${liquidProgress}%` }]} />
              </View>

              <View style={styles.liquidMetaRow}>
                <Text numberOfLines={1} style={styles.cardMeta}>
                  {t('dashboard.opEx')}: {formatCompactCurrency(monthlyExpense, locale)}
                </Text>
                <Text numberOfLines={1} style={styles.cardMeta}>
                  {t('dashboard.burn')}: {debtRatio}%
                </Text>
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
                {trendPoints.map((point) => (
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
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.debtIconWrap}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color={colors.danger} />
              </View>
              <Text style={styles.cardTitle}>{t('dashboard.debtHealth')}</Text>
              <Text style={styles.cardDescription}>
                {t('dashboard.debtHealthBody', { percent: Math.max(8, debtRatio) })}
              </Text>

              <View style={styles.metricCard}>
                <Text style={styles.cardEyebrow}>{t('dashboard.leverageRatio')}</Text>
                <Text style={styles.metricValue}>{leverageRatio.toFixed(2)}</Text>
              </View>

              <Pressable style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>{t('dashboard.consolidate')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{t('dashboard.kineticActivity')}</Text>
                <Pressable hitSlop={10}>
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
              <Text style={styles.insightTitle}>{t('dashboard.wealthAccelerating')}</Text>
              <Text style={styles.insightText}>
                {t('dashboard.insightBody', {
                  amount: formatCompactCurrency(projectedWorth, locale),
                })}
              </Text>
              <Pressable style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>{t('dashboard.optimizeStrategy')}</Text>
              </Pressable>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>

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
      backgroundColor: alpha(colors.secondary, isDark ? 0.22 : 0.14),
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardMeta: {
      flex: 1,
      color: colors.shellTextSoft,
      fontSize: 10,
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
