import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { computeSalaryCycleDates } from '@/components/dashboard/dashboard-utils';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { type CategoryRecord } from '@/lib/api/categories';
import {
  type TransactionRecord,
  type TransactionType,
} from '@/lib/api/transactions';
import { type WalletRecord } from '@/lib/api/wallets';

import {
  DAY_SUMMARY_STYLES,
  ROW_STYLES,
  SUMMARY_CARD_STYLES,
} from './activity-styles';
import {
  type ActivityDateFilterMode,
  type ActivityFilterType,
  type ActivityListFilters,
  type TransactionFormState,
  formatCurrencyInput,
  getCategoryVisual,
  getCurrentMonthInputValue,
  getTodayInputValue,
  toCurrency,
  toDateInputLabel,
  toDayDateQuickValues,
  toMonthInputLabel,
  toMonthValue,
  toPickerDate,
  toSignedCurrency,
} from './activity-utils';

type TranslateFn = (k: string, params?: Record<string, string | number>) => string;

function SummaryStat({
  colors,
  title,
  value,
  meta,
  metaTone = 'muted',
  accent = 'primary',
  showProgress = false,
  progress = 0,
}: {
  colors: AppColorTheme;
  title: string;
  value: string;
  meta: string;
  metaTone?: 'muted' | 'positive';
  accent?: 'primary' | 'secondary' | 'teal';
  showProgress?: boolean;
  progress?: number;
}) {
  const isLight = colors === Colors.light;
  const accentMap = {
    primary: {
      background: alpha(colors.primary, isLight ? 0.08 : 0.14),
      fill: colors.primary,
      borderColor: alpha(colors.primary, isLight ? 0.14 : 0.24),
      metaColor: isLight ? '#c5651a' : colors.secondaryAccent,
    },
    secondary: {
      background: isLight ? colors.shellCardSoft : alpha(colors.surfaceContainerHigh, 0.16),
      fill: isLight ? colors.primary : colors.primaryContainer,
      borderColor: alpha(colors.primary, isLight ? 0.08 : 0.18),
      metaColor: colors.shellTextSecondary,
    },
    teal: {
      background: alpha(isLight ? '#0f7a52' : colors.secondary, isLight ? 0.08 : 0.12),
      fill: isLight ? '#0f7a52' : colors.secondaryAccent,
      borderColor: alpha(isLight ? '#0f7a52' : colors.secondary, isLight ? 0.14 : 0.22),
      metaColor: isLight ? '#0f7a52' : colors.secondary,
    },
  } as const;

  const palette = accentMap[accent];

  return (
    <View
      style={[
        SUMMARY_CARD_STYLES(colors).card,
        { backgroundColor: palette.background, borderColor: palette.borderColor },
      ]}>
      <Text style={SUMMARY_CARD_STYLES(colors).title}>{title}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={SUMMARY_CARD_STYLES(colors).value}>
        {value}
      </Text>
      {showProgress ? (
        <View style={SUMMARY_CARD_STYLES(colors).progressTrack}>
          <View
            style={[
              SUMMARY_CARD_STYLES(colors).progressFill,
              { width: `${Math.max(8, progress)}%`, backgroundColor: palette.fill },
            ]}
          />
        </View>
      ) : null}
      <Text
        style={[
          SUMMARY_CARD_STYLES(colors).meta,
          { color: metaTone === 'positive' ? palette.metaColor : colors.shellTextMuted },
        ]}>
        {meta}
      </Text>
    </View>
  );
}

function TransactionDaySummary({
  colors,
  locale,
  income,
  expense,
  net,
  incomeLabel,
  expenseLabel,
  netLabel,
}: {
  colors: AppColorTheme;
  locale: string;
  income: number;
  expense: number;
  net: number;
  incomeLabel: string;
  expenseLabel: string;
  netLabel: string;
}) {
  const isLight = colors === Colors.light;
  const incomeTone = isLight ? '#0f7a52' : colors.secondaryAccent;
  const expenseTone = isLight ? '#c5651a' : colors.primaryContainer;
  const netTone = net >= 0 ? incomeTone : expenseTone;

  return (
    <View style={DAY_SUMMARY_STYLES(colors).card}>
      <View style={DAY_SUMMARY_STYLES(colors).row}>
        <Text style={DAY_SUMMARY_STYLES(colors).label}>{incomeLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[DAY_SUMMARY_STYLES(colors).value, { color: incomeTone }]}
        >
          {toCurrency(income, locale)}
        </Text>
      </View>

      <View style={DAY_SUMMARY_STYLES(colors).divider} />

      <View style={DAY_SUMMARY_STYLES(colors).row}>
        <Text style={DAY_SUMMARY_STYLES(colors).label}>{expenseLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[DAY_SUMMARY_STYLES(colors).value, { color: expenseTone }]}
        >
          {toCurrency(expense, locale)}
        </Text>
      </View>

      <View style={DAY_SUMMARY_STYLES(colors).divider} />

      <View style={DAY_SUMMARY_STYLES(colors).row}>
        <Text style={DAY_SUMMARY_STYLES(colors).label}>{netLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[DAY_SUMMARY_STYLES(colors).value, { color: netTone }]}
        >
          {toSignedCurrency(net, locale)}
        </Text>
      </View>
    </View>
  );
}

