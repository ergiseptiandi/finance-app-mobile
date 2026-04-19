import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReportsSkeleton } from '@/components/ui/skeleton';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { ApiRequestError } from '@/lib/api/auth';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
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
  type SpendingTrendItem,
} from '@/lib/api/reports';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';

type TrendMode = 'trend' | 'categories';
type MetricTone = 'primary' | 'secondary' | 'warning' | 'danger';

type ReportsCacheState = {
  expenseByCategory: ExpenseByCategoryItem[];
  spendingTrends: SpendingTrendItem[];
  highestCategory: HighestSpendingCategoryData | null;
  averageDaily: AverageDailySpendingData | null;
  remainingBalance: RemainingBalanceData | null;
};

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
    maximumFractionDigits: 1,
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

const getTrendLabel = (item: SpendingTrendItem, index: number, locale: string) =>
  toShortMonth(String(item.date ?? item.month ?? item.label ?? ''), `M${index + 1}`, locale);

const getTrendValue = (item: SpendingTrendItem) => toNumber(item.amount);

const getCategoryShare = (item: ExpenseByCategoryItem, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (toNumber(item.amount) / total) * 100)) : 0;

export default function ReportsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const styles = createStyles(colors, compact, insets.top);

  const [trendMode, setTrendMode] = useState<TrendMode>('categories');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategoryItem[]>([]);
  const [spendingTrends, setSpendingTrends] = useState<SpendingTrendItem[]>([]);
  const [highestCategory, setHighestCategory] = useState<HighestSpendingCategoryData | null>(null);
  const [averageDaily, setAverageDaily] = useState<AverageDailySpendingData | null>(null);
  const [remainingBalance, setRemainingBalance] = useState<RemainingBalanceData | null>(null);
  const hasReportsSnapshot = Boolean(
    expenseByCategory.length || spendingTrends.length || highestCategory || averageDaily || remainingBalance
  );

  useEffect(() => {
    let active = true;

    const hydrateReportsCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const cached = await readScreenCache<ReportsCacheState>(
        buildScreenCacheKey('reports', session.user.id)
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

  const loadReports = useCallback(
    async (isRefresh = false) => {
      const shouldShowSkeleton = !isRefresh && !hasReportsSnapshot;

      if (isRefresh) {
        setRefreshing(true);
      } else if (shouldShowSkeleton) {
        setLoading(true);
      }

      setError('');

      try {
        const results = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([
            getExpenseByCategory(accessToken),
            getSpendingTrends(accessToken),
            getHighestSpendingCategory(accessToken),
            getAverageDailySpending(accessToken),
            getRemainingBalance(accessToken),
          ])
        );

        const [categoryResult, trendResult, highestResult, averageResult, balanceResult] = results;
        const nextExpenseByCategory =
          categoryResult.status === 'fulfilled' ? categoryResult.value.Data ?? [] : expenseByCategory;
        const nextSpendingTrends =
          trendResult.status === 'fulfilled' ? trendResult.value.Data ?? [] : spendingTrends;
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
          await writeScreenCache(buildScreenCacheKey('reports', session.user.id), {
            expenseByCategory: nextExpenseByCategory,
            spendingTrends: nextSpendingTrends,
            highestCategory: nextHighestCategory,
            averageDaily: nextAverageDaily,
            remainingBalance: nextRemainingBalance,
          });
        }

        if (results.some((result) => result.status === 'rejected')) {
          setError(t('reports.partialError'));
        }
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setError(t('reports.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      averageDaily,
      expenseByCategory,
      hasReportsSnapshot,
      highestCategory,
      remainingBalance,
      spendingTrends,
      t,
      withAuthorizedRequest,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const totalIncome = toNumber(remainingBalance?.total_income);
  const totalExpense = toNumber(remainingBalance?.total_expense);
  const remaining = toNumber(remainingBalance?.remaining_balance);
  const averageValue = toNumber(averageDaily?.average_daily_spending);
  const elapsedDays = toNumber(averageDaily?.elapsed_days);

  const categoryTotal = useMemo(
    () => expenseByCategory.reduce((sum, item) => sum + toNumber(item.amount), 0),
    [expenseByCategory]
  );
  const sortedCategories = useMemo(
    () => [...expenseByCategory].sort((left, right) => toNumber(right.amount) - toNumber(left.amount)),
    [expenseByCategory]
  );
  const topCategory = highestCategory ?? sortedCategories[0] ?? null;
  const currentMonthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date());
  const trendPoints = useMemo(
    () => spendingTrends.slice(-12).map((item, index) => ({ ...item, label: getTrendLabel(item, index, locale) })),
    [locale, spendingTrends]
  );
  const trendMax = Math.max(...trendPoints.map(getTrendValue), 1);
  const expenseRatio = totalIncome > 0 ? Math.max(0, Math.min(100, (totalExpense / totalIncome) * 100)) : 0;
  const remainingRatio = totalIncome > 0 ? Math.max(0, Math.min(100, (remaining / totalIncome) * 100)) : 0;
  const isEmpty =
    !loading && !expenseByCategory.length && !spendingTrends.length && !remainingBalance && !averageDaily && !highestCategory;

  const metricCards = [
    {
      icon: 'cash-multiple',
      label: t('reports.totalIncome'),
      value: formatCompactCurrency(totalIncome, locale),
      meta: `${t('reports.currentMonth')} - ${Math.round(remainingRatio)}%`,
      tone: 'primary' as MetricTone,
    },
    {
      icon: 'credit-card-outline',
      label: t('reports.totalExpense'),
      value: formatCompactCurrency(totalExpense, locale),
      meta: `${t('reports.currentMonth')} - ${Math.round(expenseRatio)}%`,
      tone: 'danger' as MetricTone,
    },
    {
      icon: 'wallet-outline',
      label: t('reports.remainingBalance'),
      value: formatCompactCurrency(remaining, locale),
      meta: t('reports.currentMonth'),
      tone: 'secondary' as MetricTone,
    },
    {
      icon: 'calendar-clock',
      label: t('reports.avgDailySpending'),
      value: formatCurrency(averageValue, locale),
      meta: elapsedDays > 0 ? t('reports.elapsedDays', { count: elapsedDays }) : t('reports.currentMonth'),
      tone: 'warning' as MetricTone,
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
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroBadge}>
                  <MaterialCommunityIcons name="chart-pie" size={14} color={colors.secondaryAccent} />
                  <Text style={styles.heroBadgeText}>{currentMonthLabel}</Text>
                </View>
                <Text style={styles.heroNumberLabel}>{t('reports.remainingBalance')}</Text>
              </View>

              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={styles.heroValue}>
                {formatCompactCurrency(remaining, locale)}
              </Text>

              <View style={styles.heroMetaRow}>
                <View style={styles.heroMetaChip}>
                  <MaterialCommunityIcons name="trending-up" size={12} color={colors.secondaryAccent} />
                  <Text style={styles.heroMetaText}>
                    {formatCompactCurrency(totalIncome, locale)} {t('reports.totalIncome')}
                  </Text>
                </View>
                <View style={styles.heroMetaChip}>
                  <MaterialCommunityIcons name="trending-down" size={12} color={colors.danger} />
                  <Text style={styles.heroMetaText}>
                    {formatCompactCurrency(totalExpense, locale)} {t('reports.totalExpense')}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroBody}>
                {topCategory
                  ? t('reports.heroBodyPlain', {
                      category: topCategory.category,
                      amount: formatCompactCurrency(toNumber(topCategory.amount), locale),
                    })
                  : t('reports.heroBodyFallbackPlain')}
              </Text>
            </View>

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

            <View style={styles.card}>
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
                  sortedCategories.map((item) => {
                    const share = getCategoryShare(item, categoryTotal);
                    return (
                      <View key={item.category} style={styles.categoryItem}>
                        <View style={styles.categoryTopRow}>
                          <Text numberOfLines={1} style={styles.categoryName}>
                            {item.category}
                          </Text>
                          <Text style={styles.categoryAmount}>{formatCompactCurrency(toNumber(item.amount), locale)}</Text>
                        </View>
                        <View style={styles.categoryTrack}>
                          <View style={[styles.categoryFill, { width: `${Math.max(8, share)}%` }]} />
                        </View>
                        <Text style={styles.categoryMeta}>{share.toFixed(1)}%</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyInline}>{t('reports.noCategoryData')}</Text>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <Text style={styles.cardEyebrow}>{t('reports.spendingTrends')}</Text>
                  <Text style={styles.cardTitle}>{t('reports.monthlyTrend')}</Text>
                </View>
                <View style={styles.segmentedControl}>
                  <Pressable
                    onPress={() => setTrendMode('categories')}
                    style={[styles.segmentButton, trendMode === 'categories' && styles.segmentButtonActive]}>
                    <Text style={[styles.segmentLabel, trendMode === 'categories' && styles.segmentLabelActive]}>
                      {t('reports.categories')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTrendMode('trend')}
                    style={[styles.segmentButton, trendMode === 'trend' && styles.segmentButtonActive]}>
                    <Text style={[styles.segmentLabel, trendMode === 'trend' && styles.segmentLabelActive]}>
                      {t('reports.trend')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {trendMode === 'categories' ? (
                <View style={styles.trendChart}>
                  {trendPoints.length ? (
                    trendPoints.map((item, index, items) => {
                      const value = getTrendValue(item);
                      const active = index === items.length - 1;
                      return (
                        <View key={`${item.date ?? item.month ?? item.label ?? index}`} style={styles.trendItem}>
                          <View
                            style={[
                              styles.trendBar,
                              { height: `${Math.max(24, (value / trendMax) * 100)}%` },
                              active && styles.trendBarActive,
                            ]}
                          />
                          <Text numberOfLines={1} style={styles.trendLabel}>
                            {item.label}
                          </Text>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.emptyInline}>{t('reports.noTrendData')}</Text>
                  )}
                </View>
              ) : (
                <View style={styles.trendTable}>
                  {trendPoints.length ? (
                    trendPoints.slice(-6).map((item, index) => {
                      const value = getTrendValue(item);
                      const share = totalExpense > 0 ? Math.max(0, Math.min(100, (value / totalExpense) * 100)) : 0;
                      return (
                        <View key={`${item.label}-${index}`} style={styles.trendRow}>
                          <View style={styles.trendRowCopy}>
                            <Text style={styles.trendRowLabel}>{item.label}</Text>
                            <Text style={styles.trendRowMeta}>
                              {toLongMonth(String(item.date ?? item.month ?? ''), item.label, locale)}
                            </Text>
                          </View>
                          <Text style={styles.trendRowValue}>{formatCompactCurrency(value, locale)}</Text>
                          <View style={styles.trendRowTrack}>
                            <View style={[styles.trendRowFill, { width: `${Math.max(8, share)}%` }]} />
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.emptyInline}>{t('reports.noTrendData')}</Text>
                  )}
                </View>
              )}
            </View>

            <View style={styles.insightCard}>
              <Text style={styles.insightBadge}>{t('reports.insightBadge')}</Text>
              <Text style={styles.insightTitle}>
                {highestCategory ? highestCategory.category : t('reports.noSummaryTitle')}
              </Text>
              <Text style={styles.insightText}>
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
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </View>
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

const createStyles = (colors: AppColorTheme, compact: boolean, topInset: number) =>
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
      backgroundColor: colors.primary,
      padding: compact ? 20 : 22,
      gap: 16,
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
      backgroundColor: alpha(colors.onPrimary, 0.14),
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    heroBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.3,
    },
    heroNumberLabel: {
      color: alpha(colors.onPrimary, 0.82),
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2,
    },
    heroValue: {
      color: colors.onPrimary,
      fontSize: compact ? 40 : 48,
      lineHeight: compact ? 44 : 52,
      fontWeight: '900',
      letterSpacing: -1.8,
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
      backgroundColor: alpha(colors.onPrimary, 0.12),
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    heroMetaText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroBody: {
      color: alpha(colors.onPrimary, 0.9),
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
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
      gap: 4,
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
      gap: 8,
    },
    categoryTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
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
      color: colors.onPrimary,
    },
    trendChart: {
      height: compact ? 190 : 220,
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
      gap: 10,
    },
    trendBar: {
      width: '100%',
      minHeight: 26,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      backgroundColor: colors.shellCardMuted,
    },
    trendBarActive: {
      backgroundColor: colors.primary,
      shadowColor: alpha(colors.primary, 0.3),
      shadowOpacity: 1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    trendLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    trendTable: {
      gap: 12,
    },
    trendRow: {
      gap: 8,
    },
    trendRowCopy: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    trendRowLabel: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    trendRowMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    trendRowValue: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '900',
    },
    trendRowTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    trendRowFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    insightCard: {
      borderRadius: 24,
      backgroundColor: colors.primary,
      padding: compact ? 22 : 24,
      gap: 14,
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
      fontSize: 15,
      lineHeight: 24,
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
      backgroundColor: alpha(colors.onPrimary, 0.12),
      padding: 14,
      gap: 6,
    },
    label: {
      color: alpha(colors.onPrimary, 0.82),
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    value: {
      color: colors.onPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
  });
