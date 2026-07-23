import { BudgetRing } from '@/components/dashboard/budget-ring';
import { alpha, type AppColorTheme } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated, Pressable, Text, View } from 'react-native';
import type { DashboardSummaryData, DashboardInsightData } from '@/lib/api/dashboard';
import type { TransactionRecord } from '@/lib/api/transactions';
import type { WalletRecord } from '@/lib/api/wallets';
import {
  clampPercent,
  formatCompactCurrency,
  formatPercentValue,
  formatSignedCurrency,
  getCategoryIcon,
  getInsightIcon,
  getInsightTone,
  normalizeCategoryLabel,
  toNumber,
  type DashboardFilters,
  type TrendMode,
  type TrendPoint,
} from '@/components/dashboard/dashboard-utils';


type SectionRevealStyle = { opacity: any; transform: { translateY: any }[] };

export function DashboardHero({
  colors, styles, locale, t, totalBalance, monthlyMomentum, momentumIcon, momentumPrefix, filters, sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  totalBalance: number; monthlyMomentum: number; momentumIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  momentumPrefix: string; filters: DashboardFilters; sectionRevealStyles: SectionRevealStyle[];
}) {
  return (
    <Animated.View style={[styles.heroBlock, sectionRevealStyles[1]]}>
      <Text style={styles.kicker}>{t('dashboard.kicker')}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={styles.heroAmount}>
        {formatCompactCurrency(totalBalance, locale)}
      </Text>
      <View style={styles.momentumRow}>
        <View style={styles.momentumBadge}>
          <MaterialCommunityIcons name={momentumIcon} size={12} color={colors.secondaryAccent} />
          <Text style={styles.momentumBadgeText}>
            {momentumPrefix}{monthlyMomentum.toFixed(1)}%{' '}
            {filters.dateMode === 'month' ? t('dashboard.thisMonth') : t('dashboard.filter.currentPeriod')}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.momentumHint}>{t('dashboard.vsLastQuarterPeak')}</Text>
      </View>
    </Animated.View>
  );
}

export function DashboardFilterCard({
  colors, styles, locale, t, filters, activePeriodLabel, filterModeLabel, openFilterModal,
  sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  filters: DashboardFilters; activePeriodLabel: string; filterModeLabel: string;
  openFilterModal: () => void; sectionRevealStyles: SectionRevealStyle[];
}) {
  return (
    <Animated.View style={[styles.filterCard, sectionRevealStyles[2]]}>
      <View style={styles.filterCardHeader}>
        <View style={styles.filterCardCopy}>
          <Text style={styles.filterCardKicker}>{t('dashboard.filter.kicker')}</Text>
          <Text numberOfLines={1} style={styles.filterCardTitle}>{activePeriodLabel}</Text>
          <Text style={styles.filterCardMeta}>{filterModeLabel}</Text>
        </View>
        <Pressable onPress={openFilterModal} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.action')} style={styles.filterCardAction}>
          <MaterialCommunityIcons name="tune-variant" size={16} color={colors.onPrimary} />
          <Text style={styles.filterCardActionText}>{t('dashboard.filter.action')}</Text>
        </Pressable>
      </View>
      <View style={styles.filterBadgeRow}>
        <View style={styles.filterBadge}>
          <MaterialCommunityIcons
            name={filters.dateMode === 'month' ? 'calendar-month-outline' : filters.dateMode === 'cycle' ? 'calendar-sync-outline' : 'calendar-range-outline'}
            size={12} color={colors.primary}
          />
          <Text style={styles.filterBadgeText}>{filterModeLabel}</Text>
        </View>
        <View style={styles.filterBadge}>
          <MaterialCommunityIcons name="clock-outline" size={12} color={colors.primary} />
          <Text style={styles.filterBadgeText}>{activePeriodLabel}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function DashboardLiquidCard({
  colors, styles, locale, t, netCashflow, monthlyExpense, expenseRatio, liquidProgress,
  sectionRevealStyles, isDark,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  netCashflow: number; monthlyExpense: number; expenseRatio: number; liquidProgress: number;
  sectionRevealStyles: SectionRevealStyle[]; isDark: boolean;
}) {
  return (
    <Animated.View style={[styles.liquidCard, sectionRevealStyles[3]]}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.cardEyebrow}>{t('dashboard.liquidCashFlow')}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.liquidAmount}>
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
        <Text style={styles.cardMeta}>{t('dashboard.opEx')}: {formatCompactCurrency(monthlyExpense, locale)}</Text>
        <Text style={styles.cardMeta}>{t('dashboard.burn')}: {formatPercentValue(Math.max(0, expenseRatio))}</Text>
      </View>
    </Animated.View>
  );
}

