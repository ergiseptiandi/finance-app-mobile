import {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeSalaryCycleDates, toLocalDateString } from '@/components/dashboard/dashboard-utils';
import { toast } from '@/components/ui/toast';
import { Colors, alpha } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import { listCategories, type CategoryRecord } from '@/lib/api/categories';
import { getNotificationSettings } from '@/lib/api/notifications';
import {
  createTransaction,
  deleteTransaction,
  getTransactionDetail,
  getTransactionSummary,
  listTransactions,
  updateTransaction,
  type TransactionRecord,
  type TransactionSummaryData,
} from '@/lib/api/transactions';
import { listWallets, type WalletRecord } from '@/lib/api/wallets';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';
import { useNetworkStatus } from '@/providers/network-status-provider';

import { createStyles } from './activity/activity-styles';
import {
  type ActivityCacheState,
  type ActivityListFilters,
  type PaginationState,
  type TransactionFormState,
  type TransactionSection,
  createActivityCacheSuffix,
  createDefaultActivityFilters,
  createEmptyTransactionForm,
  createTransactionListParams,
  createTransactionSummaryParams,
  getFilterRangeDays,
  getMonthValueParts,
  getCurrentMonthInputValue,
  getTodayInputValue,
  isMainWalletName,
  parseCurrencyInput,
  toApiDate,
  toCurrency,
  toDateHeading,
  toDateInputLabel,
  toDaySectionKey,
  toMonthInputLabel,
  toPickerDate,
  toTransactionForm,
  DEFAULT_PAGINATION,
  DEFAULT_SUMMARY,
} from './activity/activity-utils';
import { ActivityView } from './activity/activity-view';

