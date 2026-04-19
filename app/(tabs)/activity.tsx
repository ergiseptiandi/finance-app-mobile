import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError, refreshToken } from '@/lib/api/auth';
import { getAuthSession, saveAuthSession } from '@/lib/auth-session';
import { listCategories, type CategoryRecord } from '@/lib/api/categories';
import {
  createTransaction,
  deleteTransaction,
  getTransactionDetail,
  getTransactionSummary,
  listTransactions,
  updateTransaction,
  type TransactionRecord,
  type TransactionSummaryData,
  type TransactionType,
} from '@/lib/api/transactions';
import { useAppLanguage } from '@/providers/language-provider';

type ActivityFilter = 'all' | TransactionType;

type PaginationState = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type TransactionFormState = {
  id?: number;
  type: TransactionType;
  category: string;
  amount: string;
  date: string;
  description: string;
};

type TransactionSection = {
  key: string;
  title: string;
  items: TransactionRecord[];
};

const DEFAULT_SUMMARY: TransactionSummaryData = {
  total_income: 0,
  total_expense: 0,
  balance: 0,
};

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  perPage: 10,
  total: 0,
  totalPages: 1,
};

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const createEmptyTransactionForm = (): TransactionFormState => ({
  type: 'expense',
  category: '',
  amount: '',
  date: getTodayInputValue(),
  description: '',
});

const toInputDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayInputValue();
  }

  return parsed.toISOString().slice(0, 10);
};

