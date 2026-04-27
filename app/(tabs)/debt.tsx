import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DebtSkeleton } from '@/components/ui/skeleton';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { ApiRequestError } from '@/lib/api/auth';
import { buildAssetUrl } from '@/constants/api';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import {
  createDebt,
  createDebtPayment,
  deleteDebt,
  getDebtDetail,
  getDebtInstallments,
  getDebtPayments,
  listDebts,
  updateDebt,
  updateDebtPayment,
  type DebtDetail,
  type DebtPaymentRecord,
  type DebtRecord,
  type InstallmentRecord,
} from '@/lib/api/debts';
import { listWallets, type WalletRecord } from '@/lib/api/wallets';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';

type StatusTone = 'danger' | 'success' | 'warning' | 'neutral';
type DebtFormMode = 'create' | 'edit' | 'payment' | 'payment-edit';

type DebtFormState = {
  name: string;
  totalAmount: string;
  monthlyInstallment: string;
  dueDate: string;
};

type PaymentFormState = {
  walletId: number | null;
  amount: string;
  paymentDate: string;
  proofName: string;
  proofUri: string;
  proofType: string;
  existingProofName: string;
  existingProofUri: string;
};

type OpenPaymentFormOptions = {
  debtId?: number;
  locked?: boolean;
  amount?: string;
  paymentDate?: string;
};

type DebtCacheState = {
  debts: DebtRecord[];
  selectedDebtId: number | null;
  selectedDebt: DebtDetail | null;
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
    maximumFractionDigits: 0,
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

const createDebtFormFromRecord = (debt: DebtRecord | DebtDetail): DebtFormState => ({
  name: debt.name ?? '',
  totalAmount: formatRupiahInput(String(toNumber(debt.total_amount))),
  monthlyInstallment: formatRupiahInput(String(toNumber(debt.monthly_installment))),
  dueDate: parseDate(debt.due_date)?.toISOString().slice(0, 10) ?? getTodayInputValue(),
});

const createEmptyPaymentForm = (): PaymentFormState => ({
  walletId: null,
  amount: '',
  paymentDate: getTodayInputValue(),
  proofName: '',
  proofUri: '',
  proofType: '',
  existingProofName: '',
  existingProofUri: '',
});

const sanitizeCurrencyInput = (value: string) => value.replace(/[^\d]/g, '');

const parseCurrencyInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  return normalized ? Number(normalized) : 0;
};

const toPlainAmountString = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  return normalized ? String(Number(normalized)) : '0';
};

const formatRupiahInput = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  if (!normalized) {
    return '';
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Number(normalized));
};

const getFileBadgeLabel = (proofName: string, proofType: string) => {
  const extension = proofName.split('.').pop()?.trim();
  if (extension) {
    return extension.slice(0, 4).toUpperCase();
  }

  if (proofType.startsWith('image/')) {
    return proofType.replace('image/', '').slice(0, 4).toUpperCase();
  }

  return 'FILE';
};

const getFileNameFromPathOrUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const clean = trimmed.split('?')[0].split('#')[0];
  return clean.split('/').filter(Boolean).pop() ?? clean;
};

const resolveApiMessage = (error: unknown, fallback: string) =>
  error instanceof ApiRequestError && error.message ? error.message : fallback;

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

const isMainWalletName = (value?: string | null) => value?.trim().toLowerCase() === 'main';

