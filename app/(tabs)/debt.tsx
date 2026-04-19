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
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { ApiRequestError, refreshToken } from '@/lib/api/auth';
import { getAuthSession, saveAuthSession } from '@/lib/auth-session';
import {
  createDebt,
  createDebtPayment,
  getDebtDetail,
  getDebtInstallments,
  getDebtPayments,
  listDebts,
  markInstallmentAsPaid,
  type DebtDetail,
  type DebtPaymentRecord,
  type DebtRecord,
  type InstallmentRecord,
} from '@/lib/api/debts';

type StatusTone = 'danger' | 'success' | 'warning' | 'neutral';
type DebtFormMode = 'create' | 'payment';

type DebtFormState = {
  name: string;
  totalAmount: string;
  monthlyInstallment: string;
  dueDate: string;
};

type PaymentFormState = {
  amount: string;
  paymentDate: string;
  proofName: string;
  proofUri: string;
  proofType: string;
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

const parseDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: string, locale: string) => {
  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const formatDayLabel = (value: string, locale: string) => {
  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  }).format(parsed);
};

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const toApiDate = (value: string) => {
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00Z`;
  }

  const parsed = parseDate(normalized);
  return parsed ? parsed.toISOString() : `${getTodayInputValue()}T00:00:00Z`;
};

const createEmptyDebtForm = (): DebtFormState => ({
  name: '',
  totalAmount: '',
  monthlyInstallment: '',
  dueDate: getTodayInputValue(),
});

const createEmptyPaymentForm = (): PaymentFormState => ({
  amount: '',
  paymentDate: getTodayInputValue(),
  proofName: '',
  proofUri: '',
  proofType: '',
});

const formatDueLabel = (value: string, t: (key: string, params?: Record<string, string | number>) => string) => {
  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  const now = new Date();
  const diffDays = Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return t('debt.dueToday');
  }

  if (diffDays > 0) {
    return t('debt.daysLeft', { count: diffDays });
  }

  return t('debt.daysOverdue', { count: Math.abs(diffDays) });
};

const getStatusTone = (status: string): StatusTone => {
  const normalized = status.toLowerCase();

  if (normalized === 'paid' || normalized === 'completed') {
    return 'success';
  }

  if (normalized === 'overdue' || normalized === 'late') {
    return 'danger';
  }

  if (normalized === 'pending') {
    return 'warning';
  }

  return 'neutral';
};

const toStatusLabel = (status: string, t: (key: string) => string) => {
  const normalized = status.toLowerCase();
  const key = `debt.status.${normalized}`;
  const translated = t(key);
  return translated === key ? status.replace(/_/g, ' ').toUpperCase() : translated;
};

const getInstallmentProgress = (debt: DebtRecord | DebtDetail | null) => {
  if (!debt) {
    return 0;
  }

  const total = toNumber(debt.total_amount);
  const paid = toNumber(debt.paid_amount);
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
};

const getDueSoonCount = (debts: DebtRecord[]) => {
  const now = new Date();
  const threshold = 30;

  return debts.filter((debt) => {
    if (debt.status === 'paid') {
      return false;
    }

    const parsed = parseDate(debt.due_date);
    if (!parsed) {
      return false;
    }

    const diffDays = Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= threshold;
  }).length;
};

const getOverdueCount = (debts: DebtRecord[]) =>
  debts.filter((debt) => debt.status === 'overdue' || toNumber(debt.overdue_installments) > 0).length;

const getTotalAmount = (debts: DebtRecord[], selector: (debt: DebtRecord) => number) =>
  debts.reduce((sum, debt) => sum + selector(debt), 0);

const selectNextPendingInstallment = (installments: InstallmentRecord[]) =>
  installments.find((installment) => installment.status !== 'paid') ?? null;

export default function DebtScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const styles = createStyles(colors, compact, insets.top);

  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submittingInstallmentId, setSubmittingInstallmentId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<DebtFormMode>('create');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [debtForm, setDebtForm] = useState<DebtFormState>(createEmptyDebtForm);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(createEmptyPaymentForm);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');

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
        const refreshed = await refreshToken({
          refresh_token: session.token.refresh_token,
        });
        await saveAuthSession(refreshed.Data);
        return task(refreshed.Data.token.access_token);
      }

      if (err instanceof ApiRequestError && err.status === 401) {
        router.replace('/login');
      }

      throw err;
    }
  }, []);

  const loadDebtDetail = useCallback(
    async (debtId: number, isRefresh = false) => {
      setDetailLoading(true);
      setDetailError('');

      try {
        const detail = await withAuthorizedRequest((accessToken) =>
          Promise.all([
            getDebtDetail(accessToken, debtId),
            getDebtInstallments(accessToken, debtId),
            getDebtPayments(accessToken, debtId),
          ])
        );

        const [detailResponse, installmentResponse, paymentResponse] = detail;
        const baseDetail = detailResponse.Data;

        setSelectedDebt({
          ...baseDetail,
          installments: installmentResponse.Data ?? baseDetail.installments ?? [],
          payments: paymentResponse.Data ?? baseDetail.payments ?? [],
        });
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setDetailError(t('debt.partialError'));
          if (!isRefresh) {
            setSelectedDebt(null);
          }
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [t, withAuthorizedRequest]
  );

  const loadDebts = useCallback(
    async (isRefresh = false, preferredDebtId: number | null = null) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const response = await withAuthorizedRequest((accessToken) => listDebts(accessToken));
        const nextDebts = response.Data ?? [];
        setDebts(nextDebts);

        const nextSelectedId =
          preferredDebtId && nextDebts.some((debt) => debt.id === preferredDebtId)
            ? preferredDebtId
            : nextDebts[0]?.id ?? null;

        setSelectedDebtId(nextSelectedId);

        if (nextSelectedId) {
          await loadDebtDetail(nextSelectedId, isRefresh);
        } else {
          setSelectedDebt(null);
        }
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setError(t('debt.loadError'));
        }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  },
    [loadDebtDetail, t, withAuthorizedRequest]
  );

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  const onRefresh = useCallback(() => {
    loadDebts(true, selectedDebtId);
  }, [loadDebts, selectedDebtId]);

  const selectDebt = useCallback(
    (debtId: number) => {
      setSelectedDebtId(debtId);
      loadDebtDetail(debtId);
    },
    [loadDebtDetail]
  );

  const handleMarkPaid = useCallback(
    async (installment: InstallmentRecord) => {
      if (!selectedDebtId) {
        return;
      }

      setSubmittingInstallmentId(installment.id);

      try {
        await withAuthorizedRequest((accessToken) =>
          markInstallmentAsPaid(accessToken, selectedDebtId, installment.id, {
            paid_at: new Date().toISOString(),
          })
        );
        await loadDebts(true, selectedDebtId);
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setDetailError(t('debt.partialError'));
        }
      } finally {
        setSubmittingInstallmentId(null);
      }
    },
    [loadDebts, selectedDebtId, t, withAuthorizedRequest]
  );

  const closeForm = useCallback(() => {
    setFormVisible(false);
    setFormError('');
    setDebtForm(createEmptyDebtForm());
    setPaymentForm(createEmptyPaymentForm());
  }, []);

  const openCreateDebtForm = useCallback(() => {
    setFormMode('create');
    setFormVisible(true);
    setFormError('');
    setDebtForm(createEmptyDebtForm());
  }, []);

  const openPaymentForm = useCallback(() => {
    setFormMode('payment');
    setFormVisible(true);
    setFormError('');
    if (!selectedDebtId && debts[0]) {
      setSelectedDebtId(debts[0].id);
    }
    setPaymentForm((current) => ({
      ...createEmptyPaymentForm(),
      amount:
        current.amount ||
        String(
          selectedDebt
            ? Math.max(toNumber(selectedDebt.monthly_installment), toNumber(selectedDebt.remaining_amount))
            : 0
      ),
    }));
  }, [debts, selectedDebt, selectedDebtId]);

  const pickProofImage = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets[0];
    setPaymentForm((current) => ({
      ...current,
      proofName: asset.name ?? current.proofName,
      proofUri: asset.uri,
      proofType: asset.mimeType ?? current.proofType ?? 'image/jpeg',
    }));
  }, []);

  const submitDebtForm = useCallback(async () => {
    setFormError('');

    const trimmedName = debtForm.name.trim();
    const totalAmount = Number(debtForm.totalAmount);
    const monthlyInstallment = Number(debtForm.monthlyInstallment);

    if (!trimmedName || !Number.isFinite(totalAmount) || !Number.isFinite(monthlyInstallment) || totalAmount <= 0 || monthlyInstallment <= 0) {
      setFormError(t('debt.form.invalidDebt'));
      return;
    }

    setFormSubmitting(true);

    try {
      await withAuthorizedRequest((accessToken) =>
        createDebt(accessToken, {
          name: trimmedName,
          total_amount: totalAmount,
          monthly_installment: monthlyInstallment,
          due_date: toApiDate(debtForm.dueDate),
        })
      );

      closeForm();
      await loadDebts(true);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'missing_session')) {
        setFormError(t('debt.saveError'));
      }
    } finally {
      setFormSubmitting(false);
    }
  }, [
    closeForm,
    debtForm.dueDate,
    debtForm.monthlyInstallment,
    debtForm.name,
    debtForm.totalAmount,
    loadDebts,
    t,
    withAuthorizedRequest,
  ]);

  const submitPaymentForm = useCallback(async () => {
    setFormError('');

    const targetDebtId = selectedDebtId ?? debts[0]?.id ?? null;
    const amount = Number(paymentForm.amount);

    if (!targetDebtId || !Number.isFinite(amount) || amount <= 0 || !paymentForm.proofUri) {
      setFormError(t('debt.form.invalidPayment'));
      return;
    }

    setFormSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('amount', String(amount));
      formData.append('payment_date', toApiDate(paymentForm.paymentDate));
      formData.append(
        'proof_image',
        {
          uri: paymentForm.proofUri,
          name: paymentForm.proofName || `payment-proof-${Date.now()}.jpg`,
          type: paymentForm.proofType || 'image/jpeg',
        } as never
      );

      await withAuthorizedRequest((accessToken) => createDebtPayment(accessToken, targetDebtId, formData));

      closeForm();
      setSelectedDebtId(targetDebtId);
      await loadDebtDetail(targetDebtId, true);
      await loadDebts(true, targetDebtId);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'missing_session')) {
        setFormError(t('debt.saveError'));
      }
    } finally {
      setFormSubmitting(false);
    }
  }, [
    closeForm,
    debts,
    loadDebtDetail,
    loadDebts,
    paymentForm.amount,
    paymentForm.paymentDate,
    paymentForm.proofName,
    paymentForm.proofType,
    paymentForm.proofUri,
    selectedDebtId,
    t,
    withAuthorizedRequest,
  ]);

  const overview = useMemo(() => {
    const totalDebt = getTotalAmount(debts, (debt) => toNumber(debt.total_amount));
    const remaining = getTotalAmount(debts, (debt) => toNumber(debt.remaining_amount));
    const paid = getTotalAmount(debts, (debt) => toNumber(debt.paid_amount));
    const dueSoon = getDueSoonCount(debts);
    const overdue = getOverdueCount(debts);
    const activeDebts = debts.filter((debt) => debt.status !== 'paid').length;
    const utilization = totalDebt > 0 ? Math.round((paid / totalDebt) * 100) : 0;

    return { totalDebt, remaining, paid, dueSoon, overdue, activeDebts, utilization };
  }, [debts]);

  const selected = selectedDebt ?? null;
  const selectedProgress = getInstallmentProgress(selected);
  const selectedRemaining = toNumber(selected?.remaining_amount);
  const selectedTotal = toNumber(selected?.total_amount);
  const selectedPaid = toNumber(selected?.paid_amount);
  const nextPendingInstallment = useMemo(
    () => selectNextPendingInstallment(selected?.installments ?? []),
    [selected]
  );
  const installmentCoverage =
    selected && toNumber(selected.unpaid_installments) + toNumber(selected.paid_installments) > 0
      ? Math.round(
          (toNumber(selected.paid_installments) /
            (toNumber(selected.paid_installments) + toNumber(selected.unpaid_installments))) *
            100
        )
      : 0;
  const paymentCount = selected?.payments?.length ?? 0;
  const dueLabel = selected ? formatDueLabel(selected.due_date, t) : '';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="wallet-outline" size={14} color={colors.secondaryAccent} />
              <Text style={styles.heroBadgeText}>{t('debt.kicker')}</Text>
            </View>
            <Pressable onPress={onRefresh} style={styles.heroAction}>
              <MaterialCommunityIcons name="refresh" size={16} color={colors.onPrimary} />
              <Text style={styles.heroActionText}>{t('debt.refresh')}</Text>
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>{t('debt.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('debt.subtitle')}</Text>

          <View style={styles.heroAmountRow}>
            <View style={styles.heroAmountCopy}>
              <Text style={styles.heroAmountLabel}>{t('debt.totalDebt')}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.heroAmount}>
                {formatCompactCurrency(overview.remaining, locale)}
              </Text>
            </View>
            <View style={styles.heroRatioShell}>
              <MaterialCommunityIcons name="chart-line" size={18} color={colors.onPrimary} />
              <Text style={styles.heroRatioValue}>{overview.utilization}%</Text>
            </View>
          </View>

          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMeta}>{t('debt.activeDebts')}: {overview.activeDebts}</Text>
            <Text style={styles.heroMeta}>{t('debt.dueSoon')}: {overview.dueSoon}</Text>
            <Text style={styles.heroMeta}>{t('debt.overdue')}: {overview.overdue}</Text>
          </View>

          <View style={styles.heroActionRow}>
            <Pressable onPress={openCreateDebtForm} style={styles.heroSecondaryAction}>
              <MaterialCommunityIcons name="plus" size={16} color={colors.onPrimary} />
              <Text style={styles.heroSecondaryActionText}>{t('debt.createDebt')}</Text>
            </Pressable>
            <Pressable onPress={openPaymentForm} style={styles.heroSecondaryActionMuted}>
              <MaterialCommunityIcons name="image-plus" size={16} color={colors.onPrimary} />
              <Text style={styles.heroSecondaryActionText}>{t('debt.uploadProof')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.sectionLabel}>{t('debt.overview')}</Text>

          <View style={styles.metricGrid}>
            <MetricCard
              colors={colors}
              icon="cash-multiple"
              tone="success"
              label={t('debt.paid')}
              value={formatCurrency(overview.paid, locale)}
              meta={`${overview.utilization}%`}
            />
            <MetricCard
              colors={colors}
              icon="calendar-clock"
              tone="warning"
              label={t('debt.dueSoon')}
              value={String(overview.dueSoon)}
              meta={t('debt.activeDebts')}
            />
            <MetricCard
              colors={colors}
              icon="alert-circle-outline"
              tone="danger"
              label={t('debt.overdue')}
              value={String(overview.overdue)}
              meta={t('debt.remaining')}
            />
            <MetricCard
              colors={colors}
              icon="bank-outline"
              tone="neutral"
              label={t('debt.remaining')}
              value={formatCompactCurrency(overview.remaining, locale)}
              meta={formatCurrency(overview.totalDebt, locale)}
            />
          </View>
        </View>

        <View style={styles.listSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionLabel}>{t('debt.selectedDebt')}</Text>
              <Text style={styles.sectionTitle}>{t('debt.installmentSchedule')}</Text>
            </View>
            {!!debts.length && (
              <Text style={styles.sectionHeaderMeta}>{debts.length} items</Text>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('debt.loading')}</Text>
            </View>
          ) : debts.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="wallet-outline" size={22} color={colors.primary} />
              <Text style={styles.emptyTitle}>{t('debt.emptyTitle')}</Text>
            </View>
          ) : (
            <View style={styles.debtList}>
              {debts.map((debt) => {
                const progress = getInstallmentProgress(debt);
                const tone = getStatusTone(debt.status);
                const isSelected = debt.id === selectedDebtId;

                return (
                  <Pressable
                    key={debt.id}
                    onPress={() => selectDebt(debt.id)}
                    style={({ pressed }) => [
                      styles.debtCard,
                      isSelected && styles.debtCardSelected,
                      pressed && styles.debtCardPressed,
                    ]}>
                    <View style={styles.debtCardHeader}>
                      <View style={styles.debtCardCopy}>
                        <View style={styles.debtCardTopRow}>
                          <Text numberOfLines={1} style={styles.debtName}>
                            {debt.name}
                          </Text>
                          <StatusChip colors={colors} tone={tone} label={toStatusLabel(debt.status, t)} />
                        </View>
                        <Text style={styles.debtMeta}>
                          {formatCurrency(toNumber(debt.monthly_installment), locale)} / month
                        </Text>
                      </View>

                      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.debtValue}>
                        {formatCompactCurrency(toNumber(debt.remaining_amount), locale)}
                      </Text>
                    </View>

                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.max(6, progress)}%` }]} />
                    </View>

                    <View style={styles.debtCardFooter}>
                      <Text style={styles.debtFooterText}>{formatDate(debt.due_date, locale)}</Text>
                      <Text style={styles.debtFooterText}>{progress}%</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {!!selected && (
          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <View style={styles.detailIconWrap}>
                <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.detailHeaderCopy}>
                <Text style={styles.detailKicker}>{t('debt.selectedDebt')}</Text>
                <Text style={styles.detailTitle}>{selected.name}</Text>
                <Text style={styles.detailSubtitle}>{dueLabel}</Text>
              </View>
              <StatusChip colors={colors} tone={getStatusTone(selected.status)} label={toStatusLabel(selected.status, t)} />
            </View>

            <View style={styles.detailStatsGrid}>
              <MiniStat
                colors={colors}
                label={t('debt.remaining')}
                value={formatCurrency(selectedRemaining, locale)}
              />
              <MiniStat
                colors={colors}
                label={t('debt.paid')}
                value={formatCurrency(selectedPaid, locale)}
              />
              <MiniStat
                colors={colors}
                label={t('debt.installments')}
                value={`${toNumber(selected?.paid_installments)}/${toNumber(selected?.paid_installments) + toNumber(selected?.unpaid_installments)}`}
              />
              <MiniStat
                colors={colors}
                label={t('debt.totalDebt')}
                value={formatCurrency(selectedTotal, locale)}
              />
              <MiniStat
                colors={colors}
                label={t('debt.payments')}
                value={String(paymentCount)}
              />
            </View>

            <View style={styles.progressPanel}>
              <View style={styles.progressPanelHeader}>
                <Text style={styles.progressPanelLabel}>{t('debt.installments')}</Text>
                <Text style={styles.progressPanelValue}>{selectedProgress}%</Text>
              </View>
              <View style={styles.progressTrackLarge}>
                <View style={[styles.progressFillLarge, { width: `${Math.max(6, selectedProgress)}%` }]} />
              </View>
              <View style={styles.progressFootRow}>
                <Text style={styles.progressFootText}>
                  {t('debt.remaining')}: {formatCompactCurrency(selectedRemaining, locale)}
                </Text>
                <Text style={styles.progressFootText}>
                  {t('debt.coverage')}: {installmentCoverage}%
                </Text>
              </View>
            </View>

            {nextPendingInstallment ? (
              <Pressable
                onPress={() => handleMarkPaid(nextPendingInstallment)}
                disabled={submittingInstallmentId !== null}
                style={({ pressed }) => [
                  styles.primaryAction,
                  pressed && styles.primaryActionPressed,
                  submittingInstallmentId !== null && styles.primaryActionDisabled,
                ]}>
                {submittingInstallmentId === nextPendingInstallment.id ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-decagram-outline" size={16} color={colors.onPrimary} />
                    <Text style={styles.primaryActionText}>{t('debt.markPaid')}</Text>
                  </>
                )}
              </Pressable>
            ) : null}

            <View style={styles.timelineSection}>
              <Text style={styles.timelineTitle}>{t('debt.installmentSchedule')}</Text>
              {selected.installments?.length ? (
                <View style={styles.timelineList}>
                  {selected.installments.map((installment) => {
                    const tone = getStatusTone(installment.status);
                    const isPaid = installment.status === 'paid';

                    return (
                      <Pressable
                        key={installment.id}
                        onPress={() => {
                          if (!isPaid) {
                            handleMarkPaid(installment);
                          }
                        }}
                        style={({ pressed }) => [
                          styles.timelineItem,
                          pressed && !isPaid && styles.timelineItemPressed,
                        ]}>
                        <View style={[styles.timelineDot, tone === 'success' && styles.timelineDotSuccess, tone === 'danger' && styles.timelineDotDanger]}>
                          <MaterialCommunityIcons
                            name={isPaid ? 'check' : tone === 'danger' ? 'clock-alert-outline' : 'calendar-clock'}
                            size={14}
                            color={isPaid ? colors.secondaryAccent : tone === 'danger' ? colors.danger : colors.primary}
                          />
                        </View>

                        <View style={styles.timelineCopy}>
                          <Text style={styles.timelineItemTitle}>#{installment.installment_no}</Text>
                          <Text style={styles.timelineItemMeta}>{formatDate(installment.due_date, locale)}</Text>
                        </View>

                        <View style={styles.timelineRight}>
                          <Text style={styles.timelineAmount}>{formatCurrency(toNumber(installment.amount), locale)}</Text>
                          <View style={[styles.statusChipInline, tone === 'success' && styles.statusChipInlineSuccess, tone === 'danger' && styles.statusChipInlineDanger]}>
                            <Text style={[styles.statusChipInlineText, tone === 'success' && styles.statusChipInlineTextSuccess, tone === 'danger' && styles.statusChipInlineTextDanger]}>
                              {toStatusLabel(installment.status, t)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyInline}>{t('debt.noInstallments')}</Text>
              )}
            </View>

            <View style={styles.timelineSection}>
              <Text style={styles.timelineTitle}>{t('debt.paymentHistory')}</Text>
              {selected.payments?.length ? (
                <View style={styles.paymentList}>
                  {selected.payments.map((payment: DebtPaymentRecord) => (
                    <View key={payment.id} style={styles.paymentItem}>
                      <View style={styles.paymentIconWrap}>
                        <MaterialCommunityIcons name="receipt-text-outline" size={16} color={colors.secondaryAccent} />
                      </View>
                      <View style={styles.paymentCopy}>
                        <Text style={styles.paymentTitle}>{formatCurrency(toNumber(payment.amount), locale)}</Text>
                        <Text style={styles.paymentMeta}>{formatDayLabel(payment.payment_date, locale)}</Text>
                      </View>
                      <Text numberOfLines={1} style={styles.paymentProof}>
                        {payment.proof_image}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyInline}>{t('debt.noPayments')}</Text>
              )}
            </View>
          </View>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {!!detailError && !error && <Text style={styles.errorText}>{detailError}</Text>}
      </ScrollView>

      <Modal
        visible={formVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForm} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalKicker}>
                  {formMode === 'create' ? t('debt.createKicker') : t('debt.paymentKicker')}
                </Text>
                <Text style={styles.modalTitle}>
                  {formMode === 'create' ? t('debt.createTitle') : t('debt.paymentTitle')}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {formMode === 'create' ? t('debt.createSubtitle') : t('debt.paymentSubtitle')}
                </Text>
              </View>

              <Pressable onPress={closeForm} style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
              </Pressable>
            </View>

            {!!formError && <Text style={styles.formError}>{formError}</Text>}

            {formMode === 'create' ? (
              <View style={styles.formStack}>
                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>{t('debt.form.name')}</Text>
                  <TextInput
                    value={debtForm.name}
                    onChangeText={(text) => setDebtForm((current) => ({ ...current, name: text }))}
                    placeholder={t('debt.form.namePlaceholder')}
                    placeholderTextColor={colors.shellTextSoft}
                    style={styles.textField}
                  />
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldStackHalf}>
                    <Text style={styles.fieldLabel}>{t('debt.form.totalAmount')}</Text>
                    <TextInput
                      value={debtForm.totalAmount}
                      onChangeText={(text) =>
                        setDebtForm((current) => ({ ...current, totalAmount: text.replace(/[^\d]/g, '') }))
                      }
                      keyboardType="number-pad"
                      placeholder="12000000"
                      placeholderTextColor={colors.shellTextSoft}
                      style={styles.textField}
                    />
                  </View>
                  <View style={styles.fieldStackHalf}>
                    <Text style={styles.fieldLabel}>{t('debt.form.monthlyInstallment')}</Text>
                    <TextInput
                      value={debtForm.monthlyInstallment}
                      onChangeText={(text) =>
                        setDebtForm((current) => ({
                          ...current,
                          monthlyInstallment: text.replace(/[^\d]/g, ''),
                        }))
                      }
                      keyboardType="number-pad"
                      placeholder="1000000"
                      placeholderTextColor={colors.shellTextSoft}
                      style={styles.textField}
                    />
                  </View>
                </View>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>{t('debt.form.dueDate')}</Text>
                  <TextInput
                    value={debtForm.dueDate}
                    onChangeText={(text) => setDebtForm((current) => ({ ...current, dueDate: text }))}
                    placeholder="2026-04-16"
                    placeholderTextColor={colors.shellTextSoft}
                    style={styles.textField}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.formStack}>
                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>{t('debt.form.targetDebt')}</Text>
                  <View style={styles.debtChipGrid}>
                    {debts.map((debt) => {
                      const isSelectedDebt = debt.id === (selectedDebtId ?? debts[0]?.id);

                      return (
                        <Pressable
                          key={debt.id}
                          onPress={() => setSelectedDebtId(debt.id)}
                          style={[styles.debtChip, isSelectedDebt && styles.debtChipSelected]}>
                          <Text style={[styles.debtChipText, isSelectedDebt && styles.debtChipTextSelected]}>
                            {debt.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldStackHalf}>
                    <Text style={styles.fieldLabel}>{t('debt.form.amount')}</Text>
                    <TextInput
                      value={paymentForm.amount}
                      onChangeText={(text) =>
                        setPaymentForm((current) => ({ ...current, amount: text.replace(/[^\d]/g, '') }))
                      }
                      keyboardType="number-pad"
                      placeholder="1000000"
                      placeholderTextColor={colors.shellTextSoft}
                      style={styles.textField}
                    />
                  </View>
                  <View style={styles.fieldStackHalf}>
                    <Text style={styles.fieldLabel}>{t('debt.form.paymentDate')}</Text>
                    <TextInput
                      value={paymentForm.paymentDate}
                      onChangeText={(text) => setPaymentForm((current) => ({ ...current, paymentDate: text }))}
                      placeholder="2026-04-16"
                      placeholderTextColor={colors.shellTextSoft}
                      style={styles.textField}
                    />
                  </View>
                </View>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>{t('debt.form.proofImage')}</Text>
                  <Pressable onPress={pickProofImage} style={styles.uploadButton}>
                    <MaterialCommunityIcons name="paperclip" size={16} color={colors.onPrimary} />
                    <Text style={styles.uploadButtonText}>
                      {paymentForm.proofName ? t('debt.form.changeProof') : t('debt.form.chooseProof')}
                    </Text>
                  </Pressable>
                  <Text style={styles.uploadHint}>
                    {paymentForm.proofName ? paymentForm.proofName : t('debt.form.noProofSelected')}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable onPress={closeForm} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </Pressable>

              <Pressable
                onPress={formMode === 'create' ? submitDebtForm : submitPaymentForm}
                disabled={formSubmitting}
                style={({ pressed }) => [
                  styles.confirmButton,
                  pressed && styles.confirmButtonPressed,
                  formSubmitting && styles.confirmButtonDisabled,
                ]}>
                {formSubmitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {formMode === 'create' ? t('debt.form.createSubmit') : t('debt.form.paymentSubmit')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {(loading || detailLoading) && !debts.length ? null : (
        <Pressable style={styles.fab} onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={18} color={colors.shellFabIcon} />
        </Pressable>
      )}
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
  tone: StatusTone;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <View style={[metricStyles(colors).card, metricToneStyles(colors, tone).card]}>
      <View style={[metricStyles(colors).iconWrap, metricToneStyles(colors, tone).iconWrap]}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={metricToneStyles(colors, tone).iconColor}
        />
      </View>
      <Text style={metricStyles(colors).label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={metricStyles(colors).value}>
        {value}
      </Text>
      <Text style={metricStyles(colors).meta}>{meta}</Text>
    </View>
  );
}

function MiniStat({
  colors,
  label,
  value,
}: {
  colors: AppColorTheme;
  label: string;
  value: string;
}) {
  return (
    <View style={miniStatStyles(colors).card}>
      <Text style={miniStatStyles(colors).label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={miniStatStyles(colors).value}>
        {value}
      </Text>
    </View>
  );
}

function StatusChip({
  colors,
  tone,
  label,
}: {
  colors: AppColorTheme;
  tone: StatusTone;
  label: string;
}) {
  return (
    <View style={[chipStyles(colors).chip, chipToneStyles(colors, tone).chip]}>
      <Text style={[chipStyles(colors).label, chipToneStyles(colors, tone).label]}>{label}</Text>
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
    heroCard: {
      borderRadius: 30,
      backgroundColor: colors.primary,
      padding: compact ? 20 : 22,
      gap: 16,
    },
    heroTopRow: {
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
    heroAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 14,
      backgroundColor: alpha(colors.onPrimary, 0.14),
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    heroActionText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    heroTitle: {
      color: colors.onPrimary,
      fontSize: compact ? 30 : 34,
      lineHeight: compact ? 36 : 40,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    heroSubtitle: {
      color: alpha(colors.onPrimary, 0.88),
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    heroAmountRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroAmountCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    heroAmountLabel: {
      color: alpha(colors.onPrimary, 0.78),
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2,
    },
    heroAmount: {
      color: colors.onPrimary,
      fontSize: compact ? 38 : 44,
      lineHeight: compact ? 42 : 48,
      fontWeight: '900',
      letterSpacing: -1.8,
    },
    heroRatioShell: {
      minWidth: 80,
      borderRadius: 20,
      backgroundColor: alpha(colors.onPrimary, 0.12),
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    },
    heroRatioValue: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    heroMeta: {
      color: alpha(colors.onPrimary, 0.82),
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroActionRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    heroSecondaryAction: {
      flexGrow: 1,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: alpha(colors.onPrimary, 0.14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: alpha(colors.onPrimary, 0.14),
    },
    heroSecondaryActionMuted: {
      flexGrow: 1,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: alpha(colors.secondaryAccent, 0.14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: alpha(colors.secondaryAccent, 0.18),
    },
    heroSecondaryActionText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    summarySection: {
      gap: 12,
    },
    sectionLabel: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 3,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    listSection: {
      gap: 14,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    sectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 24,
      lineHeight: compact ? 28 : 30,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    sectionHeaderMeta: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    loadingState: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      paddingVertical: 46,
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
    emptyBody: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
    },
    debtList: {
      gap: 12,
    },
    debtCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: compact ? 16 : 18,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    debtCardSelected: {
      borderColor: alpha(colors.primary, 0.4),
      backgroundColor: colors.shellCardStrong,
    },
    debtCardPressed: {
      transform: [{ scale: 0.99 }],
    },
    debtCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    debtCardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    debtCardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    debtName: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    debtMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    debtValue: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 18 : 20,
      lineHeight: compact ? 22 : 24,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    debtCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    debtFooterText: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    detailCard: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      padding: compact ? 18 : 20,
      gap: 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    detailTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    detailIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    detailHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    detailKicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    detailTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 24 : 26,
      lineHeight: compact ? 30 : 32,
      fontWeight: '900',
      letterSpacing: -1,
    },
    detailSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    detailStatsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    progressPanel: {
      borderRadius: 22,
      backgroundColor: colors.shellCardMuted,
      padding: 16,
      gap: 10,
    },
    progressPanelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    progressPanelLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    progressPanelValue: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      fontWeight: '900',
    },
    progressTrackLarge: {
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.shellCard,
      overflow: 'hidden',
    },
    progressFillLarge: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    progressFootRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    progressFootText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    primaryAction: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
    },
    primaryActionPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    primaryActionDisabled: {
      opacity: 0.75,
    },
    primaryActionText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    timelineSection: {
      gap: 12,
    },
    timelineTitle: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    timelineList: {
      gap: 10,
    },
    timelineItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      padding: 14,
    },
    timelineItemPressed: {
      backgroundColor: colors.shellCardMuted,
    },
    timelineDot: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.08),
    },
    timelineDotSuccess: {
      backgroundColor: alpha(colors.secondaryAccent, 0.14),
    },
    timelineDotDanger: {
      backgroundColor: alpha(colors.danger, 0.12),
    },
    timelineCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    timelineItemTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    timelineItemMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    timelineRight: {
      alignItems: 'flex-end',
      gap: 6,
    },
    timelineAmount: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '900',
    },
    statusChipInline: {
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextPrimary, 0.08),
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    statusChipInlineSuccess: {
      backgroundColor: alpha(colors.secondaryAccent, 0.14),
    },
    statusChipInlineDanger: {
      backgroundColor: alpha(colors.danger, 0.12),
    },
    statusChipInlineText: {
      color: colors.shellTextMuted,
      fontSize: 9,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    statusChipInlineTextSuccess: {
      color: colors.secondary,
    },
    statusChipInlineTextDanger: {
      color: colors.danger,
    },
    paymentList: {
      gap: 10,
    },
    paymentItem: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    paymentIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.secondaryAccent, 0.12),
    },
    paymentCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    paymentTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    paymentMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    paymentProof: {
      maxWidth: 108,
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '700',
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
    modalBackdrop: {
      flex: 1,
      backgroundColor: alpha(colors.inverseSurface, 0.56),
      justifyContent: 'flex-end',
    },
    modalSheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.shellCard,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: Math.max(18, Math.round(topInset * 0.5)),
      gap: 16,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalHandle: {
      alignSelf: 'center',
      width: 52,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.shellCardMuted,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
    },
    modalHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    modalKicker: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    modalTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 24 : 26,
      lineHeight: compact ? 30 : 32,
      fontWeight: '900',
      letterSpacing: -1,
    },
    modalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    modalClose: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
    formError: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    formStack: {
      gap: 14,
    },
    fieldStack: {
      gap: 8,
    },
    fieldStackHalf: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: 10,
    },
    fieldLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    textField: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '600',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    debtChipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    debtChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    debtChipSelected: {
      backgroundColor: alpha(colors.primary, 0.12),
      borderColor: alpha(colors.primary, 0.28),
    },
    debtChipText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    debtChipTextSelected: {
      color: colors.primary,
    },
    uploadButton: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    uploadButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    uploadHint: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 4,
    },
    cancelButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    cancelButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    confirmButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    confirmButtonPressed: {
      opacity: 0.92,
    },
    confirmButtonDisabled: {
      opacity: 0.72,
    },
    confirmButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
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

const metricToneStyles = (colors: AppColorTheme, tone: StatusTone) => {
  const palette = {
    danger: {
      card: { backgroundColor: alpha(colors.danger, 0.08) },
      iconWrap: { backgroundColor: alpha(colors.danger, 0.14) },
      iconColor: colors.danger,
    },
    success: {
      card: { backgroundColor: alpha(colors.secondaryAccent, 0.08) },
      iconWrap: { backgroundColor: alpha(colors.secondaryAccent, 0.16) },
      iconColor: colors.secondary,
    },
    warning: {
      card: { backgroundColor: alpha(colors.warning, 0.08) },
      iconWrap: { backgroundColor: alpha(colors.warning, 0.14) },
      iconColor: colors.warning,
    },
    neutral: {
      card: { backgroundColor: colors.shellCard },
      iconWrap: { backgroundColor: colors.shellCardMuted },
      iconColor: colors.primary,
    },
  } as const;

  return palette[tone];
};

const miniStatStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      flexBasis: '48%',
      flexGrow: 1,
      minWidth: 132,
      borderRadius: 18,
      backgroundColor: colors.shellCardMuted,
      padding: 14,
      gap: 6,
    },
    label: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    value: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
  });

const chipStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    chip: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.shellCardMuted,
    },
    label: {
      color: colors.shellTextMuted,
      fontSize: 9,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  });

const chipToneStyles = (colors: AppColorTheme, tone: StatusTone) => {
  const palette = {
    danger: {
      chip: { backgroundColor: alpha(colors.danger, 0.12) },
      label: { color: colors.danger },
    },
    success: {
      chip: { backgroundColor: alpha(colors.secondaryAccent, 0.14) },
      label: { color: colors.secondary },
    },
    warning: {
      chip: { backgroundColor: alpha(colors.warning, 0.14) },
      label: { color: colors.warning },
    },
    neutral: {
      chip: { backgroundColor: colors.shellCardMuted },
      label: { color: colors.shellTextMuted },
    },
  } as const;

  return palette[tone];
};