const toApiDate = (value: string) => {
  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00Z`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? `${getTodayInputValue()}T00:00:00Z` : parsed.toISOString();
};

const toCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

const toSignedCurrency = (value: number, locale: string) => {
  const formatted = toCurrency(Math.abs(value), locale);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
};

const toTimeLabel = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const toDateHeading = (value: string, locale: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.toUpperCase();
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
    .format(parsed)
    .toUpperCase();
};

const toTransactionForm = (record: TransactionRecord): TransactionFormState => ({
  id: record.id,
  type: record.type,
  category: record.category,
  amount: String(record.amount),
  date: toInputDate(record.date),
  description: record.description ?? '',
});

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const toDaySectionKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'older';
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(parsed, now)) {
    return 'today';
  }

  if (isSameDay(parsed, yesterday)) {
    return 'yesterday';
  }

  return parsed.toISOString().slice(0, 10);
};

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
      metaColor: isLight ? colors.secondary : colors.secondaryAccent,
    },
    secondary: {
      background: isLight ? colors.shellCardSoft : alpha(colors.surfaceContainerHigh, 0.16),
      fill: isLight ? colors.primary : colors.primaryContainer,
      borderColor: alpha(colors.primary, isLight ? 0.08 : 0.18),
      metaColor: colors.shellTextSecondary,
    },
    teal: {
      background: alpha(colors.secondary, isLight ? 0.08 : 0.12),
      fill: isLight ? colors.secondary : colors.secondaryAccent,
      borderColor: alpha(colors.secondary, isLight ? 0.14 : 0.22),
      metaColor: colors.secondary,
    },
  } as const;

  const palette = accentMap[accent];

  return (
    <View
      style={[
        summaryStyles(colors).card,
        { backgroundColor: palette.background, borderColor: palette.borderColor },
      ]}>
      <Text style={summaryStyles(colors).title}>{title}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={summaryStyles(colors).value}>
        {value}
      </Text>
      {showProgress ? (
        <View style={summaryStyles(colors).progressTrack}>
          <View
            style={[
              summaryStyles(colors).progressFill,
              { width: `${Math.max(8, progress)}%`, backgroundColor: palette.fill },
            ]}
          />
        </View>
      ) : null}
      <Text
        style={[
          summaryStyles(colors).meta,
          { color: metaTone === 'positive' ? palette.metaColor : colors.shellTextMuted },
        ]}>
        {meta}
      </Text>
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
  const iconColor = isIncome ? colors.secondaryAccent : colors.primaryContainer;
  const iconBackground = alpha(isIncome ? colors.secondaryAccent : colors.primaryContainer, 0.14);
  const amount = toSignedCurrency(isIncome ? record.amount : -record.amount, locale);
  const subtitleBase = record.description?.trim() || (isIncome ? incomeLabel : expenseLabel);
  const subtitle = `${subtitleBase} • ${toTimeLabel(record.date, locale)}`;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rowStyles(colors).card, pressed && rowStyles(colors).pressed]}>
      <View style={rowStyles(colors).left}>
        <View style={[rowStyles(colors).iconWrap, { backgroundColor: iconBackground }]}>
          <MaterialCommunityIcons name={isIncome ? 'cash-fast' : 'cart-outline'} size={20} color={iconColor} />
        </View>

        <View style={rowStyles(colors).copy}>
          <Text numberOfLines={2} style={rowStyles(colors).title}>
            {record.category}
          </Text>
          <Text numberOfLines={2} style={rowStyles(colors).subtitle}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={rowStyles(colors).right}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          style={[rowStyles(colors).amount, isIncome && rowStyles(colors).amountPositive]}>
          {amount}
        </Text>
        <View style={[rowStyles(colors).statusChip, isIncome && rowStyles(colors).statusChipIncome]}>
          <Text style={[rowStyles(colors).statusText, isIncome && rowStyles(colors).statusTextIncome]}>
            {statusLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ActivityScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top);

  const [summary, setSummary] = useState<TransactionSummaryData>(DEFAULT_SUMMARY);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<TransactionFormState>(createEmptyTransactionForm);

  const withAuthorizedRequest = useCallback(
    async <T,>(task: (accessToken: string) => Promise<T>) => {
      const session = await getAuthSession();

      if (!session) {
        router.replace('/login');
        throw new Error('missing_session');
      }

      try {
        return await task(session.token.access_token);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401 && session.token.refresh_token) {
          const refreshed = await refreshToken({
            refresh_token: session.token.refresh_token,
          });
          await saveAuthSession(refreshed.Data);
          return task(refreshed.Data.token.access_token);
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace('/login');
        }

        throw error;
      }
    },
    []
  );

  const loadActivity = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const [summaryResponse, transactionResponse, categoryResponse] = await withAuthorizedRequest((accessToken) =>
          Promise.all([
            getTransactionSummary(accessToken),
            listTransactions(accessToken, {
              page: 1,
              per_page: 10,
              type: filter === 'all' ? undefined : filter,
            }),
            listCategories(accessToken),
          ])
        );

        setSummary(summaryResponse.Data ?? DEFAULT_SUMMARY);
        setTransactions(transactionResponse.Data.data ?? []);
        setCategories(categoryResponse.Data ?? []);
        setPagination({
          page: transactionResponse.Data.page ?? 1,
          perPage: transactionResponse.Data.per_page ?? 10,
          total: transactionResponse.Data.total ?? 0,
          totalPages: transactionResponse.Data.total_pages ?? 1,
        });
      } catch (loadError) {
        if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
          setError(t('activity.transactions.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, t, withAuthorizedRequest]
  );

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || pagination.page >= pagination.totalPages) {
      return;
    }

    setLoadingMore(true);
    setError('');

    try {
      const response = await withAuthorizedRequest((accessToken) =>
        listTransactions(accessToken, {
          page: pagination.page + 1,
          per_page: pagination.perPage,
          type: filter === 'all' ? undefined : filter,
        })
      );

      setTransactions((current) => [...current, ...(response.Data.data ?? [])]);
      setPagination({
        page: response.Data.page ?? pagination.page + 1,
        perPage: response.Data.per_page ?? pagination.perPage,
        total: response.Data.total ?? pagination.total,
        totalPages: response.Data.total_pages ?? pagination.totalPages,
      });
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
        setError(t('activity.transactions.loadMoreError'));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [filter, loading, loadingMore, pagination, t, withAuthorizedRequest]);

  const resetTransactionForm = useCallback(() => {
    setForm(createEmptyTransactionForm());
    setFormError('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetTransactionForm();
    setTransactionModalVisible(true);
  }, [resetTransactionForm]);

  const openEditModal = useCallback(
    async (id: number) => {
      setTransactionModalVisible(true);
      setDetailLoading(true);
      setFormError('');

      try {
        const response = await withAuthorizedRequest((accessToken) => getTransactionDetail(accessToken, id));
        setForm(toTransactionForm(response.Data));
      } catch (detailError) {
        if (!(detailError instanceof Error && detailError.message === 'missing_session')) {
          setFormError(t('activity.transactions.detailError'));
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [t, withAuthorizedRequest]
  );

  const closeTransactionModal = useCallback(() => {
    setTransactionModalVisible(false);
    setDetailLoading(false);
    setSubmitting(false);
    setDeleting(false);
    setFormError('');
    setForm(createEmptyTransactionForm());
  }, []);

  const handleSaveTransaction = useCallback(async () => {
    const normalizedCategory = form.category.trim();
    const normalizedAmount = Number.parseFloat(form.amount.replace(',', '.'));

    if (!normalizedCategory || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || !form.date.trim()) {
      setFormError(t('activity.transactions.validation'));
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        type: form.type,
        category: normalizedCategory,
        amount: normalizedAmount,
        date: toApiDate(form.date),
        description: form.description.trim(),
      };

      if (form.id) {
        await withAuthorizedRequest((accessToken) => updateTransaction(accessToken, form.id!, payload));
      } else {
        await withAuthorizedRequest((accessToken) => createTransaction(accessToken, payload));
      }

      closeTransactionModal();
      await loadActivity();
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setFormError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setFormError(t('activity.transactions.saveError'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [closeTransactionModal, form, loadActivity, t, withAuthorizedRequest]);

  const handleDeleteTransaction = useCallback(async () => {
    if (!form.id) {
      return;
    }

    setDeleting(true);
    setFormError('');

    try {
      await withAuthorizedRequest((accessToken) => deleteTransaction(accessToken, form.id!));
      closeTransactionModal();
      await loadActivity();
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError) {
        setFormError(deleteError.message);
      } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
        setFormError(t('activity.transactions.deleteError'));
      }
    } finally {
      setDeleting(false);
    }
  }, [closeTransactionModal, form.id, loadActivity, t, withAuthorizedRequest]);

  const totalMovement = summary.total_income + summary.total_expense;
  const visibleTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return transactions;
    }

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
        if (left === 'today') return -1;
        if (right === 'today') return 1;
        if (left === 'yesterday') return -1;
        if (right === 'yesterday') return 1;
        return right.localeCompare(left);
      })
      .map(([key, items]) => ({
        key,
        title:
          key === 'today'
            ? t('activity.transactions.today')
            : key === 'yesterday'
              ? t('activity.transactions.yesterday')
              : toDateHeading(items[0]?.date ?? key, locale),
        items,
      }));
  }, [locale, t, visibleTransactions]);

  const streamProgress =
    pagination.total > 0 ? (visibleTransactions.length / Math.max(pagination.total, 1)) * 100 : 0;
  const incomeShare = totalMovement > 0 ? (summary.total_income / totalMovement) * 100 : 0;

  const availableCategories = useMemo(
    () =>
      categories
        .filter((category) => category.type === form.type)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [categories, form.type]
  );

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadActivity(true)} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>{t('activity.transactions.overview')}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('activity.transactions.titleShort')}</Text>
            <Pressable onPress={openCreateModal} style={styles.inlineCreateButton}>
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchShell}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.shellTextMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('activity.transactions.searchPlaceholder')}
            placeholderTextColor={colors.shellTextMuted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterBar}>
          {(['all', 'income', 'expense'] as ActivityFilter[]).map((option) => {
            const active = option === filter;
            const label =
              option === 'all'
                ? t('activity.transactions.all')
                : option === 'income'
                  ? t('activity.transactions.income')
                  : t('activity.transactions.expense');

            return (
              <Pressable
                key={option}
                onPress={() => setFilter(option)}
                style={[styles.filterPill, active && styles.filterPillActive]}>
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.summaryStack}>
          <SummaryStat
            colors={colors}
            title={t('activity.transactions.netVolume')}
            value={toCurrency(totalMovement, locale)}
            meta={t('activity.transactions.thisPeriod')}
            metaTone="positive"
            accent="primary"
          />
          <SummaryStat
            colors={colors}
            title={t('activity.transactions.activeStream')}
            value={String(pagination.total)}
            meta={t('activity.transactions.recordsTracked', { count: pagination.total })}
            accent="secondary"
            showProgress
            progress={streamProgress}
          />
          <SummaryStat
            colors={colors}
            title={t('activity.transactions.incomeShare')}
            value={`${incomeShare.toFixed(1)}%`}
            meta={t('activity.transactions.ofMovement')}
            accent="teal"
          />
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>{t('activity.transactions.loading')}</Text>
          </View>
        ) : groupedTransactions.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="text-box-search-outline" size={28} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{t('activity.transactions.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('activity.transactions.emptyBody')}</Text>
          </View>
        ) : (
          groupedTransactions.map((section) => (
            <View key={section.key} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{section.title}</Text>
                <View style={styles.groupLine} />
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
                    onPress={() => openEditModal(record.id)}
                  />
                ))}
              </View>
            </View>
          ))
        )}

        {pagination.page < pagination.totalPages && visibleTransactions.length > 0 && (
          <Pressable onPress={loadMore} disabled={loadingMore} style={styles.loadMoreButton}>
            {loadingMore ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.loadMoreText}>{t('activity.transactions.loadMore')}</Text>
            )}
          </Pressable>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <Modal visible={transactionModalVisible} animationType="slide" transparent onRequestClose={closeTransactionModal}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeTransactionModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {form.id ? t('activity.transactions.editTitle') : t('activity.transactions.createTitle')}
                </Text>
                <Text style={styles.modalSubtitle}>{t('activity.transactions.modalHint')}</Text>
              </View>
              <Pressable onPress={closeTransactionModal} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
              </Pressable>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoadingState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.stateText}>{t('activity.transactions.detailLoading')}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
                <View style={styles.typeSegment}>
                  {(['expense', 'income'] as TransactionType[]).map((type) => {
                    const active = type === form.type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() =>
                          setForm((current) => ({
                            ...current,
                            type,
                            category:
                              current.type === type
                                ? current.category
                                : categories.some((item) => item.type === type && item.name === current.category)
                                  ? current.category
                                  : '',
                          }))
                        }
                        style={[styles.typePill, active && styles.typePillActive]}>
                        <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                          {type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('activity.transactions.category')}</Text>
                  {availableCategories.length > 0 ? (
                    <View style={styles.categoryWrap}>
                      {availableCategories.map((category) => {
                        const active = form.category === category.name;
                        return (
                          <Pressable
                            key={category.id}
                            onPress={() => setForm((current) => ({ ...current, category: category.name }))}
                            style={[styles.categoryChip, active && styles.categoryChipActive]}>
                            <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
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

                <View style={styles.fieldGrid}>
                  <View style={[styles.fieldGroup, styles.fieldHalf]}>
                    <Text style={styles.fieldLabel}>{t('activity.transactions.amount')}</Text>
                    <TextInput
                      value={form.amount}
                      onChangeText={(value) => setForm((current) => ({ ...current, amount: value }))}
                      placeholder="1500000"
                      placeholderTextColor={colors.inputPlaceholder}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={[styles.fieldGroup, styles.fieldHalf]}>
                    <Text style={styles.fieldLabel}>{t('activity.transactions.date')}</Text>
                    <TextInput
                      value={form.date}
                      onChangeText={(value) => setForm((current) => ({ ...current, date: value }))}
                      placeholder="2026-04-17"
                      placeholderTextColor={colors.inputPlaceholder}
                      style={styles.input}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('activity.transactions.description')}</Text>
                  <TextInput
                    value={form.description}
                    onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
                    placeholder={t('activity.transactions.descriptionPlaceholder')}
                    placeholderTextColor={colors.inputPlaceholder}
                    multiline
                    textAlignVertical="top"
                    style={[styles.input, styles.textarea]}
                  />
                </View>

                {!!formError && <Text style={styles.errorText}>{formError}</Text>}

                <Pressable onPress={handleSaveTransaction} disabled={submitting || deleting} style={styles.submitButton}>
                  {submitting ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {form.id ? t('activity.transactions.update') : t('activity.transactions.create')}
                    </Text>
                  )}
                </Pressable>

                {form.id ? (
                  <Pressable onPress={handleDeleteTransaction} disabled={submitting || deleting} style={styles.deleteButton}>
                    {deleting ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                        <Text style={styles.deleteButtonText}>{t('activity.transactions.delete')}</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const summaryStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 30,
      paddingHorizontal: 24,
      paddingVertical: 22,
      gap: 12,
      overflow: 'hidden',
      borderWidth: 1,
    },
    title: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.8,
    },
    value: {
      color: colors.shellTextPrimary,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '900',
      letterSpacing: -1,
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.44),
      overflow: 'hidden',
      marginTop: 2,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    meta: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
  });

const rowStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 18,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    pressed: {
      opacity: 0.94,
    },
    left: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    right: {
      width: 108,
      alignItems: 'flex-end',
      gap: 8,
    },
    amount: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    amountPositive: {
      color: colors.secondaryAccent,
    },
    statusChip: {
      minHeight: 26,
      borderRadius: 999,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.secondary, 0.18),
    },
    statusChipIncome: {
      backgroundColor: alpha(colors.primary, 0.18),
    },
    statusText: {
      color: colors.secondary,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    statusTextIncome: {
      color: colors.primary,
    },
  });

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 12, 26),
      paddingBottom: 150,
      gap: 18,
    },
    hero: {
      gap: 8,
      paddingTop: 10,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    kicker: {
      color: colors.primaryContainer,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.6,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '900',
      letterSpacing: -1.2,
      flex: 1,
      minWidth: 0,
    },
    inlineCreateButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchShell: {
      minHeight: 56,
      borderRadius: 28,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.2),
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      paddingVertical: 0,
    },
    filterBar: {
      flexDirection: 'row',
      gap: 8,
    },
    filterPill: {
      minHeight: 34,
      borderRadius: 14,
      paddingHorizontal: 12,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterPillActive: {
      backgroundColor: colors.primary,
    },
    filterLabel: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    filterLabelActive: {
      color: colors.onPrimary,
    },
    summaryStack: {
      gap: 14,
      marginTop: 6,
    },
    stateCard: {
      borderRadius: 26,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 24,
      gap: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptyTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      textAlign: 'center',
    },
    groupSection: {
      gap: 14,
      marginTop: 8,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    groupTitle: {
      color: colors.shellTextSoft,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    groupLine: {
      flex: 1,
      height: 1,
      backgroundColor: alpha(colors.surfaceContainerHighest, 0.24),
    },
    groupList: {
      gap: 12,
    },
    loadMoreButton: {
      minHeight: 50,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    loadMoreText: {
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
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: alpha(colors.inverseSurface, 0.36),
    },
    modalBackdrop: {
      flex: 1,
    },
    modalSheet: {
      maxHeight: '88%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.shellBackground,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 28,
      gap: 16,
      borderTopWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      color: colors.shellTextPrimary,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    modalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalLoadingState: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    formContent: {
      gap: 14,
      paddingBottom: 10,
    },
    typeSegment: {
      flexDirection: 'row',
      gap: 8,
    },
    typePill: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typePillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typePillText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    typePillTextActive: {
      color: colors.onPrimary,
    },
    fieldGroup: {
      gap: 8,
    },
    fieldGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    fieldHalf: {
      flex: 1,
      minWidth: 0,
    },
    fieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    input: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    textarea: {
      minHeight: 112,
    },
    categoryWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    categoryChip: {
      minHeight: 38,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryChipActive: {
      backgroundColor: alpha(colors.primary, 0.12),
      borderColor: alpha(colors.primary, 0.32),
    },
    categoryChipText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    categoryChipTextActive: {
      color: colors.primary,
    },
    emptyCategoryBox: {
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 14,
      gap: 10,
    },
    emptyCategoryText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    emptyCategoryButton: {
      alignSelf: 'flex-start',
      minHeight: 34,
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCategoryButtonText: {
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
      marginTop: 4,
    },
    submitButtonText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    deleteButton: {
      minHeight: 50,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.28),
      backgroundColor: alpha(colors.danger, 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteButtonText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '800',
    },
  });