export default function DebtScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isLight = colorScheme === 'light';
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const styles = createStyles(colors, compact, insets.top, insets.bottom);

  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null);
  const selectedDebtIdRef = useRef<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const detailCardRef = useRef<View>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setDetailLoading] = useState(false);
  const [submittingInstallmentId, setSubmittingInstallmentId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<DebtFormMode>('create');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [debtForm, setDebtForm] = useState<DebtFormState>(createEmptyDebtForm);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(createEmptyPaymentForm);
  const [paymentTargetDebtId, setPaymentTargetDebtId] = useState<number | null>(null);
  const [paymentTargetLocked, setPaymentTargetLocked] = useState(false);
  const [paymentEditingId, setPaymentEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [iosPaymentDatePickerVisible, setIosPaymentDatePickerVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [showPaidDebts, setShowPaidDebts] = useState(false);
  const [proofViewerVisible, setProofViewerVisible] = useState(false);
  const [proofViewerUri, setProofViewerUri] = useState('');
  const [proofViewerLoading, setProofViewerLoading] = useState(false);
  const [proofViewerError, setProofViewerError] = useState('');
  const keyboardOpen = keyboardHeight > 0;
  const modalLift = keyboardOpen ? Math.max(18, keyboardHeight - insets.bottom + 10) : 0;
  const hasDebtSnapshot = Boolean(debts.length || selectedDebt);

  useEffect(() => {
    let active = true;

    const hydrateDebtCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const cached = await readScreenCache<DebtCacheState>(buildScreenCacheKey('debt', session.user.id));

      if (!cached || !active) {
        return;
      }

      setDebts(cached.data.debts);
      setSelectedDebtId(null);
      setSelectedDebt(null);
      setLoading(false);
    };

    hydrateDebtCache();

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
        const nextDetail = {
          ...baseDetail,
          installments: installmentResponse.Data ?? baseDetail.installments ?? [],
          payments: paymentResponse.Data ?? baseDetail.payments ?? [],
        };

        setSelectedDebt(nextDetail);
        return nextDetail;
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setDetailError(t('debt.partialError'));
          if (!isRefresh) {
            setSelectedDebt(null);
          }
        }

        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [t, withAuthorizedRequest]
  );

  const loadDebts = useCallback(
    async (isRefresh = false, preferredDebtId: number | null = null) => {
      const shouldShowSkeleton = !isRefresh && !hasDebtSnapshot;

      if (isRefresh) {
        setRefreshing(true);
      } else if (shouldShowSkeleton) {
        setLoading(true);
      }

      setError('');

      try {
        const session = await getAuthSession();
        if (!session) {
          router.replace('/login');
          return;
        }

        const [debtResponse, walletResponse] = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([listDebts(accessToken), listWallets(accessToken)])
        );
        if (debtResponse.status !== 'fulfilled') {
          throw new Error('load_failed');
        }
        const nextDebts = debtResponse.value.Data ?? [];
        setDebts(nextDebts);
        setWallets(walletResponse.status === 'fulfilled' ? walletResponse.value.Data ?? [] : []);

        const nextSelectedId =
          preferredDebtId && nextDebts.some((debt) => debt.id === preferredDebtId)
            ? preferredDebtId
            : null;

        setSelectedDebtId(nextSelectedId);

        let nextSelectedDebt: DebtDetail | null = null;
        if (nextSelectedId) {
          nextSelectedDebt = await loadDebtDetail(nextSelectedId, isRefresh);
        } else {
          setSelectedDebt(null);
        }

        await writeScreenCache(buildScreenCacheKey('debt', session.user.id), {
          debts: nextDebts,
          selectedDebtId: nextSelectedId,
          selectedDebt: nextSelectedDebt,
        });
      } catch (err) {
        if (!(err instanceof Error && err.message === 'missing_session')) {
          setError(t('debt.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hasDebtSnapshot, loadDebtDetail, t, withAuthorizedRequest]
  );

  useEffect(() => {
    selectedDebtIdRef.current = selectedDebtId;
  }, [selectedDebtId]);

  useFocusEffect(
    useCallback(() => {
      selectedDebtIdRef.current = null;
      setSelectedDebtId(null);
      setSelectedDebt(null);
      loadDebts(false, null);
    }, [loadDebts])
  );

  useEffect(() => {
    if (!formVisible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [formVisible]);

  const onRefresh = useCallback(() => {
    loadDebts(true, selectedDebtId);
  }, [loadDebts, selectedDebtId]);

  const selectDebt = useCallback(
    (debtId: number) => {
      if (selectedDebtId === debtId) {
        setSelectedDebtId(null);
        setSelectedDebt(null);
        return;
      }

      setSelectedDebtId(debtId);
      loadDebtDetail(debtId);

      setTimeout(() => {
        detailCardRef.current?.measureLayout(
          scrollRef.current as any,
          (x, y) => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
          },
          () => {}
        );
      }, 300);
    },
    [loadDebtDetail, selectedDebtId]
  );

  const handleMarkPaid = useCallback(
    (installment: InstallmentRecord) => {
      const targetDebtId = installment.debt_id || selectedDebtId || debts[0]?.id || null;
      if (!targetDebtId) {
        return;
      }

      setSubmittingInstallmentId(installment.id);
      openPaymentForm({
        debtId: targetDebtId,
        locked: true,
        amount: formatRupiahInput(String(toNumber(installment.amount))),
      });
    },
    [debts, openPaymentForm, selectedDebtId]
  );

  const closeForm = useCallback(() => {
    setFormVisible(false);
    setFormError('');
    setDebtForm(createEmptyDebtForm());
    setPaymentForm(createEmptyPaymentForm());
    setPaymentTargetDebtId(null);
    setPaymentTargetLocked(false);
    setPaymentEditingId(null);
    setIosPaymentDatePickerVisible(false);
    setSubmittingInstallmentId(null);
  }, []);

  const openCreateDebtForm = useCallback(() => {
    setFormMode('create');
    setFormVisible(true);
    setFormError('');
    setDebtForm(createEmptyDebtForm());
  }, []);

  const openEditDebtForm = useCallback(() => {
    if (!selectedDebt) {
      return;
    }

    setFormMode('edit');
    setFormVisible(true);
    setFormError('');
    setDebtForm(createDebtFormFromRecord(selectedDebt));
  }, [selectedDebt]);

  const openPaymentForm = useCallback((options: OpenPaymentFormOptions = {}) => {
    const targetDebtId = options.debtId ?? selectedDebtId ?? debts[0]?.id ?? null;
    setFormMode('payment');
    setFormVisible(true);
    setFormError('');
    setPaymentTargetDebtId(targetDebtId);
    setPaymentTargetLocked(Boolean(options.locked));
    setPaymentEditingId(null);
    if (targetDebtId) {
      setSelectedDebtId(targetDebtId);
    }
    setPaymentForm((current) => ({
      ...createEmptyPaymentForm(),
      amount:
        options.amount ||
        current.amount ||
        formatRupiahInput(
          String(
            selectedDebt
              ? Math.min(
                  Math.max(0, toNumber(selectedDebt.remaining_amount)),
                  Math.max(0, toNumber(selectedDebt.monthly_installment))
                ) || Math.max(0, toNumber(selectedDebt.remaining_amount))
              : 0
          )
        ),
      paymentDate: options.paymentDate || current.paymentDate || getTodayInputValue(),
    }));
  }, [debts, selectedDebt, selectedDebtId]);

  const openEditPaymentForm = useCallback(
    (payment: DebtPaymentRecord) => {
      const targetDebtId = payment.debt_id ?? selectedDebtId ?? debts[0]?.id ?? null;
      setFormMode('payment-edit');
      setFormVisible(true);
      setFormError('');
      setPaymentTargetDebtId(targetDebtId);
      setPaymentTargetLocked(true);
      setPaymentEditingId(payment.id);
      if (targetDebtId) {
        setSelectedDebtId(targetDebtId);
      }

      setPaymentForm({
        ...createEmptyPaymentForm(),
        walletId:
          payment.wallet_id && Number(payment.wallet_id) > 0 ? Number(payment.wallet_id) : null,
        amount: formatRupiahInput(String(toNumber(payment.amount))),
        paymentDate: parseDate(payment.payment_date)?.toISOString().slice(0, 10) ?? getTodayInputValue(),
        existingProofName: getFileNameFromPathOrUrl(payment.proof_image),
        existingProofUri: payment.proof_image,
      });
    },
    [debts, selectedDebtId]
  );

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

  const clearProofSelection = useCallback(() => {
    setPaymentForm((current) => ({
      ...current,
      proofName: '',
      proofUri: '',
      proofType: '',
    }));
  }, []);

  const handlePaymentDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (selectedDate) {
        setPaymentForm((current) => ({ ...current, paymentDate: selectedDate.toISOString().slice(0, 10) }));
      }

      if (Platform.OS === 'ios') {
        setIosPaymentDatePickerVisible(false);
      }
    },
    []
  );

  const openPaymentDatePicker = useCallback(() => {
    const currentDate = paymentForm.paymentDate ? new Date(`${paymentForm.paymentDate}T00:00:00`) : new Date();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        onChange: handlePaymentDateChange,
      });
      return;
    }

    setIosPaymentDatePickerVisible(true);
  }, [handlePaymentDateChange, paymentForm.paymentDate]);

  const submitDebtForm = useCallback(async () => {
    setFormError('');

    const trimmedName = debtForm.name.trim();
    const totalAmount = parseCurrencyInput(debtForm.totalAmount);
    const monthlyInstallment = parseCurrencyInput(debtForm.monthlyInstallment);

    if (!trimmedName || !Number.isFinite(totalAmount) || !Number.isFinite(monthlyInstallment) || totalAmount <= 0 || monthlyInstallment <= 0) {
      setFormError(t('debt.form.invalidDebt'));
      return;
    }

    setFormSubmitting(true);

    try {
      if (formMode === 'edit' && selectedDebtId) {
        await withAuthorizedRequest((accessToken) =>
          updateDebt(accessToken, selectedDebtId, {
            name: trimmedName,
            total_amount: totalAmount,
            monthly_installment: monthlyInstallment,
            due_date: toApiDate(debtForm.dueDate),
          })
        );
      } else {
        await withAuthorizedRequest((accessToken) =>
          createDebt(accessToken, {
            name: trimmedName,
            total_amount: totalAmount,
            monthly_installment: monthlyInstallment,
            due_date: toApiDate(debtForm.dueDate),
          })
        );
      }

      closeForm();
      await loadDebts(true, formMode === 'edit' ? selectedDebtId : null);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'missing_session')) {
        setFormError(resolveApiMessage(err, t('debt.saveError')));
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
    formMode,
    loadDebts,
    selectedDebtId,
    t,
    withAuthorizedRequest,
  ]);

  const submitPaymentForm = useCallback(async () => {
    setFormError('');

    const targetDebtId = paymentTargetDebtId ?? selectedDebtId ?? debts[0]?.id ?? null;
    const amount = parseCurrencyInput(paymentForm.amount);
    const isEditPayment = formMode === 'payment-edit';
    const hasNewProof = Boolean(paymentForm.proofUri);

    if (!targetDebtId || !Number.isFinite(amount) || amount <= 0 || (!isEditPayment && !hasNewProof)) {
      setFormError(t('debt.form.invalidPayment'));
      return;
    }
    if (isEditPayment && !paymentEditingId) {
      setFormError(t('debt.form.invalidPayment'));
      return;
    }

    setFormSubmitting(true);

    try {
      const formData = new FormData();
      const selectedPaymentWallet = paymentForm.walletId ? walletMap.get(paymentForm.walletId) : null;
      if (selectedPaymentWallet && !isMainWalletName(selectedPaymentWallet.name)) {
        formData.append('wallet_id', String(selectedPaymentWallet.id));
      }
      formData.append('amount', toPlainAmountString(paymentForm.amount));
      formData.append('payment_date', toApiDate(paymentForm.paymentDate));

      if (hasNewProof) {
        formData.append(
          'proof_image',
          {
            uri: paymentForm.proofUri,
            name: paymentForm.proofName || `payment-proof-${Date.now()}.jpg`,
            type: paymentForm.proofType || 'image/jpeg',
          } as never
        );
      }

      if (isEditPayment && paymentEditingId) {
        await withAuthorizedRequest((accessToken) =>
          updateDebtPayment(accessToken, targetDebtId, paymentEditingId, formData)
        );
      } else {
        await withAuthorizedRequest((accessToken) => createDebtPayment(accessToken, targetDebtId, formData));
      }

      closeForm();
      setSelectedDebtId(targetDebtId);
      await loadDebtDetail(targetDebtId, true);
      await loadDebts(true, targetDebtId);
    } catch (err) {
      if (!(err instanceof Error && err.message === 'missing_session')) {
        setFormError(resolveApiMessage(err, t('debt.saveError')));
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
    paymentForm.walletId,
    paymentForm.proofName,
    paymentForm.proofType,
    paymentForm.proofUri,
    paymentEditingId,
    formMode,
    walletMap,
    paymentTargetDebtId,
    selectedDebtId,
    t,
    withAuthorizedRequest,
  ]);

  const handleDeleteDebt = useCallback(() => {
    if (!selectedDebt) {
      return;
    }

    Alert.alert(t('debt.deleteConfirmTitle'), t('debt.deleteConfirmMessage', { name: selectedDebt.name }), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('debt.deleteDebt'),
        style: 'destructive',
        onPress: async () => {
          setDetailError('');
          try {
            await withAuthorizedRequest((accessToken) => deleteDebt(accessToken, selectedDebt.id));
            await loadDebts(true);
          } catch (err) {
            if (!(err instanceof Error && err.message === 'missing_session')) {
              setDetailError(resolveApiMessage(err, t('debt.deleteError')));
            }
          }
        },
      },
    ]);
  }, [loadDebts, selectedDebt, t, withAuthorizedRequest]);

  const overview = useMemo(() => {
    const totalDebt = getTotalAmount(debts, (debt) => toNumber(debt.total_amount));
    const remaining = getTotalAmount(debts, (debt) => toNumber(debt.remaining_amount));
    const paid = getTotalAmount(debts, (debt) => toNumber(debt.paid_amount));
    const dueSoon = getDueSoonCount(debts);
    const overdue = getOverdueCount(debts);
    const activeDebts = debts.filter((debt) => {
      const isPaid = debt.status === 'paid' || debt.status === 'completed';
      const isFullyPaid = toNumber(debt.remaining_amount) <= 0;
      return !isPaid && !isFullyPaid;
    }).length;
    const utilization = totalDebt > 0 ? Math.round((paid / totalDebt) * 100) : 0;

    return { totalDebt, remaining, paid, dueSoon, overdue, activeDebts, utilization };
  }, [debts]);

  const activeDebts = useMemo(() => debts.filter((debt) => {
    const isPaid = debt.status === 'paid' || debt.status === 'completed';
    const isFullyPaid = toNumber(debt.remaining_amount) <= 0;
    return !isPaid && !isFullyPaid;
  }), [debts]);
  const paidDebts = useMemo(() => debts.filter((debt) => {
    const isPaid = debt.status === 'paid' || debt.status === 'completed';
    const isFullyPaid = toNumber(debt.remaining_amount) <= 0;
    return isPaid || isFullyPaid;
  }), [debts]);
  const displayDebts = showPaidDebts ? paidDebts : activeDebts;
  const searchTerm = searchQuery.trim().toLowerCase();
  const searchActive = searchTerm.length > 0;
  const visibleDebts = useMemo(
    () =>
      searchTerm
        ? displayDebts.filter((debt) => {
          const haystack = `${debt.name} ${debt.status} ${debt.due_date} ${debt.total_amount} ${debt.remaining_amount}`.toLowerCase();
          return haystack.includes(searchTerm);
        })
        : displayDebts,
    [displayDebts, searchTerm]
  );
  const selected = selectedDebt ?? null;
  const selectedVisible = useMemo(() => {
    if (!selected) {
      return false;
    }

    if (!searchActive) {
      return true;
    }

    return visibleDebts.some((debt) => debt.id === selected.id);
  }, [searchActive, selected, visibleDebts]);
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
  const modalAccent = formMode === 'payment' || formMode === 'payment-edit' ? colors.secondary : colors.primary;
  const paymentTarget = useMemo<DebtRecord | DebtDetail | null>(() => {
    const targetId = paymentTargetDebtId ?? selectedDebtId ?? debts[0]?.id ?? null;
    if (targetId === null) {
      return selected ?? debts[0] ?? null;
    }

    return debts.find((debt) => debt.id === targetId) ?? selected ?? debts[0] ?? null;
  }, [debts, paymentTargetDebtId, selected, selectedDebtId]);
  const walletOptions = useMemo(() => [...wallets].sort((left, right) => left.name.localeCompare(right.name)), [wallets]);
  const selectableWalletOptions = useMemo(
    () => walletOptions.filter((wallet) => !isMainWalletName(wallet.name)),
    [walletOptions]
  );
  const walletMap = useMemo(
    () => new Map(walletOptions.map((wallet) => [wallet.id, wallet] as const)),
    [walletOptions]
  );
  const mainWallet = useMemo(() => walletOptions.find((wallet) => isMainWalletName(wallet.name)), [walletOptions]);
  const mainWalletBalance = mainWallet ? Number(mainWallet.balance ?? 0) : 0;
  const selectedPaymentWalletLabel =
    paymentForm.walletId && walletMap.has(paymentForm.walletId)
      ? walletMap.get(paymentForm.walletId)?.name ?? t('debt.form.walletDefault')
      : t('debt.form.walletDefault');
  const createTotalValue = parseCurrencyInput(debtForm.totalAmount);
  const createInstallmentValue = parseCurrencyInput(debtForm.monthlyInstallment);
  const paymentAmountValue = parseCurrencyInput(paymentForm.amount);
  const createTotalPreview =
    Number.isFinite(createTotalValue) && createTotalValue > 0 ? formatCurrency(createTotalValue, locale) : 'IDR 0';
  const createInstallmentPreview =
    Number.isFinite(createInstallmentValue) && createInstallmentValue > 0
      ? formatCurrency(createInstallmentValue, locale)
      : 'IDR 0';
  const paymentAmountPreview =
    Number.isFinite(paymentAmountValue) && paymentAmountValue > 0 ? formatCurrency(paymentAmountValue, locale) : 'IDR 0';
  const paymentTargetRemaining = toNumber(paymentTarget?.remaining_amount);
  const paymentTargetInstallment = toNumber(paymentTarget?.monthly_installment);
  const paymentTargetStatus = paymentTarget ? toStatusLabel(paymentTarget.status, t) : '';
  const isPaymentForm = formMode === 'payment' || formMode === 'payment-edit';
  const isPaymentEditForm = formMode === 'payment-edit';
  const hasStoredProof = Boolean(paymentForm.existingProofUri);
  const hasNewProof = Boolean(paymentForm.proofUri);
  const selectedProofUri = paymentForm.proofUri || paymentForm.existingProofUri;
  const selectedProofName = paymentForm.proofUri ? paymentForm.proofName : paymentForm.existingProofName;
  const selectedProofType = paymentForm.proofUri ? paymentForm.proofType : '';
  const proofSelected = Boolean(selectedProofUri);
  const proofBadgeLabel = getFileBadgeLabel(selectedProofName, selectedProofType);
  const showInitialSkeleton = loading && !debts.length && !selected;

  return (
    <View style={styles.root}>
      <ScrollView
        stickyHeaderIndices={[1]}
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        {showInitialSkeleton ? (
          <DebtSkeleton colors={colors} />
        ) : (
          <>
        <View style={[styles.heroCard, searchActive && styles.collapsedSection]}>
          {!searchActive ? (
            <>
              <View style={styles.heroTopRow}>
                <View style={styles.heroBadge}>
                  <MaterialCommunityIcons name="wallet-outline" size={14} color={colors.secondaryAccent} />
                  <Text style={styles.heroBadgeText}>{t('debt.kicker')}</Text>
                </View>
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
                <Pressable onPress={() => setShowPaidDebts(!showPaidDebts)} style={styles.heroSecondaryActionMuted}>
                  <MaterialCommunityIcons name={showPaidDebts ? 'format-list-bulleted' : 'history'} size={16} color={colors.onPrimary} />
                  <Text style={styles.heroSecondaryActionText}>
                    {showPaidDebts ? t('debt.activeDebts') : t('debt.debtHistory')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.searchShell}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.shellTextMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('debt.searchPlaceholder')}
            placeholderTextColor={colors.shellTextSoft}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchActive ? (
            <Pressable onPress={() => setSearchQuery('')} style={styles.searchClearButton}>
              <MaterialCommunityIcons name="close" size={18} color={colors.shellTextMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.summarySection, searchActive && styles.collapsedSection]}>
          {!searchActive ? (
            <>
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
            </>
          ) : null}
        </View>

        <View style={styles.listSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionLabel}>{t('debt.selectedDebt')}</Text>
              <Text style={styles.sectionTitle}>{t('debt.installmentSchedule')}</Text>
            </View>
              {!!visibleDebts.length && (
                <Text style={styles.sectionHeaderMeta}>{visibleDebts.length} items</Text>
              )}
            </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('debt.loading')}</Text>
            </View>
          ) : visibleDebts.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name={showPaidDebts ? "history" : "wallet-outline"} size={22} color={colors.primary} />
              <Text style={styles.emptyTitle}>
                {searchTerm ? t('debt.searchEmptyTitle') : showPaidDebts ? t('debt.noPaidDebts') : t('debt.emptyTitle')}
              </Text>
              {searchTerm ? <Text style={styles.emptyBody}>{t('debt.searchEmptyBody')}</Text> : null}
            </View>
          ) : (
            <View style={styles.debtList}>
              {visibleDebts.map((debt) => {
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
                          <View style={styles.debtCardBadgeStack}>
                            <StatusChip colors={colors} tone={tone} label={toStatusLabel(debt.status, t)} />
                          </View>
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
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          Alert.alert(
                            t('debt.deleteConfirmTitle'),
                            t('debt.deleteConfirmMessage', { name: debt.name }),
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('debt.deleteDebt'),
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await withAuthorizedRequest((accessToken) => deleteDebt(accessToken, debt.id));
                                    await loadDebts(true);
                                  } catch {}
                                },
                              },
                            ]
                          );
                        }}
                        style={styles.debtCardDeleteButton}>
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {selectedVisible && selected ? (
          <View ref={detailCardRef} style={styles.detailCard}>
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

            <View style={styles.detailActions}>
              <Pressable onPress={openEditDebtForm} style={styles.detailActionButton}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
                <Text style={styles.detailActionText}>{t('debt.editDebt')}</Text>
              </Pressable>
              <Pressable onPress={handleDeleteDebt} style={[styles.detailActionButton, styles.detailActionDanger]}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                <Text style={[styles.detailActionText, styles.detailActionDangerText]}>{t('debt.deleteDebt')}</Text>
              </Pressable>
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
                  {selected.payments.map((payment: DebtPaymentRecord) => {
                    const paymentWalletLabel =
                      payment.wallet_id && walletMap.has(Number(payment.wallet_id))
                        ? walletMap.get(Number(payment.wallet_id))?.name ?? t('debt.form.walletDefault')
                        : t('debt.form.walletDefault');

                    return (
                      <View key={payment.id} style={styles.paymentItem}>
                        <View style={styles.paymentIconWrap}>
                          <MaterialCommunityIcons name="receipt-text-outline" size={16} color={colors.secondaryAccent} />
                        </View>
                        <View style={styles.paymentCopy}>
                          <Text style={styles.paymentTitle}>{formatCurrency(toNumber(payment.amount), locale)}</Text>
                          <Text style={styles.paymentMeta}>
                            {formatDayLabel(payment.payment_date, locale)} | {paymentWalletLabel}
                          </Text>
                        </View>
                        <View style={styles.paymentActionGroup}>
                          {payment.proof_image ? (
                            <Pressable
                              onPress={() => {
                                setProofViewerUri(buildAssetUrl(payment.proof_image));
                                setProofViewerError('');
                                setProofViewerLoading(true);
                                setProofViewerVisible(true);
                              }}
                              style={styles.paymentActionButton}>
                              <MaterialCommunityIcons name="image-outline" size={14} color={colors.primary} />
                              <Text style={styles.paymentActionButtonText}>{t('debt.viewProof')}</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={() => openEditPaymentForm(payment)} style={styles.paymentActionButton}>
                            <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
                            <Text style={styles.paymentActionButtonText}>{t('common.edit')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyInline}>{t('debt.noPayments')}</Text>
              )}
            </View>
          </View>
        ) : null}
          </>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {!!detailError && !error && <Text style={styles.errorText}>{detailError}</Text>}
      </ScrollView>

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForm} />
          <View style={[styles.modalKeyboard, keyboardOpen && { paddingBottom: modalLift }]}>
            <View style={[styles.modalSheet, keyboardOpen && styles.modalSheetKeyboard]}>
              <View style={styles.modalHandle} />

              <View style={[styles.modalBody, keyboardOpen && styles.modalBodyKeyboard]}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={[styles.modalKicker, { color: modalAccent }]}>
                      {isPaymentEditForm
                        ? t('debt.paymentEditKicker')
                        : formMode === 'payment'
                          ? t('debt.paymentKicker')
                        : formMode === 'edit'
                          ? t('debt.editKicker')
                          : t('debt.createKicker')}
                    </Text>
                    <Text style={[styles.modalTitle, keyboardOpen && styles.modalTitleKeyboard]}>
                      {isPaymentEditForm
                        ? t('debt.paymentEditTitle')
                        : formMode === 'payment'
                          ? t('debt.paymentTitle')
                        : formMode === 'edit'
                          ? t('debt.editTitle')
                          : t('debt.createTitle')}
                    </Text>
                    <Text style={[styles.modalSubtitle, keyboardOpen && styles.modalSubtitleKeyboard]}>
                      {isPaymentEditForm
                        ? t('debt.paymentEditSubtitle')
                        : formMode === 'payment'
                          ? t('debt.paymentSubtitle')
                        : formMode === 'edit'
                          ? t('debt.editSubtitle')
                          : t('debt.createSubtitle')}
                    </Text>
                  </View>

                  <Pressable onPress={closeForm} style={styles.modalClose}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={[styles.modalContent, keyboardOpen && styles.modalContentKeyboard]}>
                  <View
                    style={[
                      styles.modalHeroCard,
                      {
                        backgroundColor: alpha(modalAccent, isLight ? 0.1 : 0.18),
                        borderColor: alpha(modalAccent, isLight ? 0.16 : 0.28),
                      },
                    ]}>
                    <View style={styles.modalHeroTop}>
                      <View
                        style={[
                          styles.modalHeroIcon,
                          { backgroundColor: alpha(modalAccent, isLight ? 0.14 : 0.2) },
                        ]}>
                        <MaterialCommunityIcons
                          name={
                            isPaymentEditForm
                              ? 'file-image-edit-outline'
                              : formMode === 'payment'
                                ? 'file-image-plus-outline'
                              : formMode === 'edit'
                                ? 'file-document-edit-outline'
                                : 'bank-plus'
                          }
                          size={22}
                          color={modalAccent}
                        />
                      </View>
                      <View style={styles.modalHeroCopy}>
                        <Text style={styles.modalHeroTitle}>
                          {isPaymentEditForm
                            ? t('debt.modal.paymentEditPreviewTitle')
                            : formMode === 'payment'
                              ? t('debt.modal.paymentPreviewTitle')
                            : formMode === 'edit'
                              ? t('debt.modal.editPreviewTitle')
                              : t('debt.modal.createPreviewTitle')}
                        </Text>
                        <Text style={styles.modalHeroText}>
                          {isPaymentEditForm
                            ? t('debt.paymentEditSubtitle')
                            : formMode === 'payment'
                              ? t('debt.paymentSubtitle')
                            : formMode === 'edit'
                              ? t('debt.editSubtitle')
                              : t('debt.createSubtitle')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalHeroMetrics}>
                      {formMode === 'create' || formMode === 'edit' ? (
                        <>
                          <View style={styles.modalMetricCard}>
                            <Text style={styles.modalMetricLabel}>{t('debt.modal.totalPreview')}</Text>
                            <Text numberOfLines={1} style={styles.modalMetricValue}>
                              {createTotalPreview}
                            </Text>
                          </View>
                          <View style={styles.modalMetricCard}>
                            <Text style={styles.modalMetricLabel}>{t('debt.modal.installmentPreview')}</Text>
                            <Text numberOfLines={1} style={styles.modalMetricValue}>
                              {createInstallmentPreview}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.modalMetricCard}>
                            <Text style={styles.modalMetricLabel}>{t('debt.modal.amountPreview')}</Text>
                            <Text numberOfLines={1} style={styles.modalMetricValue}>
                              {paymentAmountPreview}
                            </Text>
                          </View>
                          <View style={styles.modalMetricCard}>
                            <Text style={styles.modalMetricLabel}>{t('debt.modal.remainingPreview')}</Text>
                            <Text numberOfLines={1} style={styles.modalMetricValue}>
                              {formatCurrency(paymentTargetRemaining, locale)}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>

                  {!!formError && (
                    <View style={styles.formErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.formErrorText}>{formError}</Text>
                    </View>
                  )}

                  {formMode === 'create' || formMode === 'edit' ? (
                    <View style={[styles.formStack, keyboardOpen && styles.formStackKeyboard]}>
                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="rename-box" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('debt.modal.createSectionTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('debt.modal.createSectionHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.fieldStack}>
                          <Text style={styles.fieldLabel}>{t('debt.form.name')}</Text>
                          <View style={styles.inputShell}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="wallet-outline" size={18} color={modalAccent} />
                            </View>
                            <TextInput
                              value={debtForm.name}
                              onChangeText={(text) => setDebtForm((current) => ({ ...current, name: text }))}
                              placeholder={t('debt.form.namePlaceholder')}
                              placeholderTextColor={colors.shellTextSoft}
                              style={styles.inputControl}
                            />
                          </View>
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="cash-multiple" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('debt.modal.scheduleSectionTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('debt.modal.scheduleSectionHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.fieldRow}>
                          <View style={styles.fieldStackHalf}>
                            <Text style={styles.fieldLabel}>{t('debt.form.totalAmount')}</Text>
                            <View style={styles.inputShell}>
                              <TextInput
                                value={debtForm.totalAmount}
                                onChangeText={(text) =>
                                  setDebtForm((current) => ({
                                    ...current,
                                    totalAmount: formatRupiahInput(text),
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder="12.000.000"
                                placeholderTextColor={colors.shellTextSoft}
                                style={styles.inputControl}
                              />
                            </View>
                          </View>
                          <View style={styles.fieldStackHalf}>
                            <Text style={styles.fieldLabel}>{t('debt.form.monthlyInstallment')}</Text>
                            <View style={styles.inputShell}>
                              <TextInput
                                value={debtForm.monthlyInstallment}
                                onChangeText={(text) =>
                                  setDebtForm((current) => ({
                                    ...current,
                                    monthlyInstallment: formatRupiahInput(text),
                                  }))
                                }
                                keyboardType="number-pad"
                                placeholder="1.000.000"
                                placeholderTextColor={colors.shellTextSoft}
                                style={styles.inputControl}
                              />
                            </View>
                          </View>
                        </View>

                        <View style={styles.fieldStack}>
                          <Text style={styles.fieldLabel}>{t('debt.form.dueDate')}</Text>
                          <View style={styles.inputShell}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="calendar-month-outline" size={18} color={modalAccent} />
                            </View>
                            <TextInput
                              value={debtForm.dueDate}
                              onChangeText={(text) => setDebtForm((current) => ({ ...current, dueDate: text }))}
                              placeholder="2026-04-16"
                              placeholderTextColor={colors.shellTextSoft}
                              style={styles.inputControl}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.formStack, keyboardOpen && styles.formStackKeyboard]}>
                      <View style={styles.modalSectionCard}>
                          <View style={styles.modalSectionHeader}>
                            <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                              <MaterialCommunityIcons name="credit-card-outline" size={18} color={modalAccent} />
                            </View>
                            <View style={styles.modalSectionCopy}>
                              <Text style={styles.modalSectionTitle}>{t('debt.modal.targetSectionTitle')}</Text>
                              <Text style={styles.modalSectionSubtitle}>
                                {paymentTargetLocked ? t('debt.modal.targetLocked') : t('debt.modal.targetSectionHelper')}
                              </Text>
                            </View>
                          </View>

                        {debts.length ? (
                          <>
                            <View style={styles.debtChipGrid}>
                              {paymentTargetLocked ? (
                                paymentTarget ? (
                                  <View style={[styles.debtChip, styles.debtChipSelected]}>
                                    <Text style={[styles.debtChipText, styles.debtChipTextSelected]}>
                                      {paymentTarget.name}
                                    </Text>
                                  </View>
                                ) : null
                              ) : (
                                debts.map((debt) => {
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
                                })
                              )}
                            </View>

                            {paymentTarget ? (
                              <View style={styles.selectedDebtCard}>
                                <View style={styles.selectedDebtHeader}>
                                  <View style={styles.selectedDebtCopy}>
                                    <Text numberOfLines={1} style={styles.selectedDebtTitle}>
                                      {paymentTarget.name}
                                    </Text>
                                    <Text style={styles.selectedDebtMeta}>{formatDate(paymentTarget.due_date, locale)}</Text>
                                  </View>
                                  <View style={styles.selectedDebtBadge}>
                                    <Text style={styles.selectedDebtBadgeText}>{paymentTargetStatus}</Text>
                                  </View>
                                </View>

                                <View style={styles.selectedDebtStats}>
                                  <View style={styles.selectedDebtStatCard}>
                                    <Text style={styles.selectedDebtStatLabel}>{t('debt.modal.remainingPreview')}</Text>
                                    <Text numberOfLines={1} style={styles.selectedDebtStatValue}>
                                      {formatCurrency(paymentTargetRemaining, locale)}
                                    </Text>
                                  </View>
                                  <View style={styles.selectedDebtStatCard}>
                                    <Text style={styles.selectedDebtStatLabel}>{t('debt.modal.installmentPreview')}</Text>
                                    <Text numberOfLines={1} style={styles.selectedDebtStatValue}>
                                      {formatCurrency(paymentTargetInstallment, locale)}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            ) : null}
                          </>
                        ) : (
                          <View style={styles.emptyOptionCard}>
                            <Text style={styles.emptyOptionText}>{t('debt.modal.noDebtOptions')}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="cash-fast" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('debt.modal.formSectionTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('debt.modal.formSectionHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.fieldStack}>
                          <Text style={styles.fieldLabel}>{t('debt.form.amount')}</Text>
                          <View style={styles.inputShell}>
                            <TextInput
                              value={paymentForm.amount}
                              onChangeText={(text) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  amount: formatRupiahInput(text),
                                }))
                              }
                              keyboardType="number-pad"
                              placeholder="1.000.000"
                              placeholderTextColor={colors.shellTextSoft}
                              style={styles.inputControl}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldStack}>
                          <Text style={styles.fieldLabel}>{t('debt.form.paymentDate')}</Text>
                          <Pressable
                            onPress={openPaymentDatePicker}
                            style={({ pressed }) => [styles.inputShell, pressed && styles.actionButtonPressed]}>
                            <View style={styles.inputIconWrap}>
                              <MaterialCommunityIcons name="calendar-month-outline" size={18} color={modalAccent} />
                            </View>
                            <Text style={styles.inputControl}>{formatDate(paymentForm.paymentDate, locale)}</Text>
                          </Pressable>
                          {Platform.OS === 'ios' && iosPaymentDatePickerVisible ? (
                            <View style={styles.datePickerCard}>
                              <DateTimePicker
                                value={new Date(`${paymentForm.paymentDate}T00:00:00`)}
                                mode="date"
                                display="spinner"
                                onChange={handlePaymentDateChange}
                                accentColor={modalAccent}
                                themeVariant={isLight ? 'light' : 'dark'}
                              />
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}>
                            <MaterialCommunityIcons name="wallet-outline" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>{t('debt.form.walletTitle')}</Text>
                            <Text style={styles.modalSectionSubtitle}>{t('debt.form.walletHelper')}</Text>
                          </View>
                        </View>

                        <View style={styles.debtChipGrid}>
                          <Pressable
                            onPress={() => setPaymentForm((current) => ({ ...current, walletId: null }))}
                            style={[styles.debtChip, !paymentForm.walletId && styles.debtChipSelected]}>
                            <Text style={[styles.debtChipText, !paymentForm.walletId && styles.debtChipTextSelected]}>
                              {t('debt.form.walletDefault')}
                            </Text>
                            <Text style={[styles.debtChipBalance, !paymentForm.walletId && styles.debtChipBalanceSelected]}>
                              {formatCompactCurrency(mainWalletBalance, locale)}
                            </Text>
                          </Pressable>

                          {selectableWalletOptions.map((wallet) => {
                            const active = paymentForm.walletId === wallet.id;
                            const balance = Number(wallet.balance ?? 0);
                            return (
                              <Pressable
                                key={wallet.id}
                                onPress={() => setPaymentForm((current) => ({ ...current, walletId: wallet.id }))}
                                style={[styles.debtChip, active && styles.debtChipSelected]}>
                                <Text style={[styles.debtChipText, active && styles.debtChipTextSelected]}>
                                  {wallet.name}
                                </Text>
                                <Text style={[styles.debtChipBalance, active && styles.debtChipBalanceSelected]}>
                                  {formatCompactCurrency(balance, locale)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={styles.emptyOptionText}>{selectedPaymentWalletLabel}</Text>
                      </View>

                      <View style={styles.modalSectionCard}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionIcon, { backgroundColor: alpha(modalAccent, 0.12) }]}> 
                            <MaterialCommunityIcons name="paperclip" size={18} color={modalAccent} />
                          </View>
                          <View style={styles.modalSectionCopy}>
                            <Text style={styles.modalSectionTitle}>
                              {isPaymentEditForm ? t('debt.modal.proofEditSectionTitle') : t('debt.modal.proofSectionTitle')}
                            </Text>
                            <Text style={styles.modalSectionSubtitle}>
                              {isPaymentEditForm
                                ? t('debt.modal.proofEditSectionHelper')
                                : t('debt.modal.proofSectionHelper')}
                            </Text>
                          </View>
                        </View>

                        {isPaymentEditForm && paymentForm.existingProofUri && !paymentForm.proofUri ? (
                          <View style={styles.currentProofCard}>
                            <View style={styles.currentProofCopy}>
                              <Text style={styles.currentProofLabel}>{t('debt.modal.currentProofTitle')}</Text>
                              <Text numberOfLines={1} style={styles.currentProofName}>
                                {paymentForm.existingProofName || t('debt.modal.proofMissing')}
                              </Text>
                              <Text style={styles.currentProofMeta}>{t('debt.modal.currentProofHelper')}</Text>
                            </View>
                            <Pressable
                              onPress={() => {
                                setProofViewerUri(buildAssetUrl(paymentForm.existingProofUri));
                                setProofViewerError('');
                                setProofViewerLoading(true);
                                setProofViewerVisible(true);
                              }}
                              style={styles.currentProofButton}>
                              <Text style={styles.currentProofButtonText}>{t('debt.viewProof')}</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        <Pressable
                          onPress={pickProofImage}
                          style={[
                            styles.uploadDropzone,
                            proofSelected && {
                              borderColor: alpha(modalAccent, 0.34),
                              backgroundColor: alpha(modalAccent, isLight ? 0.08 : 0.12),
                            },
                          ]}>
                          <View style={[styles.uploadDropzoneIcon, { backgroundColor: alpha(modalAccent, 0.14) }]}>
                            <MaterialCommunityIcons
                              name={hasNewProof ? 'check-bold' : 'file-image-plus-outline'}
                              size={20}
                              color={modalAccent}
                            />
                          </View>
                          <View style={styles.uploadDropzoneCopy}>
                            <Text style={styles.uploadDropzoneTitle}>
                              {hasNewProof || hasStoredProof ? t('debt.form.changeProof') : t('debt.form.chooseProof')}
                            </Text>
                            <Text style={styles.uploadDropzoneSubtitle}>
                              {hasNewProof
                                ? t('debt.modal.proofReady')
                                : hasStoredProof
                                  ? t('debt.modal.currentProofHelper')
                                  : t('debt.form.noProofSelected')}
                            </Text>
                          </View>
                          <View style={styles.uploadDropzoneBadge}>
                            <Text style={styles.uploadDropzoneBadgeText}>{proofSelected ? proofBadgeLabel : 'IMG'}</Text>
                          </View>
                        </Pressable>

                        <View style={[styles.proofFileCard, proofSelected && styles.proofFileCardActive]}>
                          <View style={styles.proofFileIcon}>
                            <MaterialCommunityIcons
                              name={proofSelected ? 'file-check-outline' : 'file-outline'}
                              size={18}
                              color={proofSelected ? modalAccent : colors.shellTextMuted}
                            />
                          </View>
                          <View style={styles.proofFileCopy}>
                            <Text numberOfLines={1} style={styles.proofFileName}>
                              {proofSelected ? selectedProofName || t('debt.modal.proofMissing') : t('debt.modal.proofMissing')}
                            </Text>
                            <Text style={styles.proofFileMeta}>
                              {hasNewProof
                                ? t('debt.modal.proofReady')
                                : hasStoredProof && isPaymentEditForm
                                  ? t('debt.modal.currentProofHelper')
                                  : t('debt.modal.proofSectionHelper')}
                            </Text>
                          </View>
                          {paymentForm.proofUri ? (
                            <Pressable onPress={clearProofSelection} style={styles.proofRemoveButton}>
                              <Text style={styles.proofRemoveText}>{t('debt.form.removeProof')}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>

              <View style={[styles.modalActions, keyboardOpen && styles.modalActionsKeyboard]}>
                <Pressable onPress={closeForm} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </Pressable>

                  <Pressable
                   onPress={isPaymentForm ? submitPaymentForm : submitDebtForm}
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
                      {isPaymentEditForm
                        ? t('debt.form.paymentUpdateSubmit')
                        : formMode === 'payment'
                          ? t('debt.form.paymentSubmit')
                        : formMode === 'edit'
                          ? t('debt.form.updateSubmit')
                          : t('debt.form.createSubmit')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={proofViewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProofViewerVisible(false)}>
        <Pressable
          style={styles.proofViewerBackdrop}
          onPress={() => setProofViewerVisible(false)}>
          <View style={styles.proofViewerContainer}>
            <Pressable
              onPress={() => setProofViewerVisible(false)}
              style={styles.proofViewerClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.onPrimary} />
            </Pressable>
            <View style={styles.proofViewerImageWrap}>
              {proofViewerUri ? (
                <>
                  {proofViewerLoading ? (
                    <ActivityIndicator size="large" color={colors.primary} />
                  ) : null}
                  <Image
                    source={{ uri: proofViewerUri }}
                    style={styles.proofViewerImage}
                    contentFit="contain"
                    cachePolicy="disk"
                    onLoadStart={() => setProofViewerLoading(true)}
                    onLoadEnd={() => setProofViewerLoading(false)}
                    onError={() => {
                      setProofViewerLoading(false);
                      setProofViewerError(t('debt.proofFailed'));
                    }}
                  />
                  {!!proofViewerError && <Text style={styles.proofViewerPlaceholder}>{proofViewerError}</Text>}
                </>
              ) : (
                <Text style={styles.proofViewerPlaceholder}>{t('debt.noProof')}</Text>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>

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

const createStyles = (colors: AppColorTheme, compact: boolean, topInset: number, bottomInset: number) =>
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
      borderColor: alpha(colors.secondaryAccent, 0.34),
      borderLeftWidth: 3,
      borderLeftColor: colors.secondaryAccent,
      backgroundColor: alpha(colors.primary, 0.14),
      shadowColor: colors.primary,
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
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
    debtCardBadgeStack: {
      alignItems: 'flex-end',
      gap: 6,
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
    debtCardDeleteButton: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: alpha(colors.danger, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
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
    detailActions: {
      flexDirection: 'row',
      gap: 10,
    },
    detailActionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      backgroundColor: colors.shellCardSoft,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 14,
    },
    detailActionDanger: {
      borderColor: alpha(colors.danger, 0.2),
      backgroundColor: alpha(colors.danger, 0.06),
    },
    detailActionText: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    detailActionDangerText: {
      color: colors.danger,
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
    paymentActionGroup: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      flexWrap: 'wrap',
    },
    paymentActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: alpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.2),
    },
    paymentActionButtonText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
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
    proofViewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    proofViewerContainer: {
      width: '90%',
      maxHeight: '80%',
      backgroundColor: colors.shellCard,
      borderRadius: 20,
      overflow: 'hidden',
    },
    proofViewerClose: {
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: alpha(colors.inverseSurface, 0.6),
      alignItems: 'center',
      justifyContent: 'center',
    },
    proofViewerImageWrap: {
      width: '100%',
      height: 300,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
    proofViewerImage: {
      width: '100%',
      height: '100%',
    },
    proofViewerPlaceholder: {
      color: colors.shellTextMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    currentProofCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    currentProofCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    currentProofLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    currentProofName: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    currentProofMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
    },
    currentProofButton: {
      minHeight: 34,
      borderRadius: 12,
      backgroundColor: alpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    currentProofButtonText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
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
    modalKeyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      backgroundColor: colors.shellBackground,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: Math.max(12, bottomInset + 8),
      borderWidth: 1,
      borderColor: colors.shellBorder,
      maxHeight: '92%',
      gap: 14,
    },
    modalSheetKeyboard: {
      paddingTop: 8,
      paddingBottom: Math.max(10, bottomInset + 6),
      gap: 10,
    },
    modalHandle: {
      alignSelf: 'center',
      width: 52,
      height: 5,
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextSoft, 0.46),
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
    modalBody: {
      gap: 16,
      flexShrink: 1,
      minHeight: 0,
    },
    modalBodyKeyboard: {
      gap: 12,
    },
    modalKicker: {
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
    modalTitleKeyboard: {
      fontSize: compact ? 21 : 22,
      lineHeight: compact ? 26 : 28,
    },
    modalSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    modalSubtitleKeyboard: {
      fontSize: 12,
      lineHeight: 17,
    },
    modalClose: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalContent: {
      gap: 14,
      paddingBottom: 8,
    },
    modalContentKeyboard: {
      gap: 10,
    },
    modalHeroCard: {
      borderRadius: 28,
      borderWidth: 1,
      padding: 18,
      gap: 16,
    },
    modalHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    modalHeroIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    modalHeroTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '900',
    },
    modalHeroText: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    modalHeroMetrics: {
      flexDirection: 'row',
      gap: 12,
    },
    modalMetricCard: {
      flex: 1,
      minWidth: 0,
      borderRadius: 18,
      backgroundColor: alpha(colors.surfaceContainerLowest, 0.72),
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    modalMetricLabel: {
      color: colors.shellTextMuted,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    modalMetricValue: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 15 : 16,
      lineHeight: compact ? 20 : 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    formErrorCard: {
      borderRadius: 18,
      backgroundColor: alpha(colors.danger, 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.22),
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    formErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    formStack: {
      gap: 14,
    },
    formStackKeyboard: {
      gap: 10,
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
      color: colors.shellTextSecondary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    modalSectionCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 16,
      gap: 14,
    },
    modalSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalSectionIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSectionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    modalSectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '800',
    },
    modalSectionSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    inputShell: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    searchInput: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    searchShell: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    searchClearButton: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
    collapsedSection: {
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
    },
    inputIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputControl: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      paddingVertical: 16,
      paddingRight: 12,
    },
    debtChipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    debtChip: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.shellCardSoft,
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
    debtChipBalance: {
      color: colors.shellTextSecondary,
      fontSize: 9,
      fontWeight: '600',
      marginTop: 2,
    },
    debtChipBalanceSelected: {
      color: alpha(colors.primary, 0.7),
    },
    selectedDebtCard: {
      borderRadius: 20,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 14,
      gap: 12,
    },
    selectedDebtHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    selectedDebtCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    selectedDebtTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    selectedDebtMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    selectedDebtBadge: {
      minHeight: 30,
      borderRadius: 999,
      backgroundColor: alpha(colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    selectedDebtBadgeText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    selectedDebtStats: {
      flexDirection: 'row',
      gap: 10,
    },
    selectedDebtStatCard: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      backgroundColor: colors.shellCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    selectedDebtStatLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    selectedDebtStatValue: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '900',
    },
    emptyOptionCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    emptyOptionText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    uploadDropzone: {
      minHeight: 88,
      borderRadius: 22,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: alpha(colors.shellTextSoft, 0.36),
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    uploadDropzoneIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadDropzoneCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    uploadDropzoneTitle: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    uploadDropzoneSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    uploadDropzoneBadge: {
      minWidth: 44,
      height: 32,
      borderRadius: 12,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    uploadDropzoneBadgeText: {
      color: colors.shellTextSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    proofFileCard: {
      borderRadius: 18,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    proofFileCardActive: {
      backgroundColor: alpha(colors.secondary, 0.08),
      borderColor: alpha(colors.secondary, 0.2),
    },
    proofFileIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    proofFileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    proofFileName: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    proofFileMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
    },
    proofRemoveButton: {
      minHeight: 34,
      borderRadius: 12,
      backgroundColor: alpha(colors.danger, 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    proofRemoveText: {
      color: colors.danger,
      fontSize: 11,
      fontWeight: '800',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
    },
    modalActionsKeyboard: {
      paddingTop: 2,
      borderTopWidth: 0,
    },
    cancelButton: {
      flex: 1,
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
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
      minHeight: 54,
      borderRadius: 18,
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
