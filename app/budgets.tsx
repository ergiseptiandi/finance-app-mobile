import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeSalaryCycleDates } from '@/components/dashboard/dashboard-utils';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import { createBudgetGoal, deleteBudgetGoal, listBudgetGoals, updateBudgetGoal, type BudgetGoalRecord, type BudgetGoalStatus, type BudgetSummaryData } from '@/lib/api/budgets';
import { listCategories, type CategoryRecord } from '@/lib/api/categories';
import { getNotificationSettings } from '@/lib/api/notifications';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';

type BudgetDraft = {
  id?: number;
  categoryId: string;
  monthlyAmount: string;
};

const createEmptyDraft = (): BudgetDraft => ({
  categoryId: '',
  monthlyAmount: '',
});

const sanitizeCurrencyInput = (value: string) => value.replace(/[^\d]/g, '');

const formatCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);

  if (!normalized) {
    return '';
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Number(normalized));
};

const parseCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  return normalized ? Number(normalized) : 0;
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));

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

const formatPercent = (value: number) => `${Math.round(value)}%`;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const getStatusLabel = (status: BudgetGoalStatus | undefined, t: (key: string) => string) => {
  switch (status) {
    case 'over_budget':
      return t('budget.status.overBudget');
    case 'on_track':
      return t('budget.status.onTrack');
    case 'under_budget':
      return t('budget.status.underBudget');
    default:
      return t('budget.status.inactive');
  }
};

const getStatusTone = (status: BudgetGoalStatus | undefined, colors: AppColorTheme) => {
  switch (status) {
    case 'over_budget':
      return colors.danger;
    case 'on_track':
      return colors.secondary;
    case 'under_budget':
      return colors.primary;
    default:
      return colors.shellTextMuted;
  }
};