export function DashboardSummary({
  colors, styles, locale, t, language, summaryHighlights, savingsRate, debtToIncome, activePeriodLabel,
  sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  summaryHighlights: { label: string; value: string; meta: string }[];
  savingsRate: number; debtToIncome: number; activePeriodLabel: string;
  sectionRevealStyles: SectionRevealStyle[];
}) {
  return (
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
            <Text style={styles.summaryMetricLabel}>{item.label}</Text>
            <Text numberOfLines={1} ellipsizeMode="clip" adjustsFontSizeToFit minimumFontScale={0.72} style={styles.summaryMetricValue}>{item.value}</Text>
            <Text style={styles.summaryMetricMeta}>{item.meta}</Text>
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
  );
}

export function DashboardBudget({
  colors, styles, locale, t, language, summary, budgetSummary, budgetUsage, budgetStatusLabel,
  budgetActiveGoals, budgetOnTrackCount, budgetOverBudgetCount, budgetPreview,
  sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  summary: DashboardSummaryData | null; budgetSummary: any; budgetUsage: number;
  budgetStatusLabel: string; budgetActiveGoals: number; budgetOnTrackCount: number;
  budgetOverBudgetCount: number; budgetPreview: any[];
  sectionRevealStyles: SectionRevealStyle[];
}) {
  const budgetActiveLabel = language === 'id' ? 'Aktif' : 'Active';
  const budgetHealthyLabel = language === 'id' ? 'Sehat' : 'Healthy';

  return (
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
              {language === 'id' ? `${budgetOverBudgetCount} target melewati batas` : `${budgetOverBudgetCount} goals over budget`}
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
            {t('dashboard.budgetOverBudgetBody', { amount: formatCompactCurrency(toNumber(budgetSummary.over_budget_amount), locale) })}
          </Text>
        </View>
      ) : null}
      {budgetPreview.length > 0 ? (
        <View style={styles.budgetPreviewList}>
          {budgetPreview.map((goal) => {
            const tone = goal.status === 'over_budget' ? colors.danger : goal.status === 'on_track' ? colors.secondary : colors.primary;
            return (
              <View key={`${goal.name}-${goal.target_amount}`} style={styles.budgetPreviewItem}>
                <View style={styles.budgetPreviewHeader}>
                  <View style={styles.budgetPreviewCopy}>
                    <Text numberOfLines={1} style={styles.budgetPreviewTitle}>{goal.name}</Text>
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
      <Pressable onPress={() => router.push('/budgets')} accessibilityRole="button" accessibilityLabel={t('dashboard.manageBudgetGoals')} style={styles.secondaryAction}>
        <Text style={styles.secondaryActionText}>{t('dashboard.manageBudgetGoals')}</Text>
        <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

export function DashboardTrends({
  colors, styles, locale, t, trendMode, trendPoints, trendPeak, selectedBarIndex,
  sectionRevealStyles, onSetTrendMode, onSetSelectedBarIndex,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  trendMode: TrendMode; trendPoints: TrendPoint[]; trendPeak: number;
  selectedBarIndex: number | null; sectionRevealStyles: SectionRevealStyle[];
  onSetTrendMode: (m: TrendMode) => void; onSetSelectedBarIndex: (i: number | null) => void;
}) {
  return (
    <Animated.View style={[styles.card, sectionRevealStyles[6]]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('dashboard.spendingTrends')}</Text>
        <View style={styles.segmentedControl}>
          <Pressable onPress={() => onSetTrendMode('daily')} accessibilityRole="button" accessibilityLabel={t('dashboard.daily')} style={[styles.segmentButton, trendMode === 'daily' && styles.segmentButtonMuted]}>
            <Text style={[styles.segmentLabel, trendMode === 'daily' && styles.segmentLabelActive]}>{t('dashboard.daily')}</Text>
          </Pressable>
          <Pressable onPress={() => onSetTrendMode('monthly')} accessibilityRole="button" accessibilityLabel={t('dashboard.monthly')} style={[styles.segmentButton, trendMode === 'monthly' && styles.segmentButtonActive]}>
            <Text style={[styles.segmentLabel, trendMode === 'monthly' && styles.segmentLabelSelected]}>{t('dashboard.monthly')}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.trendChart}>
        {trendPoints.length > 0 ? (
          trendPoints.map((point, index) => (
            <Pressable
              key={`${point.label}-${point.value}`}
              onPress={() => onSetSelectedBarIndex(selectedBarIndex === index ? null : index)}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}: ${formatCompactCurrency(point.value, locale)}`}
              style={styles.trendItem}>
              {selectedBarIndex === index ? (
                <View style={styles.tooltipContainer}>
                  <Text style={styles.tooltipText}>{formatCompactCurrency(point.value, locale)}</Text>
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
              <Text numberOfLines={1} style={styles.trendLabel}>{point.label}</Text>
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
  );
}

export function DashboardDebt({
  colors, styles, locale, t, language, summary, dashboardDebt, remainingDebt, totalDebt,
  debtToIncome, debtToBalance, debtCompletion, debtHealthScore, debtHealthLabel,
  sectionRevealStyles, onOpenDebtPay,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  summary: DashboardSummaryData | null; dashboardDebt: any; remainingDebt: number;
  totalDebt: number; debtToIncome: number; debtToBalance: number;
  debtCompletion: number; debtHealthScore: number; debtHealthLabel: string;
  sectionRevealStyles: SectionRevealStyle[]; onOpenDebtPay: () => void;
}) {
  return (
    <Animated.View style={[styles.card, sectionRevealStyles[7]]}>
      <View style={styles.debtStatusRow}>
        <View style={[styles.debtStatusPill, { backgroundColor: alpha(colors.primary, 0.1) }]}>
          <Text style={[styles.debtStatusPillText, { color: colors.primary }]}>{debtHealthLabel}</Text>
        </View>
        <Text style={styles.debtStatusMeta}>
          {language === 'id' ? `Skor kesehatan ${formatPercentValue(debtHealthScore)}` : `Health score ${formatPercentValue(debtHealthScore)}`}
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
          style={[styles.debtStatusFill, {
            width: `${debtHealthScore}%`,
            backgroundColor: debtHealthScore >= 75 ? colors.secondary : debtHealthScore >= 45 ? colors.warning : colors.danger,
          }]}
        />
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.cardEyebrow}>{t('dashboard.leverageRatio')}</Text>
        <Text style={styles.metricValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
        <Text style={styles.metricMeta}>{t('dashboard.debtBalanceRatio', { percent: formatPercentValue(Math.max(0, debtToBalance)) })}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={onOpenDebtPay} accessibilityRole="button" accessibilityLabel={t('dashboard.consolidate')} style={[styles.secondaryAction, { flex: 1 }]}>
          <Text style={styles.secondaryActionText}>{t('dashboard.consolidate')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={colors.onPrimary} />
        </Pressable>
        <Pressable onPress={onOpenDebtPay} accessibilityRole="button" accessibilityLabel={language === 'id' ? 'Bayar Utang' : 'Pay Debt'} style={[styles.secondaryAction, { flex: 1, backgroundColor: colors.warning }]}>
          <MaterialCommunityIcons name="cash-fast" size={16} color={colors.onPrimary} />
          <Text style={styles.secondaryActionText}>{language === 'id' ? 'Bayar Utang' : 'Pay Debt'}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function DashboardTransactions({
  colors, styles, locale, t, language, recentTransactions, sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  recentTransactions: TransactionRecord[]; sectionRevealStyles: SectionRevealStyle[];
}) {
  return (
    <Animated.View style={[styles.card, sectionRevealStyles[8]]}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>{t('dashboard.recentTransactions')}</Text>
        <Pressable hitSlop={10} onPress={() => router.navigate('/activity')} accessibilityRole="button" accessibilityLabel={t('dashboard.recentTransactionsViewAll')}>
          <Text style={styles.linkText}>{t('dashboard.recentTransactionsViewAll')}</Text>
        </Pressable>
      </View>
      <View style={styles.activityList}>
        {recentTransactions.length > 0 ? (
          recentTransactions.map((tx) => {
            const isIncome = tx.type === 'income';
            const iconBg = alpha(isIncome ? colors.secondaryAccent : colors.primary, 0.1);
            return (
              <View key={tx.id} style={styles.activityItem}>
                <View style={styles.activityLeft}>
                  <View style={[styles.activityIconWrap, { backgroundColor: iconBg }]}>
                    <MaterialCommunityIcons name={isIncome ? 'cash-fast' : 'cart-outline'} size={18} color={isIncome ? colors.secondaryAccent : colors.primary} />
                  </View>
                  <View style={styles.activityCopy}>
                    <Text numberOfLines={1} style={styles.activityTitle}>{tx.category}</Text>
                    <Text numberOfLines={1} style={styles.activityMeta}>
                      {tx.description?.trim() || tx.category} • {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(tx.date))}
                    </Text>
                  </View>
                </View>
                <View style={styles.activityRight}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.activityAmount, isIncome && styles.activityAmountPositive]}>
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
            <Text style={{ color: colors.shellTextMuted, fontSize: 13, fontWeight: '600' }}>{t('dashboard.recentTransactionsEmpty')}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export function DashboardShowMore({
  colors, styles, language, showAllSections, onToggle,
}: {
  colors: AppColorTheme; styles: any; language: string;
  showAllSections: boolean; onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.showMoreButton, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={showAllSections ? (language === 'id' ? 'Tutup' : 'Show less') : (language === 'id' ? 'Lebih banyak' : 'Show more')}>
      <Text style={styles.showMoreButtonText}>
        {showAllSections ? (language === 'id' ? 'Tutup' : 'Show less') : (language === 'id' ? 'Tampilkan lebih banyak' : 'Show more')}
      </Text>
      <MaterialCommunityIcons name={showAllSections ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
    </Pressable>
  );
}

export function DashboardExpandedSections({
  colors, styles, locale, t, language, summary, wallets, categoryTopThree,
  priorityInsights, debtToIncome, savingsRate, budgetUsage, budgetSignalLabel,
  debtSignalLabel, cashflowSignalLabel, sectionRevealStyles,
}: {
  colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  summary: DashboardSummaryData | null; wallets: WalletRecord[];
  categoryTopThree: any[]; priorityInsights: DashboardInsightData[];
  debtToIncome: number; savingsRate: number; budgetUsage: number;
  budgetSignalLabel: string; debtSignalLabel: string; cashflowSignalLabel: string;
  sectionRevealStyles: SectionRevealStyle[];
}) {
  return (
    <>
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
              <Text style={styles.billsTitle}>{t('dashboard.upcomingBillsCount', { count: String(summary.upcoming_bills.count) })}</Text>
              {summary.upcoming_bills.next_due_date ? (
                <Text style={styles.billsMeta}>
                  {t('dashboard.upcomingBillsNextDue')}: {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(summary.upcoming_bills.next_due_date))}
                </Text>
              ) : null}
            </View>
            <View style={styles.billsRight}>
              <Text style={styles.billsAmount}>{formatCompactCurrency(Number(summary.upcoming_bills.total_amount) || 0, locale)}</Text>
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
              {formatCompactCurrency(wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0), locale)}
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
              <Text style={styles.walletBalance}>{formatCompactCurrency(Number(wallet.balance) || 0, locale)}</Text>
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
                  <Text style={styles.merchantMeta}>{t('dashboard.topMerchantsCount', { count: String(merchant.transaction_count) })}</Text>
                </View>
              </View>
              <View style={styles.merchantRight}>
                <Text style={styles.merchantAmount}>{formatCompactCurrency(Number(merchant.amount) || 0, locale)}</Text>
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
            <Text style={styles.insightHeroPillText}>{language === 'id' ? '3 prioritas' : '3 priorities'}</Text>
          </View>
        </View>
        <View style={styles.insightSignalGrid}>
          <View style={styles.insightSignalCard}>
            <View style={[styles.insightSignalIcon, { backgroundColor: alpha(colors.onPrimary, 0.12) }]}>
              <MaterialCommunityIcons name="bank-outline" size={16} color={colors.secondary} />
            </View>
            <Text style={styles.insightSignalLabel}>{language === 'id' ? 'Utang' : 'Debt'}</Text>
            <Text style={styles.insightSignalValue}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
            <Text style={styles.insightSignalMeta}>{debtSignalLabel}</Text>
          </View>
          <View style={styles.insightSignalCard}>
            <View style={[styles.insightSignalIcon, { backgroundColor: alpha(colors.onPrimary, 0.12) }]}>
              <MaterialCommunityIcons name="wallet-outline" size={16} color={colors.warning} />
            </View>
            <Text style={styles.insightSignalLabel}>{language === 'id' ? 'Budget' : 'Budget'}</Text>
            <Text style={styles.insightSignalValue}>{formatPercentValue(budgetUsage)}</Text>
            <Text style={styles.insightSignalMeta}>{budgetSignalLabel}</Text>
          </View>
        </View>
        <View style={styles.insightCompareStrip}>
          <View style={styles.insightCompareIcon}>
            <MaterialCommunityIcons name="chart-timeline-variant" size={15} color={colors.primary} />
          </View>
          <View style={styles.insightCompareCopy}>
            <Text style={styles.insightCompareTitle}>{language === 'id' ? 'Utang vs arus kas' : 'Debt vs cash flow'}</Text>
            <Text style={styles.insightCompareMeta}>
              {language === 'id'
                ? `Utang ${formatPercentValue(Math.max(0, debtToIncome))} · Arus kas ${formatPercentValue(Math.max(0, savingsRate))} · ${cashflowSignalLabel}`
                : `Debt ${formatPercentValue(Math.max(0, debtToIncome))} · Cash flow ${formatPercentValue(Math.max(0, savingsRate))} · ${cashflowSignalLabel}`}
            </Text>
          </View>
          <View style={styles.insightCompareChips}>
            <View style={[styles.insightCompareChip, { backgroundColor: colors.shellCardSoft, borderWidth: 1, borderColor: colors.shellBorder }]}>
              <Text style={[styles.insightCompareChipText, { color: colors.danger }]}>{formatPercentValue(Math.max(0, debtToIncome))}</Text>
            </View>
            <View style={[styles.insightCompareChip, { backgroundColor: colors.shellCardSoft, borderWidth: 1, borderColor: colors.shellBorder }]}>
              <Text style={[styles.insightCompareChipText, { color: colors.secondary }]}>{formatPercentValue(Math.max(0, savingsRate))}</Text>
            </View>
          </View>
        </View>
        <View style={styles.insightCategorySection}>
          <View style={styles.insightSectionHeader}>
            <Text style={styles.insightSectionTitle}>{language === 'id' ? 'Komposisi pengeluaran' : 'Spending composition'}</Text>
            <Text style={styles.insightSectionMeta}>{language === 'id' ? '3 kategori terbesar periode aktif' : 'Top 3 categories for the active period'}</Text>
          </View>
          {categoryTopThree.length > 0 ? (
            <>
              <View style={styles.insightStackBar}>
                {categoryTopThree.map((item, index) => {
                  const value = Math.max(0, toNumber(item.percentage));
                  const tone = index === 0 ? colors.primary : index === 1 ? colors.secondary : colors.warning;
                  return (
                    <View key={`${item.category}-${index}`} style={[styles.insightStackSegment, { width: `${Math.max(8, value)}%`, backgroundColor: tone }]} />
                  );
                })}
              </View>
              <View style={styles.insightCategoryList}>
                {categoryTopThree.map((item, index) => {
                  const value = Math.max(0, toNumber(item.percentage));
                  const icon = getCategoryIcon(item.category);
                  const tone = index === 0 ? colors.primary : index === 1 ? colors.secondary : colors.warning;
                  return (
                    <View key={`${item.category}-${item.amount}`} style={styles.insightCategoryItem}>
                      <View style={[styles.insightCategoryIcon, { backgroundColor: alpha(tone, 0.14) }]}>
                        <MaterialCommunityIcons name={icon} size={15} color={tone} />
                      </View>
                      <View style={styles.insightCategoryCopy}>
                        <Text numberOfLines={1} style={styles.insightCategoryTitle}>{normalizeCategoryLabel(item.category, language)}</Text>
                        <Text style={styles.insightCategoryMeta}>{formatCompactCurrency(toNumber(item.amount), locale)}</Text>
                      </View>
                      <View style={styles.insightCategoryRight}>
                        <Text style={styles.insightCategoryPercent}>{formatPercentValue(value)}</Text>
                        <View style={styles.insightCategoryBarTrack}>
                          <View style={[styles.insightCategoryBarFill, { width: `${Math.max(8, value)}%`, backgroundColor: tone }]} />
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
              const tone = toneKey === 'danger' ? colors.danger : toneKey === 'warning' ? colors.warning : colors.primary;
              const label = toneKey === 'danger'
                ? language === 'id' ? 'Prioritas tinggi' : 'High priority'
                : toneKey === 'warning'
                  ? language === 'id' ? 'Perlu perhatian' : 'Needs attention'
                  : language === 'id' ? 'Informasi' : 'Info';
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
        <Pressable onPress={() => router.navigate('/reports')} accessibilityRole="button" accessibilityLabel={t('dashboard.optimizeStrategy')} style={styles.primaryAction}>
          <Text style={styles.primaryActionText}>{t('dashboard.optimizeStrategy')}</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}