const MONTH_INPUT_PATTERN = /^\d{4}-\d{2}$/;
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function ActivityScreen() {
  const searchParams = useLocalSearchParams<{ compose?: string }>();
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { language, t } = useAppLanguage();
  const { isOffline } = useNetworkStatus();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top, insets.bottom);
  const isLight = colors === Colors.light;

  const [summary, setSummary] = useState<TransactionSummaryData>(DEFAULT_SUMMARY);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<ActivityListFilters>(() => createDefaultActivityFilters(25));
  const [draftFilters, setDraftFilters] = useState<ActivityListFilters>(() => createDefaultActivityFilters(25));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [detailViewVisible, setDetailViewVisible] = useState(false);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<TransactionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [editDeleteConfirmVisible, setEditDeleteConfirmVisible] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<TransactionFormState>(createEmptyTransactionForm);
  const [iosDatePickerVisible, setIosDatePickerVisible] = useState(false);
  const [iosFilterDatePickerVisible, setIosFilterDatePickerVisible] = useState(false);
  const [filterDateTarget, setFilterDateTarget] = useState<'startDate' | 'endDate' | null>(null);
  const filterDateTargetRef = useRef<'startDate' | 'endDate' | null>(null);
  const [salaryDay, setSalaryDay] = useState<number>(25);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const keyboardOpen = keyboardHeight > 0;
  const modalLift = keyboardOpen ? Math.max(36, keyboardHeight - insets.bottom + 28) : 0;
  const hasActivitySnapshot = Boolean(
    transactions.length || categories.length || pagination.total ||
    summary.total_income || summary.total_expense || summary.balance
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchFocused(false);
    setSearchInputKey((c) => c + 1);
    requestAnimationFrame(() => { scrollViewRef.current?.scrollTo({ y: 0, animated: true }); });
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
          const cycleDates = computeSalaryCycleDates(day);
          const nextFilters: ActivityListFilters = {
            walletId: null, type: 'all', category: '', dateMode: 'cycle',
            month: '', startDate: cycleDates.startDate, endDate: cycleDates.endDate,
          };
          setFilters(nextFilters);
          setDraftFilters(nextFilters);
        }
      } catch { /* keep default */ }
    };
    fetchSalaryDay();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const session = await getAuthSession();
      if (!session || !active) return;
      const cached = await readScreenCache<ActivityCacheState>(
        buildScreenCacheKey('activity', session.user.id, createActivityCacheSuffix(filters))
      );
      if (!cached || !active) return;
      setSummary(cached.data.summary);
      setTransactions(cached.data.transactions);
      setCategories(cached.data.categories);
      setWallets(cached.data.wallets ?? []);
      setPagination(cached.data.pagination);
      setLoading(false);
    };
    hydrate();
    return () => { active = false; };
  }, [filters]);

  useEffect(() => {
    const compose = Array.isArray(searchParams.compose) ? searchParams.compose[0] : searchParams.compose;
    if (compose !== 'income' && compose !== 'expense') return;
    setTransactionModalVisible(true);
    const defaultWalletId = wallets.find((w) => isMainWalletName(w.name))?.id ?? null;
    setForm((current) => ({
      ...createEmptyTransactionForm(), type: compose,
      walletId: compose === 'income' ? defaultWalletId : current.walletId,
    }));
    router.setParams({ compose: undefined });
  }, [searchParams.compose, wallets]);

  const withAuthorizedRequest = useCallback(async <T,>(task: (accessToken: string) => Promise<T>) => {
    const session = await getAuthSession();
    if (!session) { router.replace('/login'); throw new Error('missing_session'); }
    try {
      return await task(session.token.access_token);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401 && session.token.refresh_token) {
        const refreshed = await refreshStoredAuthSession();
        if (refreshed) return task(refreshed.token.access_token);
      }
      if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
      throw err;
    }
  }, []);

  const loadActivity = useCallback(async (isRefresh = false) => {
    const shouldShowSkeleton = !isRefresh && !hasActivitySnapshot;
    if (isRefresh) setRefreshing(true);
    else if (shouldShowSkeleton) setLoading(true);
    setError('');
    try {
      const session = await getAuthSession();
      if (!session) { router.replace('/login'); return; }
      const [summaryRes, txnRes, catRes, walletRes] = await withAuthorizedRequest((token) =>
        Promise.allSettled([
          getTransactionSummary(token, createTransactionSummaryParams(filters)),
          listTransactions(token, createTransactionListParams(filters, 1, 10)),
          listCategories(token), listWallets(token),
        ])
      );
      if (summaryRes.status !== 'fulfilled' || txnRes.status !== 'fulfilled' || catRes.status !== 'fulfilled') {
        throw new Error('load_failed');
      }
      setSummary(summaryRes.value.Data ?? DEFAULT_SUMMARY);
      setTransactions(txnRes.value.Data.data ?? []);
      setCategories(catRes.value.Data ?? []);
      setWallets(walletRes.status === 'fulfilled' ? walletRes.value.Data ?? [] : []);
      setPagination({
        page: txnRes.value.Data.page ?? 1, perPage: txnRes.value.Data.per_page ?? 10,
        total: txnRes.value.Data.total ?? 0, totalPages: txnRes.value.Data.total_pages ?? 1,
      });
      await writeScreenCache(
        buildScreenCacheKey('activity', session.user.id, createActivityCacheSuffix(filters)),
        {
          summary: summaryRes.value.Data ?? DEFAULT_SUMMARY,
          transactions: txnRes.value.Data.data ?? [],
          categories: catRes.value.Data ?? [],
          wallets: walletRes.status === 'fulfilled' ? walletRes.value.Data ?? [] : [],
          pagination: { page: txnRes.value.Data.page ?? 1, perPage: txnRes.value.Data.per_page ?? 10, total: txnRes.value.Data.total ?? 0, totalPages: txnRes.value.Data.total_pages ?? 1 },
        }
      );
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
        if (isOffline && hasActivitySnapshot) { setError(''); return; }
        setError(isOffline ? t('common.offlineLoadError') : t('activity.transactions.loadError'));
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, [filters, hasActivitySnapshot, isOffline, t, withAuthorizedRequest]);

  useFocusEffect(useCallback(() => { loadActivity(); }, [loadActivity]));

  useEffect(() => {
    if (!transactionModalVisible) { setKeyboardHeight(0); return; }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [transactionModalVisible]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || pagination.page >= pagination.totalPages) return;
    setLoadingMore(true); setError('');
    try {
      const response = await withAuthorizedRequest((token) =>
        listTransactions(token, createTransactionListParams(filters, pagination.page + 1, pagination.perPage))
      );
      setTransactions((cur) => [...cur, ...(response.Data.data ?? [])]);
      setPagination({
        page: response.Data.page ?? pagination.page + 1,
        perPage: response.Data.per_page ?? pagination.perPage,
        total: response.Data.total ?? pagination.total,
        totalPages: response.Data.total_pages ?? pagination.totalPages,
      });
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
        if (isOffline && hasActivitySnapshot) return;
        setError(isOffline ? t('common.offlineLoadError') : t('activity.transactions.loadMoreError'));
      }
    } finally { setLoadingMore(false); }
  }, [filters, hasActivitySnapshot, isOffline, loading, loadingMore, pagination, t, withAuthorizedRequest]);

  const resetTransactionForm = useCallback(() => {
    setForm(createEmptyTransactionForm()); setIosDatePickerVisible(false); setFormError('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetTransactionForm(); setTransactionModalVisible(true);
  }, [resetTransactionForm]);

  const openEditModal = useCallback(async (id: number) => {
    setTransactionModalVisible(true); setDetailLoading(true);
    setIosDatePickerVisible(false); setFormError('');
    try {
      const response = await withAuthorizedRequest((token) => getTransactionDetail(token, id));
      setForm(toTransactionForm(response.Data));
    } catch (detailError) {
      if (!(detailError instanceof Error && detailError.message === 'missing_session')) {
        setFormError(t('activity.transactions.detailError'));
      }
    } finally { setDetailLoading(false); }
  }, [t, withAuthorizedRequest]);

  const openDetailModal = useCallback((record: TransactionRecord) => {
    setSelectedDetailRecord(record); setDetailViewVisible(true);
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetailViewVisible(false); setSelectedDetailRecord(null);
  }, []);

  const handleEditFromDetail = useCallback(() => {
    if (!selectedDetailRecord) return;
    const recordId = selectedDetailRecord.id;
    closeDetailModal(); openEditModal(recordId);
  }, [selectedDetailRecord, closeDetailModal, openEditModal]);

  const handleDeleteFromDetail = useCallback(async () => {
    if (!selectedDetailRecord) return;
    setDeleting(true);
    try {
      await withAuthorizedRequest((token) => deleteTransaction(token, selectedDetailRecord.id));
      closeDetailModal();
      toast.success(language === 'id' ? 'Transaksi dihapus' : 'Transaction deleted');
      await loadActivity();
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError) setFormError(deleteError.message);
      else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
        setFormError(t('activity.transactions.deleteError'));
      }
    } finally { setDeleting(false); }
  }, [selectedDetailRecord, closeDetailModal, loadActivity, t, withAuthorizedRequest]);

  const closeTransactionModal = useCallback(() => {
    setTransactionModalVisible(false); setDetailLoading(false); setSubmitting(false);
    setDeleting(false); setIosDatePickerVisible(false); setFormError('');
    setForm(createEmptyTransactionForm());
  }, []);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') return;
    if (!selectedDate) return;
    const nextDate = selectedDate.toISOString().slice(0, 10);
    setForm((current) => ({ ...current, date: nextDate }));
  }, []);

  const openDatePicker = useCallback(() => {
    const currentDate = toPickerDate(form.date);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: currentDate, mode: 'date', onChange: handleDateChange });
      return;
    }
    setIosDatePickerVisible((current) => !current);
  }, [form.date, handleDateChange]);

  const openFilterModal = useCallback(() => {
    setDraftFilters(filters); setFilterError('');
    setFilterDateTarget(null); setIosFilterDatePickerVisible(false);
    setFilterModalVisible(true);
  }, [filters]);

  const closeFilterModal = useCallback(() => {
    setFilterModalVisible(false); setFilterError('');
    setFilterDateTarget(null); setIosFilterDatePickerVisible(false);
  }, []);

  const handleFilterDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') return;
    const target = filterDateTargetRef.current;
    if (!selectedDate || !target) return;
    const nextDate = toLocalDateString(selectedDate);
    setDraftFilters((current) => ({ ...current, [target]: nextDate }));
  }, []);

  const openFilterDatePicker = useCallback((target: 'startDate' | 'endDate') => {
    const currentValue = draftFilters[target] || getTodayInputValue();
    const currentDate = toPickerDate(currentValue);
    setFilterDateTarget(target); filterDateTargetRef.current = target;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: currentDate, mode: 'date', onChange: handleFilterDateChange });
      return;
    }
    setIosFilterDatePickerVisible(true);
  }, [draftFilters, handleFilterDateChange]);

  const resetFilters = useCallback(() => {
    const nextFilters = createDefaultActivityFilters(salaryDay);
    setLoading(true); setDraftFilters(nextFilters); setFilters(nextFilters);
    setFilterError(''); setFilterModalVisible(false);
  }, [salaryDay]);

  const applyFilters = useCallback(() => {
    if (draftFilters.dateMode === 'month') {
      if (!MONTH_INPUT_PATTERN.test(draftFilters.month)) {
        setFilterError(t('activity.transactions.filterMonthInvalid')); return;
      }
    }
    if (draftFilters.dateMode === 'range') {
      if (!DATE_INPUT_PATTERN.test(draftFilters.startDate) || !DATE_INPUT_PATTERN.test(draftFilters.endDate)) {
        setFilterError(t('activity.transactions.filterRangeRequired')); return;
      }
      const rangeDays = getFilterRangeDays(draftFilters.startDate, draftFilters.endDate);
      if (rangeDays < 0) { setFilterError(t('activity.transactions.filterRangeInvalid')); return; }
      if (rangeDays > 62) { setFilterError(t('activity.transactions.filterRangeTooLong')); return; }
    }
    let nextFilters: ActivityListFilters;
    if (draftFilters.dateMode === 'cycle') {
      const cycleDates = computeSalaryCycleDates(salaryDay);
      nextFilters = { ...draftFilters, month: '', startDate: cycleDates.startDate, endDate: cycleDates.endDate };
    } else {
      nextFilters = draftFilters;
    }
    setFilterError(''); setLoading(true); setTransactions([]);
    setPagination(DEFAULT_PAGINATION); setFilters(nextFilters);
    setFilterModalVisible(false); setIosFilterDatePickerVisible(false); setFilterDateTarget(null);
  }, [draftFilters, salaryDay, t]);

  const walletMap = useMemo(() => new Map(wallets.map((w) => [w.id, w] as const)), [wallets]);
  const walletOptions = useMemo(() => [...wallets].sort((a, b) => a.name.localeCompare(b.name)), [wallets]);
  const selectableWalletOptions = useMemo(() => walletOptions.filter((w) => !isMainWalletName(w.name)), [walletOptions]);
  const transactionWalletOptions = form.type === 'income' ? walletOptions : selectableWalletOptions;
  const mainWallet = useMemo(() => walletOptions.find((w) => isMainWalletName(w.name)), [walletOptions]);
  const isIncomeForm = form.type === 'income';
  const selectedTransactionWalletId =
    isIncomeForm
      ? form.walletId ?? mainWallet?.id ?? null
      : form.walletId && walletMap.get(form.walletId) && !isMainWalletName(walletMap.get(form.walletId)?.name) ? form.walletId : null;

  const handleSaveTransaction = useCallback(async () => {
    const normalizedCategory = form.category.trim();
    const normalizedAmount = parseCurrencyInput(form.amount);
    if (!normalizedCategory || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || !form.date.trim()) {
      setFormError(t('activity.transactions.validation')); return;
    }
    setSubmitting(true); setFormError('');
    try {
      const payload = {
        wallet_id: selectedTransactionWalletId ?? undefined,
        type: form.type, category: normalizedCategory,
        amount: normalizedAmount, date: toApiDate(form.date),
        description: form.description.trim(),
      };
      if (form.id) await withAuthorizedRequest((token) => updateTransaction(token, form.id!, payload));
      else await withAuthorizedRequest((token) => createTransaction(token, payload));
      closeTransactionModal();
      toast.success(form.id
        ? (language === 'id' ? 'Transaksi diperbarui' : 'Transaction updated')
        : (language === 'id' ? 'Transaksi ditambahkan' : 'Transaction added'));
      await loadActivity();
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) setFormError(saveError.message);
      else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setFormError(t('activity.transactions.saveError'));
      }
    } finally { setSubmitting(false); }
  }, [closeTransactionModal, loadActivity, selectedTransactionWalletId, form, t, withAuthorizedRequest]);

  const handleDeleteTransaction = useCallback(async () => {
    if (!form.id) return;
    setDeleting(true); setFormError('');
    try {
      await withAuthorizedRequest((token) => deleteTransaction(token, form.id!));
      closeTransactionModal();
      toast.success(language === 'id' ? 'Transaksi dihapus' : 'Transaction deleted');
      await loadActivity();
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError) setFormError(deleteError.message);
      else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
        setFormError(t('activity.transactions.deleteError'));
      }
    } finally { setDeleting(false); }
  }, [closeTransactionModal, form.id, loadActivity, t, withAuthorizedRequest]);

  const transactionBalance = summary.balance;
  const debtRepayment = summary.debt_repayment ?? 0;
  const savingsRate = summary.savings_rate ?? 0;
  const searchActive = searchQuery.trim().length > 0;
  const visibleTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((record) => {
      const haystack = `${record.category} ${record.description} ${record.type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, transactions]);

  const groupedTransactions = useMemo<TransactionSection[]>(() => {
    const buckets = new Map<string, TransactionRecord[]>();
    visibleTransactions.forEach((record) => {
      const key = toDaySectionKey(record.date);
      const existing = buckets.get(key) ?? [];
      existing.push(record);
      buckets.set(key, existing);
    });
    return Array.from(buckets.entries())
      .sort(([left], [right]) => {
        if (left === 'today') return -1; if (right === 'today') return 1;
        if (left === 'yesterday') return -1; if (right === 'yesterday') return 1;
        return right.localeCompare(left);
      })
      .map(([key, items]) => {
        const totals = items.reduce(
          (acc, record) => {
            if (record.type === 'income') acc.incomeTotal += record.amount;
            else acc.expenseTotal += record.amount;
            return acc;
          },
          { incomeTotal: 0, expenseTotal: 0 }
        );
        return {
          key,
          title: key === 'today' ? t('activity.transactions.today')
            : key === 'yesterday' ? t('activity.transactions.yesterday')
            : toDateHeading(items[0]?.date ?? key, locale),
          items,
          incomeTotal: totals.incomeTotal,
          expenseTotal: totals.expenseTotal,
          netTotal: totals.incomeTotal - totals.expenseTotal,
        };
      });
  }, [locale, t, visibleTransactions]);

  const totalMovement = summary.total_income + summary.total_expense;
  const streamProgress = pagination.total > 0 ? (visibleTransactions.length / Math.max(pagination.total, 1)) * 100 : 0;
  const incomeShare = totalMovement > 0 ? (summary.total_income / totalMovement) * 100 : 0;

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === form.type).sort((a, b) => a.name.localeCompare(b.name)),
    [categories, form.type]
  );
  const mainWalletBalance = mainWallet ? Number(mainWallet.balance ?? 0) : 0;
  const filterCategories = useMemo(
    () => [...new Set(categories.map((c) => c.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [categories]
  );
  const modalAccent = isIncomeForm ? colors.secondary : colors.primary;
  const modalAccentSoft = alpha(modalAccent, isLight ? 0.1 : 0.18);
  const modalAccentBorder = alpha(modalAccent, isLight ? 0.16 : 0.28);
  const normalizedPreviewAmount = parseCurrencyInput(form.amount);
  const hasAmountPreview = Number.isFinite(normalizedPreviewAmount) && normalizedPreviewAmount > 0;
  const amountPreview = hasAmountPreview ? toCurrency(normalizedPreviewAmount, locale) : t('activity.transactions.modalAmountPending');
  const dateInputLabel = toDateInputLabel(form.date, locale);
  const selectedWalletLabel =
    form.walletId && walletMap.get(form.walletId)
      ? walletMap.get(form.walletId)?.name ?? t('activity.transactions.walletDefault')
      : t('activity.transactions.walletDefault');
  const modalKicker = form.id ? t('activity.transactions.modalEditKicker') : t('activity.transactions.modalCreateKicker');
  const modalToneCopy = isIncomeForm ? t('activity.transactions.modalIncomeHint') : t('activity.transactions.modalExpenseHint');
  const activeFilterCount =
    (filters.walletId ? 1 : 0) + (filters.type !== 'all' ? 1 : 0) +
    (filters.category ? 1 : 0) + (filters.dateMode === 'range' || filters.month !== getCurrentMonthInputValue() ? 1 : 0);
  const activeFilterWalletLabel = filters.walletId && walletMap.get(filters.walletId) ? walletMap.get(filters.walletId)?.name ?? '' : '';
  const activeFilterChips = [
    filters.dateMode === 'month' ? toMonthInputLabel(filters.month, locale)
      : filters.dateMode === 'cycle' ? t('activity.transactions.filterCycleMode')
      : `${toDateInputLabel(filters.startDate, locale)} - ${toDateInputLabel(filters.endDate, locale)}`,
    activeFilterWalletLabel,
    filters.type !== 'all' ? (filters.type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')) : '',
    filters.category,
  ].filter(Boolean);
  const selectedMonthParts = getMonthValueParts(draftFilters.month);
  const monthOptionLabels = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2026, i, 1)).replace('.', '').toUpperCase()
  );
  const yearOptions = Array.from({ length: 7 }, (_, i) => selectedMonthParts.year - 3 + i);

  return (
    <ActivityView
      colors={colors}
      locale={locale}
      t={t}
      styles={styles}
      isLight={isLight}
      language={language}
      loading={loading}
      refreshing={refreshing}
      loadingMore={loadingMore}
      error={error}
      searchActive={searchActive}
      searchFocused={searchFocused}
      searchQuery={searchQuery}
      searchInputKey={searchInputKey}
      activeFilterCount={activeFilterCount}
      activeFilterChips={activeFilterChips}
      transactionBalance={transactionBalance}
      debtRepayment={debtRepayment}
      savingsRate={savingsRate}
      pagination={pagination}
      streamProgress={streamProgress}
      incomeShare={incomeShare}
      groupedTransactions={groupedTransactions}
      visibleTransactions={visibleTransactions}
      filters={filters}
      scrollViewRef={scrollViewRef}
      searchInputRef={searchInputRef}
      filterModalVisible={filterModalVisible}
      transactionModalVisible={transactionModalVisible}
      detailViewVisible={detailViewVisible}
      deleteConfirmVisible={deleteConfirmVisible}
      editDeleteConfirmVisible={editDeleteConfirmVisible}
      draftFilters={draftFilters}
      setDraftFilters={setDraftFilters}
      walletOptions={walletOptions}
      filterCategories={filterCategories}
      salaryDay={salaryDay}
      filterError={filterError}
      iosFilterDatePickerVisible={iosFilterDatePickerVisible}
      setIosFilterDatePickerVisible={setIosFilterDatePickerVisible}
      filterDateTarget={filterDateTarget}
      selectedMonthParts={selectedMonthParts}
      monthOptionLabels={monthOptionLabels}
      yearOptions={yearOptions}
      modalAccent={modalAccent}
      modalAccentSoft={modalAccentSoft}
      modalAccentBorder={modalAccentBorder}
      form={form}
      setForm={setForm}
      detailLoading={detailLoading}
      isIncomeForm={isIncomeForm}
      modalKicker={modalKicker}
      modalToneCopy={modalToneCopy}
      amountPreview={amountPreview}
      hasAmountPreview={hasAmountPreview}
      availableCategories={availableCategories}
      categories={categories}
      transactionWalletOptions={transactionWalletOptions}
      mainWallet={mainWallet}
      mainWalletBalance={mainWalletBalance}
      selectedWalletLabel={selectedWalletLabel}
      formError={formError}
      submitting={submitting}
      deleting={deleting}
      keyboardOpen={keyboardOpen}
      modalLift={modalLift}
      selectedDetailRecord={selectedDetailRecord}
      walletMap={walletMap}
      onRefresh={() => loadActivity(true)}
      onSearchChange={setSearchQuery}
      onSearchFocus={() => setSearchFocused(true)}
      onSearchBlur={() => setSearchFocused(false)}
      onSearchTouch={() => searchInputRef.current?.focus()}
      onClearSearch={clearSearch}
      onOpenFilterModal={openFilterModal}
      onLoadMore={loadMore}
      onOpenCreateModal={openCreateModal}
      onPressItem={openDetailModal}
      onCloseFilterModal={closeFilterModal}
      onApplyFilters={applyFilters}
      onResetFilters={resetFilters}
      onOpenFilterDatePicker={openFilterDatePicker}
      onFilterDateChange={handleFilterDateChange}
      onCloseTransactionModal={closeTransactionModal}
      onSaveTransaction={handleSaveTransaction}
      onOpenEditDeleteConfirm={() => setEditDeleteConfirmVisible(true)}
      onOpenDatePicker={openDatePicker}
      iosDatePickerVisible={iosDatePickerVisible}
      dateInputLabel={dateInputLabel}
      onDateChange={handleDateChange}
      onSetIosDatePickerVisible={setIosDatePickerVisible}
      onCloseDetailModal={closeDetailModal}
      onEditFromDetail={handleEditFromDetail}
      onSetDeleteConfirmVisible={setDeleteConfirmVisible}
      onCloseDeleteConfirm={() => setDeleteConfirmVisible(false)}
      onConfirmDelete={() => { setDeleteConfirmVisible(false); handleDeleteFromDetail(); }}
      onCloseEditDeleteConfirm={() => setEditDeleteConfirmVisible(false)}
      onConfirmEditDelete={() => { setEditDeleteConfirmVisible(false); handleDeleteTransaction(); }}
    />
  );
}
