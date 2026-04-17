import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const formatDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const asNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));

const extractComparisonValue = (data: DashboardComparisonData | null, keys: string[]) => {
  if (!data) {
    return 0;
  }

  for (const key of keys) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return 0;
};

export default function DashboardScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [dailySpending, setDailySpending] = useState<DailySpendingItem[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpendingItem[]>([]);
  const [comparison, setComparison] = useState<DashboardComparisonData | null>(null);
  const [expenseVsSalary, setExpenseVsSalary] = useState<ExpenseVsSalaryData | null>(null);
  const [displayName, setDisplayName] = useState('Dashboard');
  const [hasSession, setHasSession] = useState(true);

  const loadDashboard = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const session = await getAuthSession();

      if (!session) {
        setHasSession(false);
        router.replace('/login');
        return;
      }

      setHasSession(true);
      setDisplayName(session.user.name || 'Dashboard');

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

      const [summaryResult, dailyResult, monthlyResult, comparisonResult, expenseVsSalaryResult] =
        results;

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

      if (expenseVsSalaryResult.status === 'fulfilled') {
        setExpenseVsSalary(expenseVsSalaryResult.value.Data);
      }

      const hasHardFailure = results.some(
        (result) =>
          result.status === 'rejected' &&
          !(result.reason instanceof ApiRequestError && result.reason.status === 401)
      );

      if (hasHardFailure) {
        setError('Sebagian data dashboard gagal dimuat. Coba tarik ulang.');
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setError('Sesi sudah habis. Silakan login lagi.');
        router.replace('/login');
      } else {
        setError('Gagal memuat dashboard. Coba lagi.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const spendingPeak = useMemo(
    () => Math.max(...dailySpending.map((entry) => entry.amount), 1),
    [dailySpending]
  );

  const monthlyPeak = useMemo(
    () => Math.max(...monthlySpending.map((entry) => entry.amount), 1),
    [monthlySpending]
  );

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

  const salaryAmount = expenseVsSalary?.salary_amount ?? 0;
  const expenseAmount = expenseVsSalary?.expense_amount ?? summary?.monthly_expense ?? 0;
  const expenseRatio =
    expenseVsSalary?.percentage ??
    (salaryAmount > 0 ? Math.min(100, Math.round((expenseAmount / salaryAmount) * 100)) : 0);

  const kpis = [
    {
      label: 'Total Balance',
      value: summary ? formatCurrency(summary.total_balance) : '-',
      icon: 'wallet-outline',
    },
    {
      label: 'Monthly Income',
      value: summary ? formatCurrency(summary.monthly_income) : '-',
      icon: 'arrow-down-bold-circle-outline',
    },
    {
      label: 'Monthly Expense',
      value: summary ? formatCurrency(summary.monthly_expense) : '-',
      icon: 'arrow-up-bold-circle-outline',
    },
  ];

  return (
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
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.kicker}>Finance overview</Text>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>
            {hasSession ? `Welcome back, ${displayName}.` : 'Loading your session.'}
          </Text>
        </View>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="finance" size={22} color={colors.inverseText} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Memuat summary dan analytics...</Text>
        </View>
      ) : (
        <>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.kpiGrid}>
            {kpis.map((item) => (
              <View key={item.label} style={styles.kpiCard}>
                <View style={styles.kpiIcon}>
                  <MaterialCommunityIcons
                    name={item.icon as never}
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.kpiLabel}>{item.label}</Text>
                <Text style={styles.kpiValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Daily Spending</Text>
              <Text style={styles.sectionHint}>Current month</Text>
            </View>

            <View style={styles.chartCard}>
              {dailySpending.length > 0 ? (
                dailySpending.slice(0, 10).map((item) => {
                  const width = Math.max(8, (item.amount / spendingPeak) * 100);
                  return (
                    <View key={item.date} style={styles.barRow}>
                      <Text style={styles.barLabel}>{formatDateLabel(item.date)}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${width}%` }]} />
                      </View>
                      <Text style={styles.barValue}>{formatCurrency(asNumber(item.amount))}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyState}>Belum ada data spending harian.</Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Monthly Spending</Text>
              <Text style={styles.sectionHint}>Last 12 months</Text>
            </View>

            <View style={styles.chartCard}>
              <View style={styles.monthGrid}>
                {monthlySpending.length > 0 ? (
                  monthlySpending.slice(0, 12).map((item, index) => {
                    const label = item.label ?? item.month ?? item.date ?? `M${index + 1}`;
                    const height = Math.max(16, (item.amount / monthlyPeak) * 120);
                    return (
                      <View key={`${label}-${index}`} style={styles.monthItem}>
                        <View style={[styles.monthBar, { height }]} />
                        <Text style={styles.monthLabel} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.monthValue}>{formatCurrency(asNumber(item.amount))}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyState}>Belum ada data spending bulanan.</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Comparison</Text>
              <Text style={styles.sectionHint}>Today vs yesterday, this month vs last month</Text>
            </View>

            <View style={styles.compareGrid}>
              <View style={styles.compareCard}>
                <Text style={styles.compareLabel}>Today</Text>
                <Text style={styles.compareValue}>{formatCurrency(todayExpense)}</Text>
                <Text style={styles.compareMeta}>Yesterday: {formatCurrency(yesterdayExpense)}</Text>
              </View>
              <View style={styles.compareCard}>
                <Text style={styles.compareLabel}>This Month</Text>
                <Text style={styles.compareValue}>{formatCurrency(thisMonthExpense)}</Text>
                <Text style={styles.compareMeta}>Last month: {formatCurrency(lastMonthExpense)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Expense vs Salary</Text>
              <Text style={styles.sectionHint}>{expenseRatio}% of latest salary</Text>
            </View>

            <View style={styles.ratioCard}>
              <View style={styles.ratioTrack}>
                <View style={[styles.ratioFill, { width: `${Math.min(expenseRatio, 100)}%` }]} />
              </View>
              <View style={styles.ratioMetaRow}>
                <View>
                  <Text style={styles.ratioMetaLabel}>Expense</Text>
                  <Text style={styles.ratioMetaValue}>{formatCurrency(expenseAmount)}</Text>
                </View>
                <View>
                  <Text style={styles.ratioMetaLabel}>Salary</Text>
                  <Text style={styles.ratioMetaValue}>{formatCurrency(salaryAmount)}</Text>
                </View>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 20,
      gap: 18,
    },
    hero: {
      borderRadius: 28,
      backgroundColor: colors.primary,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      shadowColor: alpha(colors.primary, 0.18),
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
    },
    heroText: {
      flex: 1,
    },
    kicker: {
      color: colors.inverseTextMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.8,
      fontSize: 11,
      fontWeight: '800',
    },
    title: {
      marginTop: 6,
      color: colors.inverseText,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '900',
      letterSpacing: -1,
    },
    subtitle: {
      marginTop: 8,
      maxWidth: 320,
      color: colors.inverseTextSoft,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.heroOverlay,
    },
    loadingCard: {
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLowest,
      paddingVertical: 32,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
    },
    kpiGrid: {
      gap: 12,
    },
    kpiCard: {
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 18,
    },
    kpiIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLow,
    },
    kpiLabel: {
      marginTop: 12,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    kpiValue: {
      marginTop: 8,
      color: colors.onSurface,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    section: {
      gap: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionTitle: {
      color: colors.onSurface,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    sectionHint: {
      color: colors.icon,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    chartCard: {
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 16,
      gap: 12,
    },
    emptyState: {
      color: colors.icon,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 12,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    barLabel: {
      width: 56,
      color: colors.icon,
      fontSize: 11,
      fontWeight: '700',
    },
    barTrack: {
      flex: 1,
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    barValue: {
      width: 92,
      textAlign: 'right',
      color: colors.onSurface,
      fontSize: 11,
      fontWeight: '800',
    },
    monthGrid: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 180,
    },
    monthItem: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    monthBar: {
      width: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
      minHeight: 16,
    },
    monthLabel: {
      color: colors.icon,
      fontSize: 10,
      fontWeight: '700',
    },
    monthValue: {
      color: colors.onSurface,
      fontSize: 10,
      fontWeight: '800',
      textAlign: 'center',
    },
    compareGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    compareCard: {
      flex: 1,
      borderRadius: 22,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 16,
    },
    compareLabel: {
      color: colors.icon,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    compareValue: {
      marginTop: 10,
      color: colors.onSurface,
      fontSize: 18,
      fontWeight: '900',
    },
    compareMeta: {
      marginTop: 8,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '600',
    },
    ratioCard: {
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 16,
      gap: 14,
    },
    ratioTrack: {
      height: 16,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    ratioFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.secondary,
    },
    ratioMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    ratioMetaLabel: {
      color: colors.icon,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    ratioMetaValue: {
      marginTop: 6,
      color: colors.onSurface,
      fontSize: 14,
      fontWeight: '800',
    },
  });