function TransactionRow({
  record,
  colors,
  locale,
  statusLabel,
  incomeLabel,
  expenseLabel,
  onPress,
}: {
  record: TransactionRecord;
  colors: AppColorTheme;
  locale: string;
  statusLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  onPress: () => void;
}) {
  const isIncome = record.type === 'income';
  const isLight = colors === Colors.light;
  const rowAccent = isIncome
    ? isLight
      ? '#0f7a52'
      : colors.secondaryAccent
    : isLight
      ? '#c5651a'
      : colors.primaryContainer;
  const iconColor = rowAccent;
  const iconBackground = alpha(rowAccent, isLight ? 0.14 : 0.18);
  const amount = toSignedCurrency(isIncome ? record.amount : -record.amount, locale);
  const subtitleBase = record.description?.trim() || (isIncome ? incomeLabel : expenseLabel);
  const subtitle = `${subtitleBase} • ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(record.date))}`;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ROW_STYLES(colors).card, pressed && ROW_STYLES(colors).pressed]}>
      <View style={ROW_STYLES(colors).left}>
        <View style={[ROW_STYLES(colors).iconWrap, { backgroundColor: iconBackground }]}>
          <MaterialCommunityIcons name={isIncome ? 'cash-fast' : 'cart-outline'} size={20} color={iconColor} />
        </View>

        <View style={ROW_STYLES(colors).copy}>
          <Text numberOfLines={2} style={ROW_STYLES(colors).title}>
            {record.category}
          </Text>
          <Text numberOfLines={2} style={ROW_STYLES(colors).subtitle}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={ROW_STYLES(colors).right}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          style={[ROW_STYLES(colors).amount, isIncome && { color: rowAccent }]}>
          {amount}
        </Text>
        <View
          style={[
            ROW_STYLES(colors).statusChip,
            {
              backgroundColor: alpha(rowAccent, isLight ? 0.12 : 0.18),
            },
          ]}>
          <Text
            style={[
              ROW_STYLES(colors).statusText,
              {
                color: rowAccent,
              },
            ]}>
            {statusLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const LIGHT_INCOME_ACCENT = '#0f7a52';

type FilterModalProps = {
  visible: boolean;
  colors: AppColorTheme;
  locale: string;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  isLight: boolean;
  draftFilters: ActivityListFilters;
  setDraftFilters: React.Dispatch<React.SetStateAction<ActivityListFilters>>;
  walletOptions: WalletRecord[];
  filterCategories: string[];
  salaryDay: number;
  filterError: string;
  iosFilterDatePickerVisible: boolean;
  setIosFilterDatePickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  filterDateTarget: 'startDate' | 'endDate' | null;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  onOpenFilterDatePicker: (target: 'startDate' | 'endDate') => void;
  onFilterDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  selectedMonthParts: { year: number; monthIndex: number };
  monthOptionLabels: string[];
  yearOptions: number[];
};

function FilterModal({
  visible,
  colors,
  locale,
  t,
  styles,
  isLight,
  draftFilters,
  setDraftFilters,
  walletOptions,
  filterCategories,
  salaryDay,
  filterError,
  iosFilterDatePickerVisible,
  setIosFilterDatePickerVisible,
  filterDateTarget,
  onClose,
  onApply,
  onReset,
  onOpenFilterDatePicker,
  onFilterDateChange,
  selectedMonthParts,
  monthOptionLabels,
  yearOptions,
}: FilterModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.modalKeyboard}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={[styles.modalKicker, { color: colors.primary }]}>
                      {t('activity.transactions.filterKicker')}
                    </Text>
                    <Text style={styles.modalTitle}>{t('activity.transactions.filterTitle')}</Text>
                    <Text style={styles.modalSubtitle}>{t('activity.transactions.filterHelper')}</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.formContent}>
                  <View style={styles.modalSectionCard}>
                    <View style={styles.modalSectionHeader}>
                      <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.modalSectionCopy}>
                        <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterDateTitle')}</Text>
                        <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.filterDateHelper')}</Text>
                      </View>
                    </View>

                    <View style={styles.typeSegment}>
                      {(['month', 'range', 'cycle'] as ActivityDateFilterMode[]).map((mode) => {
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
                              styles.typePill,
                              active && {
                                backgroundColor: alpha(colors.primary, isLight ? 0.12 : 0.18),
                                borderColor: alpha(colors.primary, isLight ? 0.3 : 0.36),
                              },
                            ]}>
                            <View
                              style={[
                                styles.typePillIcon,
                                { backgroundColor: active ? alpha(colors.primary, 0.16) : colors.shellCardMuted },
                              ]}>
                              <MaterialCommunityIcons
                                name={
                                  mode === 'month'
                                    ? 'calendar-month-outline'
                                    : mode === 'cycle'
                                      ? 'calendar-sync-outline'
                                      : 'calendar-range-outline'
                                }
                                size={16}
                                color={active ? colors.primary : colors.shellTextMuted}
                              />
                            </View>
                            <Text style={[styles.typePillText, active && { color: colors.primary }]}>
                              {mode === 'month'
                                ? t('activity.transactions.filterMonthMode')
                                : mode === 'cycle'
                                  ? t('activity.transactions.filterCycleMode')
                                  : t('activity.transactions.filterRangeMode')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {draftFilters.dateMode === 'cycle' ? (
                      <View style={styles.cycleInfoCard}>
                        <View style={[styles.typePillIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cycleInfoText}>
                            {t('activity.transactions.filterCycleDescription', { day: salaryDay })}
                          </Text>
                          <Text style={styles.cycleInfoMeta}>
                            {t('activity.transactions.filterCyclePeriod', {
                              start: toDateInputLabel(computeSalaryCycleDates(salaryDay).startDate, locale),
                              end: toDateInputLabel(computeSalaryCycleDates(salaryDay).endDate, locale),
                            })}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            onClose();
                            router.push('/notification-settings');
                          }}
                          style={styles.cycleEditButton}>
                          <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
                        </Pressable>
                      </View>
                    ) : draftFilters.dateMode === 'month' ? (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('activity.transactions.filterMonthLabel')}</Text>
                        <View style={styles.monthSummaryCard}>
                          <View style={styles.monthSummaryIcon}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.monthSummaryCopy}>
                            <Text style={styles.monthSummaryTitle}>
                              {toMonthInputLabel(draftFilters.month, locale)}
                            </Text>
                            <Text style={styles.monthSummaryMeta}>
                              {t('activity.transactions.filterMonthHelper')}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.fieldLabel}>{t('activity.transactions.filterPickMonth')}</Text>
                        <View style={styles.monthGrid}>
                          {monthOptionLabels.map((label, monthIndex) => {
                            const active = selectedMonthParts.monthIndex === monthIndex;
                            return (
                              <Pressable
                                key={label}
                                onPress={() =>
                                  setDraftFilters((current) => ({
                                    ...current,
                                    month: toMonthValue(selectedMonthParts.year, monthIndex),
                                  }))
                                }
                                style={[styles.filterChip, active && styles.filterChipActive, styles.monthChip]}>
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={styles.fieldLabel}>{t('activity.transactions.filterPickYear')}</Text>
                        <View style={styles.filterChipWrap}>
                          {yearOptions.map((year) => {
                            const active = selectedMonthParts.year === year;
                            return (
                              <Pressable
                                key={year}
                                onPress={() =>
                                  setDraftFilters((current) => ({
                                    ...current,
                                    month: toMonthValue(year, selectedMonthParts.monthIndex),
                                  }))
                                }
                                style={[styles.filterChip, active && styles.filterChipActive]}>
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                  {year}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.filterStartDate')}</Text>
                          <Pressable
                            onPress={() => onOpenFilterDatePicker('startDate')}
                            style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} />
                            </View>
                            <Text style={styles.inputDisplayText}>
                              {draftFilters.startDate
                                ? toDateInputLabel(draftFilters.startDate, locale)
                                : t('activity.transactions.filterChooseDate')}
                            </Text>
                          </Pressable>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.filterEndDate')}</Text>
                          <Pressable
                            onPress={() => onOpenFilterDatePicker('endDate')}
                            style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} />
                            </View>
                            <Text style={styles.inputDisplayText}>
                              {draftFilters.endDate
                                ? toDateInputLabel(draftFilters.endDate, locale)
                                : t('activity.transactions.filterChooseDate')}
                            </Text>
                          </Pressable>
                        </View>

                        {Platform.OS === 'ios' && iosFilterDatePickerVisible && filterDateTarget ? (
                          <View style={styles.iosDatePickerOverlay}>
                            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIosFilterDatePickerVisible(false)} />
                            <View style={styles.iosDatePickerSheet}>
                              <DateTimePicker
                                value={toPickerDate(draftFilters[filterDateTarget] || getTodayInputValue())}
                                mode="date"
                                display="spinner"
                                onChange={onFilterDateChange}
                                accentColor={colors.primary}
                                themeVariant={isLight ? 'light' : 'dark'}
                              />
                              <Pressable onPress={() => setIosFilterDatePickerVisible(false)} style={styles.iosDatePickerDone}>
                                <Text style={styles.iosDatePickerDoneText}>{t('common.cancel')}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>

                  <View style={styles.modalSectionCard}>
                    <View style={styles.modalSectionHeader}>
                      <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.modalSectionCopy}>
                        <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterWalletTitle')}</Text>
                        <Text style={styles.modalSectionSubtitle}>
                          {t('activity.transactions.filterWalletHelper')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.filterChipWrap}>
                      <Pressable
                        onPress={() => setDraftFilters((current) => ({ ...current, walletId: null }))}
                        style={[styles.filterChip, !draftFilters.walletId && styles.filterChipActive]}>
                        <Text style={[styles.filterChipText, !draftFilters.walletId && styles.filterChipTextActive]}>
                          {t('activity.transactions.all')}
                        </Text>
                      </Pressable>

                      {walletOptions.map((wallet) => {
                        const active = draftFilters.walletId === wallet.id;
                        const balance = Number(wallet.balance ?? 0);
                        return (
                          <Pressable
                            key={wallet.id}
                            onPress={() => setDraftFilters((current) => ({ ...current, walletId: wallet.id }))}
                            style={[styles.filterChip, active && styles.filterChipActive]}>
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                              {wallet.name}
                            </Text>
                            <Text style={[styles.filterChipBalance, active && styles.filterChipBalanceActive]}>
                              {toCurrency(balance, locale)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.modalSectionCard}>
                    <View style={styles.modalSectionHeader}>
                      <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.modalSectionCopy}>
                        <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterTypeTitle')}</Text>
                        <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.filterTypeHelper')}</Text>
                      </View>
                    </View>

                    <View style={styles.filterChipWrap}>
                      {(['all', 'income', 'expense'] as ActivityFilterType[]).map((option) => {
                        const active = draftFilters.type === option;
                        const label =
                          option === 'all'
                            ? t('activity.transactions.all')
                            : option === 'income'
                              ? t('activity.transactions.income')
                              : t('activity.transactions.expense');

                        return (
                          <Pressable
                            key={option}
                            onPress={() => setDraftFilters((current) => ({ ...current, type: option }))}
                            style={[styles.filterChip, active && styles.filterChipActive]}>
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.modalSectionCard}>
                    <View style={styles.modalSectionHeader}>
                      <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="shape-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.modalSectionCopy}>
                        <Text style={styles.modalSectionTitle}>{t('activity.transactions.filterCategoryTitle')}</Text>
                        <Text style={styles.modalSectionSubtitle}>
                          {t('activity.transactions.filterCategoryHelper')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.filterChipWrap}>
                      <Pressable
                        onPress={() => setDraftFilters((current) => ({ ...current, category: '' }))}
                        style={[styles.filterChip, !draftFilters.category && styles.filterChipActive]}>
                        <Text style={[styles.filterChipText, !draftFilters.category && styles.filterChipTextActive]}>
                          {t('activity.transactions.all')}
                        </Text>
                      </Pressable>

                      {filterCategories.map((category) => {
                        const active = draftFilters.category === category;
                        const visual = getCategoryVisual(category);
                        return (
                          <Pressable
                            key={category}
                            onPress={() => setDraftFilters((current) => ({ ...current, category }))}
                            style={[styles.filterChip, active && styles.filterChipActive]}>
                            <MaterialCommunityIcons
                              name={visual.icon as any}
                              size={12}
                              color={active ? colors.primary : colors.shellTextMuted}
                            />
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                              {category}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {!!filterError ? (
                    <View style={styles.formErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.formErrorText}>{filterError}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <View style={styles.modalActionsRow}>
                    <Pressable onPress={onReset} style={styles.secondaryActionButton}>
                      <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.filterReset')}</Text>
                    </Pressable>
                    <Pressable onPress={onApply} style={styles.submitButton}>
                      <Text style={styles.submitButtonText}>{t('activity.transactions.filterApply')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type TransactionFormModalProps = {
  visible: boolean;
  colors: AppColorTheme;
  locale: string;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  isLight: boolean;
  modalAccent: string;
  modalAccentSoft: string;
  modalAccentBorder: string;
  form: TransactionFormState;
  setForm: React.Dispatch<React.SetStateAction<TransactionFormState>>;
  detailLoading: boolean;
  isIncomeForm: boolean;
  modalKicker: string;
  modalToneCopy: string;
  amountPreview: string;
  hasAmountPreview: boolean;
  availableCategories: CategoryRecord[];
  categories: CategoryRecord[];
  transactionWalletOptions: WalletRecord[];
  mainWallet: WalletRecord | undefined;
  mainWalletBalance: number;
  selectedWalletLabel: string;
  formError: string;
  submitting: boolean;
  deleting: boolean;
  keyboardOpen: boolean;
  modalLift: number;
  onClose: () => void;
  onSave: () => void;
  onOpenEditDeleteConfirm: () => void;
  onOpenDatePicker: () => void;
  iosDatePickerVisible: boolean;
  dateInputLabel: string;
  onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onSetIosDatePickerVisible: (v: boolean) => void;
};

function TransactionFormModal({
  visible,
  colors,
  locale,
  t,
  styles,
  isLight,
  modalAccent,
  modalAccentSoft,
  modalAccentBorder,
  form,
  setForm,
  detailLoading,
  isIncomeForm,
  modalKicker,
  modalToneCopy,
  amountPreview,
  hasAmountPreview,
  availableCategories,
  categories,
  transactionWalletOptions,
  mainWallet,
  mainWalletBalance,
  selectedWalletLabel,
  formError,
  submitting,
  deleting,
  keyboardOpen,
  modalLift,
  onClose,
  onSave,
  onOpenEditDeleteConfirm,
  onOpenDatePicker,
  iosDatePickerVisible,
  dateInputLabel,
  onDateChange,
  onSetIosDatePickerVisible,
}: TransactionFormModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.modalKeyboard, keyboardOpen && { paddingBottom: modalLift }]}>
            <View style={[styles.modalSheet, keyboardOpen && styles.modalSheetKeyboard]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={[styles.modalKicker, { color: modalAccent }]}>{modalKicker}</Text>
                    <Text style={styles.modalTitle}>
                      {form.id ? t('activity.transactions.editTitle') : t('activity.transactions.createTitle')}
                    </Text>
                    <Text style={styles.modalSubtitle}>{t('activity.transactions.modalHint')}</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                {detailLoading ? (
                  <View style={styles.modalLoadingState}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.stateText}>{t('activity.transactions.detailLoading')}</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView
                      style={styles.modalScroll}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.formContent}>
                      <View
                        style={[
                          styles.modalHeroCard,
                          {
                            backgroundColor: modalAccentSoft,
                            borderColor: modalAccentBorder,
                          },
                        ]}>
                        <View style={styles.modalHeroMain}>
                          <View
                            style={[
                              styles.modalHeroIcon,
                              { backgroundColor: alpha(modalAccent, isLight ? 0.14 : 0.18) },
                            ]}>
                            <MaterialCommunityIcons
                              name={isIncomeForm ? 'trending-up' : 'trending-down'}
                              size={22}
                              color={modalAccent}
                            />
                          </View>
                          <View style={styles.modalHeroCopy}>
                            <Text style={styles.modalHeroTitle}>
                              {isIncomeForm ? t('activity.transactions.income') : t('activity.transactions.expense')}
                            </Text>
                            <Text style={styles.modalHeroText}>{modalToneCopy}</Text>
                          </View>
                        </View>

                        <View style={styles.modalHeroMetrics}>
                          <View style={styles.modalMetric}>
                            <Text style={styles.modalMetricLabel}>{t('activity.transactions.modalAmountPreview')}</Text>
                            <Text
                              numberOfLines={1}
                              style={[styles.modalMetricValue, !hasAmountPreview && styles.modalMetricValueMuted]}>
                              {amountPreview}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.modalMetricBadge,
                              {
                                borderColor: modalAccentBorder,
                                backgroundColor: alpha(colors.surfaceContainerLowest, isLight ? 0.8 : 0.14),
                              },
                            ]}>
                            <MaterialCommunityIcons name="shape-outline" size={14} color={modalAccent} />
                            <Text style={[styles.modalMetricBadgeText, { color: modalAccent }]}>
                              {t('activity.transactions.modalCategoryCount', { count: availableCategories.length })}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="wallet-outline" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.walletTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.walletHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.filterChipWrap}>
                          {!isIncomeForm ? (
                            <Pressable
                              onPress={() => setForm((current) => ({ ...current, walletId: null }))}
                              style={[styles.filterChip, !form.walletId && styles.filterChipActive]}>
                              <Text style={[styles.filterChipText, !form.walletId && styles.filterChipTextActive]}>
                                {t('activity.transactions.walletDefault')}
                              </Text>
                              <Text style={[styles.filterChipBalance, !form.walletId && styles.filterChipBalanceActive]}>
                                {toCurrency(mainWalletBalance, locale)}
                              </Text>
                            </Pressable>
                          ) : null}

                          {transactionWalletOptions.map((wallet) => {
                            const active = form.walletId === wallet.id;
                            const balance = Number(wallet.balance ?? 0);
                            return (
                              <Pressable
                                key={wallet.id}
                                onPress={() => setForm((current) => ({ ...current, walletId: wallet.id }))}
                                style={[styles.filterChip, active && styles.filterChipActive]}>
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                  {wallet.name}
                                </Text>
                                <Text style={[styles.filterChipBalance, active && styles.filterChipBalanceActive]}>
                                  {toCurrency(balance, locale)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={styles.monthSummaryMeta}>{selectedWalletLabel}</Text>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="swap-horizontal" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalTypeTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalTypeHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.typeSegment}>
                          {(['expense', 'income'] as TransactionType[]).map((type) => {
                            const active = type === form.type;
                            const typeColor = type === 'income' ? colors.secondary : colors.primary;
                            return (
                              <Pressable
                                key={type}
                                onPress={() =>
                                  setForm((current) => ({
                                    ...current,
                                    type,
                                    walletId: type === 'income' ? current.walletId ?? mainWallet?.id ?? null : current.walletId,
                                    category:
                                      current.type === type
                                        ? current.category
                                        : categories.some((item) => item.type === type && item.name === current.category)
                                          ? current.category
                                          : '',
                                  }))
                                }
                                style={[
                                  styles.typePill,
                                  active && {
                                    backgroundColor: alpha(typeColor, isLight ? 0.12 : 0.18),
                                    borderColor: alpha(typeColor, isLight ? 0.3 : 0.36),
                                  },
                                ]}>
                                <View
                                  style={[
                                    styles.typePillIcon,
                                    { backgroundColor: active ? alpha(typeColor, 0.16) : colors.shellCardMuted },
                                  ]}>
                                  <MaterialCommunityIcons
                                    name={type === 'income' ? 'trending-up' : 'trending-down'}
                                    size={16}
                                    color={active ? typeColor : colors.shellTextMuted}
                                  />
                                </View>
                                <Text
                                  style={[
                                    styles.typePillText,
                                    active && {
                                      color: typeColor,
                                    },
                                  ]}>
                                  {type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="shape-outline" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalCategoryTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>
                              {t('activity.transactions.modalCategoryHelper')}
                            </Text>
                          </View>
                        </View>

                        {availableCategories.length > 0 ? (
                          <View style={styles.categoryWrap}>
                            {availableCategories.map((category) => {
                              const active = form.category === category.name;
                              const visual = getCategoryVisual(category.name);
                              const chipBg = active ? alpha(visual.color, 0.14) : colors.shellCard;
                              const chipBorder = active ? alpha(visual.color, 0.32) : colors.shellBorder;
                              const textColor = active ? visual.color : colors.shellTextSecondary;
                              return (
                                <Pressable
                                  key={category.id}
                                  onPress={() => setForm((current) => ({ ...current, category: category.name }))}
                                  style={[styles.categoryChip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                                  <MaterialCommunityIcons
                                    name={visual.icon as any}
                                    size={14}
                                    color={textColor}
                                  />
                                  <Text style={[styles.categoryChipText, { color: textColor }]}>
                                    {category.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : (
                          <View style={styles.emptyCategoryBox}>
                            <Text style={styles.emptyCategoryText}>{t('activity.transactions.categoryFromSettings')}</Text>
                            <Pressable onPress={() => router.push('/categories')} style={styles.emptyCategoryButton}>
                              <Text style={styles.emptyCategoryButtonText}>{t('activity.transactions.openCategories')}</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="receipt-text-outline" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalDetailsTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalDetailsHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.amount')}</Text>
                          <View style={styles.inputShell}>
                            <TextInput
                              value={form.amount}
                              onChangeText={(value) =>
                                setForm((current) => ({ ...current, amount: formatCurrencyInput(value) }))
                              }
                              placeholder="1.500.000"
                              placeholderTextColor={colors.inputPlaceholder}
                              keyboardType="number-pad"
                              style={styles.inputControl}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.quickAmount')}</Text>
                          <View style={styles.filterChipWrap}>
                            {[
                              { label: '50K', value: '50000' },
                              { label: '100K', value: '100000' },
                              { label: '200K', value: '200000' },
                              { label: '500K', value: '500000' },
                              { label: '1M', value: '1000000' },
                              { label: '2M', value: '2000000' },
                            ].map((preset) => (
                              <Pressable
                                key={preset.value}
                                onPress={() => setForm((current) => ({ ...current, amount: formatCurrencyInput(preset.value) }))}
                                style={({ pressed }) => [
                                  styles.filterChip,
                                  form.amount === formatCurrencyInput(preset.value) && styles.filterChipActive,
                                  pressed && styles.actionButtonPressed,
                                ]}>
                                <Text
                                  style={[
                                    styles.filterChipText,
                                    form.amount === formatCurrencyInput(preset.value) && styles.filterChipTextActive,
                                  ]}>
                                  {preset.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>{t('activity.transactions.date')}</Text>
                          <Pressable
                            onPress={onOpenDatePicker}
                            style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="calendar-month-outline" size={18} color={modalAccent} />
                            </View>
                            <Text style={styles.inputDisplayText}>{dateInputLabel}</Text>
                          </Pressable>
                          {Platform.OS === 'ios' && iosDatePickerVisible ? (
                            <View style={styles.iosDatePickerOverlay}>
                              <Pressable style={StyleSheet.absoluteFill} onPress={() => onSetIosDatePickerVisible(false)} />
                              <View style={styles.iosDatePickerSheet}>
                                <DateTimePicker
                                  value={toPickerDate(form.date)}
                                  mode="date"
                                  display="spinner"
                                  onChange={onDateChange}
                                  accentColor={modalAccent}
                                  themeVariant={isLight ? 'light' : 'dark'}
                                />
                                <Pressable onPress={() => onSetIosDatePickerVisible(false)} style={styles.iosDatePickerDone}>
                                  <Text style={styles.iosDatePickerDoneText}>{t('common.cancel')}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : null}

                          <View style={styles.filterChipWrap}>
                            {[
                              { label: t('activity.transactions.dateQuickToday'), value: toDayDateQuickValues().today },
                              { label: t('activity.transactions.dateQuickYesterday'), value: toDayDateQuickValues().yesterday },
                              { label: t('activity.transactions.dateQuickThisWeek'), value: toDayDateQuickValues().thisWeek },
                              { label: t('activity.transactions.dateQuickStartMonth'), value: toDayDateQuickValues().startOfMonth },
                            ].map((preset) => {
                              const active = form.date === preset.value;
                              return (
                                <Pressable
                                  key={preset.value}
                                  onPress={() => setForm((current) => ({ ...current, date: preset.value }))}
                                  style={({ pressed }) => [
                                    styles.filterChip,
                                    active && styles.filterChipActive,
                                    pressed && styles.actionButtonPressed,
                                  ]}>
                                  <MaterialCommunityIcons
                                    name="calendar-check-outline"
                                    size={12}
                                    color={active ? colors.primary : colors.shellTextMuted}
                                  />
                                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {preset.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="text-box-outline" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('activity.transactions.modalNotesTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('activity.transactions.modalNotesHelper')}</Text>
                          </View>
                        </View>

                        <View style={[styles.inputShell, styles.textareaShell]}>
                          <View style={styles.inputIconWrap}>
                            <MaterialCommunityIcons name="pencil-outline" size={18} color={modalAccent} />
                          </View>
                          <TextInput
                            value={form.description}
                            onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
                            placeholder={t('activity.transactions.descriptionPlaceholder')}
                            placeholderTextColor={colors.inputPlaceholder}
                            multiline
                            textAlignVertical="top"
                            scrollEnabled={false}
                            style={[styles.inputControl, styles.textareaInput]}
                          />
                        </View>
                      </View>

                      {!!formError && (
                        <View style={styles.formErrorCard}>
                          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                          <Text style={styles.formErrorText}>{formError}</Text>
                        </View>
                      )}
                    </ScrollView>

                    <View style={styles.modalFooter}>
                      <View style={styles.modalActionsRow}>
                        {form.id ? (
                          <Pressable
                            onPress={onOpenEditDeleteConfirm}
                            disabled={submitting || deleting}
                            style={({ pressed }) => [
                              styles.deleteButton,
                              pressed && !(submitting || deleting) && styles.actionButtonPressed,
                              (submitting || deleting) && styles.actionButtonDisabled,
                            ]}>
                            {deleting ? (
                              <ActivityIndicator color={colors.danger} />
                            ) : (
                              <>
                                <Text style={styles.deleteButtonText}>{t('activity.transactions.delete')}</Text>
                              </>
                            )}
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={onClose}
                            disabled={submitting || deleting}
                            style={({ pressed }) => [
                              styles.secondaryActionButton,
                              pressed && !(submitting || deleting) && styles.actionButtonPressed,
                            ]}>
                            <Text style={styles.secondaryActionButtonText}>{t('common.cancel')}</Text>
                          </Pressable>
                        )}

                        <Pressable
                          onPress={onSave}
                          disabled={submitting || deleting}
                          style={({ pressed }) => [
                            styles.submitButton,
                            pressed && !(submitting || deleting) && styles.actionButtonPressed,
                            (submitting || deleting) && styles.actionButtonDisabled,
                          ]}>
                          {submitting ? (
                            <ActivityIndicator color={colors.onPrimary} />
                          ) : (
                            <Text style={styles.submitButtonText}>
                              {form.id ? t('activity.transactions.update') : t('activity.transactions.create')}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type DetailViewModalProps = {
  visible: boolean;
  colors: AppColorTheme;
  locale: string;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  isLight: boolean;
  selectedDetailRecord: TransactionRecord | null;
  walletMap: Map<number, WalletRecord>;
  deleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSetDeleteConfirmVisible: (v: boolean) => void;
};

function DetailViewModal({
  visible,
  colors,
  locale,
  t,
  styles,
  isLight,
  selectedDetailRecord,
  walletMap,
  deleting,
  onClose,
  onEdit,
  onSetDeleteConfirmVisible,
}: DetailViewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.modalKeyboard}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={[styles.modalKicker, { color: selectedDetailRecord?.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary }]}>
                      {t('activity.transactions.detailKicker')}
                    </Text>
                    <Text style={styles.modalTitle}>{t('activity.transactions.detailTitle')}</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                {selectedDetailRecord ? (
                  <>
                    <View
                      style={[
                        styles.modalHeroCard,
                        {
                          backgroundColor: selectedDetailRecord.type === 'income'
                            ? alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.1 : 0.18)
                            : alpha(colors.primary, isLight ? 0.1 : 0.18),
                          borderColor: selectedDetailRecord.type === 'income'
                            ? alpha(isLight ? LIGHT_INCOME_ACCENT : colors.secondary, isLight ? 0.16 : 0.28)
                            : alpha(colors.primary, isLight ? 0.16 : 0.28),
                        },
                      ]}>
                      <View style={styles.modalHeroMain}>
                        <View
                          style={[
                            styles.modalHeroIcon,
                            {
                              backgroundColor: alpha(
                                selectedDetailRecord.type === 'income'
                                  ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary)
                                  : colors.primary,
                                isLight ? 0.14 : 0.18
                              ),
                            },
                          ]}>
                          <MaterialCommunityIcons
                            name={selectedDetailRecord.type === 'income' ? 'trending-up' : 'trending-down'}
                            size={22}
                            color={selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary}
                          />
                        </View>
                        <View style={styles.modalHeroCopy}>
                          <Text style={styles.modalHeroTitle}>
                            {selectedDetailRecord.type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                          </Text>
                          <Text style={styles.modalHeroText}>{selectedDetailRecord.category}</Text>
                        </View>
                      </View>
                      <View style={styles.modalHeroMetrics}>
                        <View style={styles.modalMetric}>
                          <Text style={styles.modalMetricLabel}>{t('activity.transactions.detailAmount')}</Text>
                          <Text numberOfLines={1} style={styles.modalMetricValue}>
                            {toSignedCurrency(selectedDetailRecord.type === 'income' ? selectedDetailRecord.amount : -selectedDetailRecord.amount, locale)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.modalSectionCard}>
                      <View style={styles.modalSectionHeader}>
                        <View style={[styles.modalSectionIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                          <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.modalSectionCopy}>
                          <Text style={styles.modalSectionTitle}>{t('activity.transactions.detailTitle')}</Text>
                        </View>
                      </View>

                      <View style={{ gap: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailType')}</Text>
                          <View style={[ROW_STYLES(colors).statusChip, { backgroundColor: alpha(selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary, isLight ? 0.12 : 0.18) }]}>
                            <Text style={[ROW_STYLES(colors).statusText, { color: selectedDetailRecord.type === 'income' ? (isLight ? LIGHT_INCOME_ACCENT : colors.secondary) : colors.primary }]}>
                              {selectedDetailRecord.type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                            </Text>
                          </View>
                        </View>

                        <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailCategory')}</Text>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>{selectedDetailRecord.category}</Text>
                        </View>

                        <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailWallet')}</Text>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>
                            {walletMap.get(selectedDetailRecord.wallet_id ?? 0)?.name ?? t('activity.transactions.detailDefaultWallet')}
                          </Text>
                        </View>

                        <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailDate')}</Text>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary }]}>{toDateInputLabel(selectedDetailRecord.date, locale)}</Text>
                        </View>

                        {selectedDetailRecord.description?.trim() ? (
                          <>
                            <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />
                            <View style={{ gap: 6 }}>
                              <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailNotes')}</Text>
                              <Text style={[styles.fieldLabel, { color: colors.shellTextPrimary, fontWeight: '500' }]}>{selectedDetailRecord.description}</Text>
                            </View>
                          </>
                        ) : null}

                        <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailCreated')}</Text>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextSecondary, fontSize: 12 }]}>
                            {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(selectedDetailRecord.created_at))}
                          </Text>
                        </View>

                        <View style={{ height: 1, backgroundColor: alpha(colors.surfaceContainerHighest, 0.2) }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextMuted }]}>{t('activity.transactions.detailUpdated')}</Text>
                          <Text style={[styles.fieldLabel, { color: colors.shellTextSecondary, fontSize: 12 }]}>
                            {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(selectedDetailRecord.updated_at))}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}

                <View style={styles.modalFooter}>
                  <View style={styles.modalActionsRow}>
                    <Pressable
                      onPress={() => onSetDeleteConfirmVisible(true)}
                      disabled={deleting}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && !deleting && styles.actionButtonPressed,
                        deleting && styles.actionButtonDisabled,
                      ]}>
                      {deleting ? (
                        <ActivityIndicator color={colors.danger} />
                      ) : (
                        <Text style={styles.deleteButtonText}>{t('activity.transactions.detailDelete')}</Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={onEdit}
                      disabled={deleting}
                      style={({ pressed }) => [
                        styles.submitButton,
                        pressed && !deleting && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.submitButtonText}>{t('activity.transactions.detailEdit')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type DeleteConfirmModalProps = {
  visible: boolean;
  colors: AppColorTheme;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  onClose: () => void;
  onConfirm: () => void;
};

function DeleteConfirmModal({
  visible,
  colors,
  t,
  styles,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.modalKeyboard, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
            <View style={[styles.modalSheet, { maxHeight: 'auto', width: '100%', paddingBottom: 0 }]}>
              <View style={[styles.modalBody, { gap: 16, paddingTop: 24 }]}>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <View style={[styles.modalHeroIcon, { backgroundColor: alpha(colors.danger, 0.12), width: 56, height: 56, borderRadius: 20 }]}>
                    <MaterialCommunityIcons name="trash-can-outline" size={26} color={colors.danger} />
                  </View>
                  <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 18 }]}>{t('activity.transactions.detailDeleteConfirmTitle')}</Text>
                  <Text style={[styles.modalSubtitle, { textAlign: 'center' }]}>{t('activity.transactions.detailDeleteConfirmBody')}</Text>
                </View>

                <View style={styles.modalActionsRow}>
                  <Pressable
                    onPress={onClose}
                    style={styles.secondaryActionButton}>
                    <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.detailDeleteConfirmNo')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={onConfirm}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      { flex: 1 },
                      pressed && styles.actionButtonPressed,
                    ]}>
                    <Text style={styles.deleteButtonText}>{t('activity.transactions.detailDeleteConfirmYes')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type EditDeleteConfirmModalProps = {
  visible: boolean;
  colors: AppColorTheme;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  onClose: () => void;
  onConfirm: () => void;
};

function EditDeleteConfirmModal({
  visible,
  colors,
  t,
  styles,
  onClose,
  onConfirm,
}: EditDeleteConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.modalKeyboard, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
            <View style={[styles.modalSheet, { maxHeight: 'auto', width: '100%', paddingBottom: 0 }]}>
              <View style={[styles.modalBody, { gap: 16, paddingTop: 24 }]}>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <View style={[styles.modalHeroIcon, { backgroundColor: alpha(colors.danger, 0.12), width: 56, height: 56, borderRadius: 20 }]}>
                    <MaterialCommunityIcons name="trash-can-outline" size={26} color={colors.danger} />
                  </View>
                  <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 18 }]}>{t('activity.transactions.deleteConfirmTitle')}</Text>
                  <Text style={[styles.modalSubtitle, { textAlign: 'center' }]}>{t('activity.transactions.deleteConfirmBody')}</Text>
                </View>

                <View style={styles.modalActionsRow}>
                  <Pressable
                    onPress={onClose}
                    style={styles.secondaryActionButton}>
                    <Text style={styles.secondaryActionButtonText}>{t('activity.transactions.deleteConfirmNo')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={onConfirm}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      { flex: 1 },
                      pressed && styles.actionButtonPressed,
                    ]}>
                    <Text style={styles.deleteButtonText}>{t('activity.transactions.deleteConfirmYes')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type ActivityModalsProps = {
  filterModalVisible: boolean;
  transactionModalVisible: boolean;
  detailViewVisible: boolean;
  deleteConfirmVisible: boolean;
  editDeleteConfirmVisible: boolean;
  colors: AppColorTheme;
  locale: string;
  t: TranslateFn;
  styles: ReturnType<typeof import('./activity-styles').createStyles>;
  isLight: boolean;
  draftFilters: ActivityListFilters;
  setDraftFilters: React.Dispatch<React.SetStateAction<ActivityListFilters>>;
  walletOptions: WalletRecord[];
  filterCategories: string[];
  salaryDay: number;
  filterError: string;
  iosFilterDatePickerVisible: boolean;
  setIosFilterDatePickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  filterDateTarget: 'startDate' | 'endDate' | null;
  selectedMonthParts: { year: number; monthIndex: number };
  monthOptionLabels: string[];
  yearOptions: number[];
  modalAccent: string;
  modalAccentSoft: string;
  modalAccentBorder: string;
  form: TransactionFormState;
  setForm: React.Dispatch<React.SetStateAction<TransactionFormState>>;
  detailLoading: boolean;
  isIncomeForm: boolean;
  modalKicker: string;
  modalToneCopy: string;
  amountPreview: string;
  hasAmountPreview: boolean;
  availableCategories: CategoryRecord[];
  categories: CategoryRecord[];
  transactionWalletOptions: WalletRecord[];
  mainWallet: WalletRecord | undefined;
  mainWalletBalance: number;
  selectedWalletLabel: string;
  formError: string;
  submitting: boolean;
  deleting: boolean;
  keyboardOpen: boolean;
  modalLift: number;
  selectedDetailRecord: TransactionRecord | null;
  walletMap: Map<number, WalletRecord>;
  onCloseFilterModal: () => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onOpenFilterDatePicker: (target: 'startDate' | 'endDate') => void;
  onFilterDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onCloseTransactionModal: () => void;
  onSaveTransaction: () => void;
  onOpenEditDeleteConfirm: () => void;
  onOpenDatePicker: () => void;
  iosDatePickerVisible: boolean;
  dateInputLabel: string;
  onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onSetIosDatePickerVisible: (v: boolean) => void;
  onCloseDetailModal: () => void;
  onEditFromDetail: () => void;
  onSetDeleteConfirmVisible: (v: boolean) => void;
  onCloseDeleteConfirm: () => void;
  onConfirmDelete: () => void;
  onCloseEditDeleteConfirm: () => void;
  onConfirmEditDelete: () => void;
};

function ActivityModals(props: ActivityModalsProps) {
  return (
    <>
      <FilterModal
        visible={props.filterModalVisible}
        colors={props.colors}
        locale={props.locale}
        t={props.t}
        styles={props.styles}
        isLight={props.isLight}
        draftFilters={props.draftFilters}
        setDraftFilters={props.setDraftFilters}
        walletOptions={props.walletOptions}
        filterCategories={props.filterCategories}
        salaryDay={props.salaryDay}
        filterError={props.filterError}
        iosFilterDatePickerVisible={props.iosFilterDatePickerVisible}
        setIosFilterDatePickerVisible={props.setIosFilterDatePickerVisible}
        filterDateTarget={props.filterDateTarget}
        onClose={props.onCloseFilterModal}
        onApply={props.onApplyFilters}
        onReset={props.onResetFilters}
        onOpenFilterDatePicker={props.onOpenFilterDatePicker}
        onFilterDateChange={props.onFilterDateChange}
        selectedMonthParts={props.selectedMonthParts}
        monthOptionLabels={props.monthOptionLabels}
        yearOptions={props.yearOptions}
      />

      <TransactionFormModal
        visible={props.transactionModalVisible}
        colors={props.colors}
        locale={props.locale}
        t={props.t}
        styles={props.styles}
        isLight={props.isLight}
        modalAccent={props.modalAccent}
        modalAccentSoft={props.modalAccentSoft}
        modalAccentBorder={props.modalAccentBorder}
        form={props.form}
        setForm={props.setForm}
        detailLoading={props.detailLoading}
        isIncomeForm={props.isIncomeForm}
        modalKicker={props.modalKicker}
        modalToneCopy={props.modalToneCopy}
        amountPreview={props.amountPreview}
        hasAmountPreview={props.hasAmountPreview}
        availableCategories={props.availableCategories}
        categories={props.categories}
        transactionWalletOptions={props.transactionWalletOptions}
        mainWallet={props.mainWallet}
        mainWalletBalance={props.mainWalletBalance}
        selectedWalletLabel={props.selectedWalletLabel}
        formError={props.formError}
        submitting={props.submitting}
        deleting={props.deleting}
        keyboardOpen={props.keyboardOpen}
        modalLift={props.modalLift}
        onClose={props.onCloseTransactionModal}
        onSave={props.onSaveTransaction}
        onOpenEditDeleteConfirm={props.onOpenEditDeleteConfirm}
        onOpenDatePicker={props.onOpenDatePicker}
        iosDatePickerVisible={props.iosDatePickerVisible}
        dateInputLabel={props.dateInputLabel}
        onDateChange={props.onDateChange}
        onSetIosDatePickerVisible={props.onSetIosDatePickerVisible}
      />

      <DetailViewModal
        visible={props.detailViewVisible}
        colors={props.colors}
        locale={props.locale}
        t={props.t}
        styles={props.styles}
        isLight={props.isLight}
        selectedDetailRecord={props.selectedDetailRecord}
        walletMap={props.walletMap}
        deleting={props.deleting}
        onClose={props.onCloseDetailModal}
        onEdit={props.onEditFromDetail}
        onSetDeleteConfirmVisible={props.onSetDeleteConfirmVisible}
      />

      <DeleteConfirmModal
        visible={props.deleteConfirmVisible}
        colors={props.colors}
        t={props.t}
        styles={props.styles}
        onClose={props.onCloseDeleteConfirm}
        onConfirm={props.onConfirmDelete}
      />

      <EditDeleteConfirmModal
        visible={props.editDeleteConfirmVisible}
        colors={props.colors}
        t={props.t}
        styles={props.styles}
        onClose={props.onCloseEditDeleteConfirm}
        onConfirm={props.onConfirmEditDelete}
      />
    </>
  );
}

export {
  SummaryStat,
  TransactionDaySummary,
  TransactionRow,
  FilterModal,
  TransactionFormModal,
  DetailViewModal,
  DeleteConfirmModal,
  EditDeleteConfirmModal,
  ActivityModals,
};
