import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ActivitySkeleton } from '@/components/ui/skeleton';
import { type AppColorTheme } from '@/constants/theme';
import { type CategoryRecord } from '@/lib/api/categories';
import { type TransactionRecord } from '@/lib/api/transactions';
import { type WalletRecord } from '@/lib/api/wallets';

import { type createStyles } from './activity-styles';
import {
  type ActivityListFilters,
  type PaginationState,
  type TransactionFormState,
  type TransactionSection,
  toCurrency,
  toDateInputLabel,
  toMonthInputLabel,
} from './activity-utils';
import {
  ActivityModals,
  SummaryStat,
  TransactionDaySummary,
  TransactionRow,
} from './activity-modals';

type TranslateFn = (k: string, params?: Record<string, string | number>) => string;

type ActivityViewProps = {
  colors: AppColorTheme;
  locale: string;
  t: TranslateFn;
  styles: ReturnType<typeof createStyles>;
  isLight: boolean;
  language: string;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string;
  searchActive: boolean;
  searchFocused: boolean;
  searchQuery: string;
  searchInputKey: number;
  activeFilterCount: number;
  activeFilterChips: string[];
  transactionBalance: number;
  debtRepayment: number;
  savingsRate: number;
  pagination: PaginationState;
  streamProgress: number;
  incomeShare: number;
  groupedTransactions: TransactionSection[];
  visibleTransactions: TransactionRecord[];
  filters: ActivityListFilters;
  scrollViewRef: React.RefObject<ScrollView | null>;
  searchInputRef: React.RefObject<TextInput | null>;
  filterModalVisible: boolean;
  transactionModalVisible: boolean;
  detailViewVisible: boolean;
  deleteConfirmVisible: boolean;
  editDeleteConfirmVisible: boolean;
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
  onRefresh: () => void;
  onSearchChange: (q: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onSearchTouch: () => void;
  onClearSearch: () => void;
  onOpenFilterModal: () => void;
  onLoadMore: () => void;
  onOpenCreateModal: () => void;
  onPressItem: (record: TransactionRecord) => void;
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

function ActivityView(props: ActivityViewProps) {
  const { colors, locale, t, styles, isLight, language } = props;

  return (
    <>
      <ScrollView
        ref={props.scrollViewRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, props.searchActive && styles.collapsedSection]}>
          {!props.searchActive ? (
            <>
              <Text style={styles.kicker}>{t('activity.transactions.overview')}</Text>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{t('activity.transactions.titleShort')}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.toolbarRow}>
          <View style={[styles.searchShell, props.searchFocused && styles.searchShellFocused]}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.shellTextMuted} />
            <TextInput
              ref={props.searchInputRef}
              key={props.searchInputKey}
              value={props.searchQuery}
              onChangeText={props.onSearchChange}
              placeholder={t('activity.transactions.searchPlaceholder')}
              placeholderTextColor={colors.shellTextMuted}
              style={styles.searchInput}
              onFocus={props.onSearchFocus}
              onBlur={props.onSearchBlur}
              onTouchStart={props.onSearchTouch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {props.searchActive ? (
              <Pressable onPress={props.onClearSearch} style={styles.searchClearButton} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={16} color={colors.shellTextMuted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable onPress={props.onOpenFilterModal} style={styles.filterCardButton}>
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
            {props.activeFilterCount > 0 ? (
              <View style={styles.filterLauncherBadge}>
                <Text style={styles.filterLauncherBadgeText}>{props.activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {props.loading ? (
          <ActivitySkeleton colors={colors} />
        ) : (
          <>
            {!props.searchActive ? <View style={styles.filterSummaryCard}>
              <View style={styles.filterSummaryHeader}>
                <View style={styles.filterSummaryCopy}>
                  <Text style={styles.filterSummaryKicker}>{t('activity.transactions.filterKicker')}</Text>
                  <Text numberOfLines={1} style={styles.filterSummaryTitle}>
                    {props.filters.dateMode === 'month'
                      ? toMonthInputLabel(props.filters.month, locale)
                      : props.filters.dateMode === 'cycle'
                        ? t('activity.transactions.filterCycleMode')
                        : `${toDateInputLabel(props.filters.startDate, locale)} - ${toDateInputLabel(props.filters.endDate, locale)}`}
                  </Text>
                  <Text style={styles.filterSummaryText}>
                    {props.filters.dateMode === 'month'
                      ? t('activity.transactions.filterMonthMode')
                      : props.filters.dateMode === 'cycle'
                        ? t('activity.transactions.filterCycleMode')
                        : t('activity.transactions.filterRangeMode')}
                  </Text>
                </View>
                <Pressable onPress={props.onOpenFilterModal} style={styles.filterSummaryAction}>
                  <MaterialCommunityIcons name="tune-variant" size={16} color={colors.onPrimary} />
                  <Text style={styles.filterSummaryActionText}>{t('activity.transactions.filterAction')}</Text>
                </Pressable>
              </View>

              <View style={styles.filterChipWrap}>
                {props.activeFilterChips.map((label, idx) => (
                  <View key={label} style={styles.filterChip}>
                    <MaterialCommunityIcons
                      name={idx === 0 ? (props.filters.dateMode === 'month' ? 'calendar-month-outline' : props.filters.dateMode === 'cycle' ? 'calendar-sync-outline' : 'calendar-range-outline') : 'tag-outline'}
                      size={12}
                      color={colors.primary}
                    />
                    <Text style={styles.filterChipText}>{label}</Text>
                  </View>
                ))}
              </View>
            </View> : null}

            {!props.searchActive ? <View style={styles.summaryStack}>
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.balance')}
                value={toCurrency(props.transactionBalance, locale)}
                meta={t('activity.transactions.thisPeriod')}
                metaTone="positive"
                accent="primary"
              />
              {props.debtRepayment > 0 ? (
                <SummaryStat
                  colors={colors}
                  title={language === 'id' ? 'Bayar Utang' : 'Debt Repayment'}
                  value={toCurrency(props.debtRepayment, locale)}
                  meta={language === 'id' ? `${props.savingsRate.toFixed(1)}% tingkat tabungan` : `${props.savingsRate.toFixed(1)}% savings rate`}
                  accent="secondary"
                />
              ) : null}
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.activeStream')}
                value={String(props.pagination.total)}
                meta={t('activity.transactions.recordsTracked', { count: props.pagination.total })}
                accent="secondary"
                showProgress
                progress={props.streamProgress}
              />
              <SummaryStat
                colors={colors}
                title={t('activity.transactions.incomeShare')}
                value={`${props.incomeShare.toFixed(1)}%`}
                meta={t('activity.transactions.ofMovement')}
                accent="teal"
              />
            </View> : null}

            {props.groupedTransactions.length === 0 ? (
              <View style={styles.stateCard}>
                <MaterialCommunityIcons name="text-box-search-outline" size={28} color={colors.outlineVariant} />
                <Text style={styles.emptyTitle}>{t('activity.transactions.emptyTitle')}</Text>
                <Text style={styles.emptyBody}>{t('activity.transactions.emptyBody')}</Text>
              </View>
            ) : (
              props.groupedTransactions.map((section) => (
                <View key={section.key} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{section.title}</Text>
                    <View style={styles.groupLine} />
                  </View>

                  <View style={styles.groupSummaryRow}>
                    <TransactionDaySummary
                      colors={colors}
                      locale={locale}
                      income={section.incomeTotal}
                      expense={section.expenseTotal}
                      net={section.netTotal}
                      incomeLabel={t('activity.transactions.income')}
                      expenseLabel={t('activity.transactions.expense')}
                      netLabel={t('activity.transactions.netVolume')}
                    />
                  </View>

                  <View style={styles.groupList}>
                    {section.items.map((record) => (
                      <TransactionRow
                        key={record.id}
                        record={record}
                        colors={colors}
                        locale={locale}
                        statusLabel={
                          record.type === 'income'
                            ? t('activity.transactions.settled')
                            : t('activity.transactions.completed')
                        }
                        incomeLabel={t('activity.transactions.income')}
                        expenseLabel={t('activity.transactions.expense')}
                        onPress={() => props.onPressItem(record)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {props.pagination.page < props.pagination.totalPages && props.visibleTransactions.length > 0 && (
          <Pressable onPress={props.onLoadMore} disabled={props.loadingMore} style={styles.loadMoreButton}>
            {props.loadingMore ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.loadMoreText}>{t('activity.transactions.loadMore')}</Text>
            )}
          </Pressable>
        )}

        {!!props.error && <Text style={styles.errorText}>{props.error}</Text>}
      </ScrollView>

      <Pressable
        onPress={props.onOpenCreateModal}
        style={({ pressed }) => [styles.fabContainer, pressed && styles.fabPressed]}>
        <View style={styles.fab}>
          <MaterialCommunityIcons name="plus" size={26} color={colors.onPrimary} />
        </View>
      </Pressable>

      <ActivityModals
        filterModalVisible={props.filterModalVisible}
        transactionModalVisible={props.transactionModalVisible}
        detailViewVisible={props.detailViewVisible}
        deleteConfirmVisible={props.deleteConfirmVisible}
        editDeleteConfirmVisible={props.editDeleteConfirmVisible}
        colors={colors}
        locale={locale}
        t={t}
        styles={styles}
        isLight={isLight}
        draftFilters={props.draftFilters}
        setDraftFilters={props.setDraftFilters}
        walletOptions={props.walletOptions}
        filterCategories={props.filterCategories}
        salaryDay={props.salaryDay}
        filterError={props.filterError}
        iosFilterDatePickerVisible={props.iosFilterDatePickerVisible}
        setIosFilterDatePickerVisible={props.setIosFilterDatePickerVisible}
        filterDateTarget={props.filterDateTarget}
        selectedMonthParts={props.selectedMonthParts}
        monthOptionLabels={props.monthOptionLabels}
        yearOptions={props.yearOptions}
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
        selectedDetailRecord={props.selectedDetailRecord}
        walletMap={props.walletMap}
        onCloseFilterModal={props.onCloseFilterModal}
        onApplyFilters={props.onApplyFilters}
        onResetFilters={props.onResetFilters}
        onOpenFilterDatePicker={props.onOpenFilterDatePicker}
        onFilterDateChange={props.onFilterDateChange}
        onCloseTransactionModal={props.onCloseTransactionModal}
        onSaveTransaction={props.onSaveTransaction}
        onOpenEditDeleteConfirm={props.onOpenEditDeleteConfirm}
        onOpenDatePicker={props.onOpenDatePicker}
        iosDatePickerVisible={props.iosDatePickerVisible}
        dateInputLabel={props.dateInputLabel}
        onDateChange={props.onDateChange}
        onSetIosDatePickerVisible={props.onSetIosDatePickerVisible}
        onCloseDetailModal={props.onCloseDetailModal}
        onEditFromDetail={props.onEditFromDetail}
        onSetDeleteConfirmVisible={props.onSetDeleteConfirmVisible}
        onCloseDeleteConfirm={props.onCloseDeleteConfirm}
        onConfirmDelete={props.onConfirmDelete}
        onCloseEditDeleteConfirm={props.onCloseEditDeleteConfirm}
        onConfirmEditDelete={props.onConfirmEditDelete}
      />
    </>
  );
}

export { ActivityView };