function BudgetGoalCard({
  goal,
  colors,
  locale,
  t,
  onEdit,
  onDelete,
  deleting,
}: {
  goal: BudgetGoalRecord;
  colors: AppColorTheme;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const monthlyAmount = toNumber(goal.monthly_amount);
  const currentAmount = toNumber(goal.current_amount);
  const remainingAmount = toNumber(goal.remaining_amount);
  const progress = clampPercent(toNumber(goal.progress_percentage));
  const tone = getStatusTone(goal.status, colors);
  const statusLabel = getStatusLabel(goal.status, t);

  return (
    <View style={cardStyles(colors).card}>
      <View style={cardStyles(colors).header}>
        <View style={cardStyles(colors).copy}>
          <Text numberOfLines={1} style={cardStyles(colors).name}>
            {goal.category_name}
          </Text>
          <Text style={cardStyles(colors).meta}>
            {formatDetailCurrency(monthlyAmount, locale)} / {t('budget.perMonth')}
          </Text>
        </View>
        <View style={[cardStyles(colors).statusPill, { backgroundColor: alpha(tone, 0.14) }]}>
          <Text style={[cardStyles(colors).statusText, { color: tone }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={cardStyles(colors).progressTrack}>
        <View style={[cardStyles(colors).progressFill, { width: `${progress}%`, backgroundColor: tone }]} />
      </View>

      <View style={cardStyles(colors).metricsRow}>
        <View style={cardStyles(colors).metric}>
          <Text style={cardStyles(colors).metricLabel}>{t('budget.currentSpent')}</Text>
          <Text numberOfLines={1} style={cardStyles(colors).metricValue}>
            {formatCompactCurrency(currentAmount, locale)}
          </Text>
        </View>
        <View style={cardStyles(colors).metric}>
          <Text style={cardStyles(colors).metricLabel}>{t('budget.remainingBudget')}</Text>
          <Text numberOfLines={1} style={cardStyles(colors).metricValue}>
            {formatCompactCurrency(remainingAmount, locale)}
          </Text>
        </View>
      </View>

      <View style={cardStyles(colors).footer}>
        <View style={cardStyles(colors).footerCopy}>
          <Text style={cardStyles(colors).footerLabel}>{t('budget.progress')}</Text>
          <Text style={cardStyles(colors).footerValue}>{formatPercent(progress)}</Text>
        </View>

        <View style={cardStyles(colors).actions}>
          <Pressable onPress={onEdit} style={cardStyles(colors).iconButton}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
          </Pressable>
          <Pressable onPress={onDelete} style={cardStyles(colors).iconButton}>
            {deleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function BudgetsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { language, t } = useAppLanguage();
  const { isOffline } = useNetworkStatus();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [salaryDay, setSalaryDay] = useState<number>(25);
  const [summary, setSummary] = useState<BudgetSummaryData | null>(null);
  const [goals, setGoals] = useState<BudgetGoalRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [draft, setDraft] = useState<BudgetDraft>(createEmptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const expenseCategories = useMemo(
    () => [...categories].filter((category) => category.type === 'expense').sort((left, right) => left.name.localeCompare(right.name)),
    [categories]
  );

  const sortedGoals = useMemo(
    () =>
      [...goals].sort((left, right) => {
        const leftAmount = toNumber(left.monthly_amount);
        const rightAmount = toNumber(right.monthly_amount);

        if (rightAmount === leftAmount) {
          return left.category_name.localeCompare(right.category_name);
        }

        return rightAmount - leftAmount;
      }),
    [goals]
  );

  const totalMonthlyBudget = toNumber(summary?.monthly_budget);
  const spentAmount = toNumber(summary?.spent);
  const remainingAmount = toNumber(summary?.remaining);
  const usageRate = toNumber(summary?.usage_rate);
  const overBudgetAmount = toNumber(summary?.over_budget_amount);
  const overBudget = Boolean(summary?.is_over_budget);
  const visibleGoals = sortedGoals.slice(0, 4);

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
        }
      } catch {
        // keep default
      }
    };
    fetchSalaryDay();
    return () => { active = false; };
  }, []);

  const salaryCycleDates = useMemo(() => computeSalaryCycleDates(salaryDay), [salaryDay]);

  const loadBudgets = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const results = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([
            listBudgetGoals(accessToken),
            listCategories(accessToken, { type: 'expense' }),
          ])
        );

        const [goalResult, categoryResult] = results;

        if (goalResult.status === 'fulfilled') {
          setSummary(goalResult.value.Data.summary ?? null);
          setGoals(goalResult.value.Data.items ?? []);
        }

        if (categoryResult.status === 'fulfilled') {
          setCategories(categoryResult.value.Data ?? []);
        }

        const hardFailure = results.some(
          (result) => result.status === 'rejected' && !(result.reason instanceof ApiRequestError && result.reason.status === 401)
        );

        if (hardFailure) {
          setError(isOffline ? t('common.offlineLoadError') : t('budget.partialError'));
        }
      } catch (loadError) {
        if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
          setError(isOffline ? t('common.offlineLoadError') : t('budget.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isOffline, t, withAuthorizedRequest]
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      void loadBudgets(true);

      return () => subscription.remove();
    }, [loadBudgets])
  );

  const handleSave = useCallback(async () => {
    const categoryId = Number(draft.categoryId);
    const monthlyAmount = parseCurrencyInput(draft.monthlyAmount);

    if (!Number.isFinite(categoryId) || categoryId <= 0 || monthlyAmount <= 0) {
      setError(t('budget.validation'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (draft.id) {
        await withAuthorizedRequest((accessToken) =>
          updateBudgetGoal(accessToken, draft.id!, {
            category_id: categoryId,
            monthly_amount: monthlyAmount,
          })
        );
      } else {
        await withAuthorizedRequest((accessToken) =>
          createBudgetGoal(accessToken, {
            category_id: categoryId,
            monthly_amount: monthlyAmount,
          })
        );
      }

      setDraft(createEmptyDraft());
      await loadBudgets(true);
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setError(t('budget.saveError'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, loadBudgets, t, withAuthorizedRequest]);

  const handleDelete = useCallback(
    (goal: BudgetGoalRecord) => {
      Alert.alert(t('budget.deleteTitle'), t('budget.deleteBody', { name: goal.category_name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('budget.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(goal.id);
              setError('');

              try {
                await withAuthorizedRequest((accessToken) => deleteBudgetGoal(accessToken, goal.id));
                if (draft.id === goal.id) {
                  setDraft(createEmptyDraft());
                }
                await loadBudgets(true);
              } catch (deleteError) {
                if (deleteError instanceof ApiRequestError) {
                  setError(deleteError.message);
                } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
                  setError(t('budget.deleteError'));
                }
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]);
    },
    [draft.id, loadBudgets, t, withAuthorizedRequest]
  );

  const selectedCategory = expenseCategories.find((category) => String(category.id) === draft.categoryId) ?? null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBudgets(true)} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.shellTextPrimary} />
        </Pressable>
        <Text numberOfLines={1} style={styles.topTitle}>
          {t('budget.title')}
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>{t('budget.kicker')}</Text>
        <Text style={styles.title}>{t('budget.subtitle')}</Text>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryHeaderCopy}>
            <Text style={styles.sectionTitle}>{t('budget.summaryTitle')}</Text>
            <Text style={styles.sectionMeta}>
              {t('budget.periodLabel', {
                month: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(
                  new Date(salaryCycleDates.startDate + 'T00:00:00')
                ) + ' — ' + new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                  new Date(salaryCycleDates.endDate + 'T00:00:00')
                ),
              })}
            </Text>
          </View>
          <View style={styles.salaryCycleBadge}>
            <MaterialCommunityIcons name="calendar-sync-outline" size={12} color={colors.primary} />
            <Text style={styles.salaryCycleBadgeText}>
              {language === 'id' ? `Siklus gaji tgl ${salaryDay}` : `Pay cycle day ${salaryDay}`}
            </Text>
          </View>
        </View>
        <View style={[styles.summaryBadge, overBudget && styles.summaryBadgeDanger]}>
          <Text style={[styles.summaryBadgeText, overBudget && styles.summaryBadgeTextDanger]}>
            {overBudget ? t('budget.summaryOverBudget') : t('budget.summaryHealthy')}
          </Text>
        </View>

        {summary ? (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>{t('budget.summaryMonthly')}</Text>
              <Text style={styles.summaryMetricValue}>{formatCompactCurrency(totalMonthlyBudget, locale)}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>{t('budget.summarySpent')}</Text>
              <Text style={styles.summaryMetricValue}>{formatCompactCurrency(spentAmount, locale)}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>{t('budget.summaryRemaining')}</Text>
              <Text style={styles.summaryMetricValue}>{formatCompactCurrency(remainingAmount, locale)}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryMetricLabel}>{t('budget.summaryUsage')}</Text>
              <Text style={styles.summaryMetricValue}>{formatPercent(usageRate)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptySummary}>
            <MaterialCommunityIcons name="chart-box-outline" size={28} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{t('budget.emptySummaryTitle')}</Text>
            <Text style={styles.emptyBody}>{t('budget.emptySummaryBody')}</Text>
          </View>
        )}

        {summary?.is_over_budget ? (
          <View style={styles.overBudgetBanner}>
            <Text style={styles.overBudgetText}>
              {t('budget.summaryOverBudgetBody', { amount: formatCompactCurrency(overBudgetAmount, locale) })}
            </Text>
          </View>
        ) : null}

        <Pressable onPress={() => router.push('/categories')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('budget.manageCategories')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
        </Pressable>
      </View>

      <View style={styles.formCard}>
        <View style={styles.formHeader}>
          <Text style={styles.sectionTitle}>{t('budget.formTitle')}</Text>
          <Text style={styles.sectionMeta}>{selectedCategory?.name ?? t('budget.formMeta')}</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('budget.formCategory')}</Text>
          <View style={styles.categoryGrid}>
            {expenseCategories.length > 0 ? (
              expenseCategories.map((category) => {
                const active = String(category.id) === draft.categoryId;

                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setDraft((current) => ({ ...current, categoryId: String(category.id) }))}
                    style={[styles.categoryPill, active && styles.categoryPillActive]}>
                    <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{category.name}</Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.categoryEmpty}>
                <Text style={styles.categoryEmptyText}>{t('budget.noCategories')}</Text>
                <Pressable onPress={() => router.push('/categories')} style={styles.categoryEmptyAction}>
                  <Text style={styles.categoryEmptyActionText}>{t('budget.goCategories')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('budget.formAmount')}</Text>
          <TextInput
            value={draft.monthlyAmount}
            onChangeText={(value) => setDraft((current) => ({ ...current, monthlyAmount: formatCurrencyInput(value) }))}
            keyboardType="number-pad"
            placeholder={t('budget.formAmountPlaceholder')}
            placeholderTextColor={colors.inputPlaceholder}
            style={styles.input}
          />
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable onPress={handleSave} disabled={submitting} style={styles.submitButton}>
          {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.submitButtonText}>{draft.id ? t('budget.update') : t('budget.save')}</Text>}
        </Pressable>

        {draft.id ? (
          <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.secondaryGhostButton}>
            <Text style={styles.secondaryGhostText}>{t('budget.cancelEdit')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('budget.listTitle')}</Text>
        <Text style={styles.sectionMeta}>{t('budget.listMeta')}</Text>
      </View>

      {
        loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>{t('budget.loading')}</Text>
          </View>
        ) : visibleGoals.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="target" size={28} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{t('budget.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('budget.emptyBody')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleGoals.map((goal) => (
              <BudgetGoalCard
                key={goal.id}
                goal={goal}
                colors={colors}
                locale={locale}
                t={t}
                onEdit={() =>
                  setDraft({
                    id: goal.id,
                    categoryId: String(goal.category_id),
                    monthlyAmount: formatCurrencyInput(String(goal.monthly_amount ?? 0)),
                  })
                }
                onDelete={() => handleDelete(goal)}
                deleting={deletingId === goal.id}
              />
            ))}
          </View>
        )
      }
    </ScrollView >
  );
}

const cardStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: 18,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    name: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
    },
    meta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    statusPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    progressTrack: {
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metric: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      padding: 12,
      gap: 4,
    },
    metricLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    metricValue: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    footerCopy: {
      gap: 2,
    },
    footerLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    footerValue: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
  });

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingTop: Math.max(topInset, 18),
      paddingHorizontal: 18,
      paddingBottom: 28,
      gap: 16,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    topTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    hero: {
      gap: 6,
      paddingBottom: 4,
    },
    kicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2.2,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 26,
      fontWeight: '700',
    },
    summaryCard: {
      borderRadius: 24,
      padding: 18,
      gap: 16,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    summaryHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    sectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    sectionMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    summaryBadge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      backgroundColor: alpha(colors.secondary, 0.14),
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    summaryBadgeDanger: {
      backgroundColor: alpha(colors.danger, 0.14),
    },
    summaryBadgeText: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryBadgeTextDanger: {
      color: colors.danger,
    },
    salaryCycleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: alpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.2),
    },
    salaryCycleBadgeText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    summaryMetric: {
      width: '48%',
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      padding: 14,
      gap: 6,
    },
    summaryMetricLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryMetricValue: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    emptySummary: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
    },
    emptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    overBudgetBanner: {
      borderRadius: 18,
      backgroundColor: alpha(colors.danger, 0.1),
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    overBudgetText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    secondaryButton: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.shellTextPrimary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    secondaryButtonText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    formCard: {
      borderRadius: 24,
      padding: 18,
      gap: 16,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    formHeader: {
      gap: 4,
    },
    fieldGroup: {
      gap: 10,
    },
    fieldLabel: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    input: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      color: colors.shellTextPrimary,
      fontSize: 16,
      paddingHorizontal: 16,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    categoryPill: {
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    categoryPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryPillText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    categoryPillTextActive: {
      color: colors.onPrimary,
    },
    categoryEmpty: {
      flex: 1,
      gap: 10,
      alignItems: 'flex-start',
    },
    categoryEmptyText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    categoryEmptyAction: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    categoryEmptyActionText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    submitButton: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    secondaryGhostButton: {
      minHeight: 46,
      borderRadius: 16,
      backgroundColor: alpha(colors.shellTextPrimary, 0.06),
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryGhostText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    sectionHeader: {
      gap: 4,
    },
    list: {
      gap: 12,
    },
    stateCard: {
      minHeight: 160,
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 20,
    },
    stateText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
  });
