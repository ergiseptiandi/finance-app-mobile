import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import {
  createWallet,
  createWalletTransfer,
  deleteWallet,
  getWalletSummary,
  listWallets,
  listWalletTransfers,
  type WalletRecord,
  type WalletSummaryData,
  type WalletTransferRecord,
  updateWallet,
} from '@/lib/api/wallets';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import { buildScreenCacheKey, readScreenCache, writeScreenCache } from '@/lib/screen-cache';
import { useAppLanguage } from '@/providers/language-provider';

type WalletFormState = {
  id?: number;
  name: string;
  openingBalance: string;
};

type WalletTransferDraft = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  note: string;
  transferDate: string;
};

type WalletScreenCacheState = {
  summary: WalletSummaryData | null;
  wallets: WalletRecord[];
  transfers: WalletTransferRecord[];
};

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const createEmptyWalletForm = (): WalletFormState => ({
  name: '',
  openingBalance: '',
});

const createEmptyTransferDraft = (fromWalletId = '', toWalletId = ''): WalletTransferDraft => ({
  fromWalletId,
  toWalletId,
  amount: '',
  note: '',
  transferDate: getTodayInputValue(),
});

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

const toPickerDate = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const toDateLabel = (value: string, locale: string) => {
  const parsed = toPickerDate(value);

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
};

const normalizeTransferDate = (value: string) => {
  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00Z`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? `${getTodayInputValue()}T00:00:00Z` : parsed.toISOString();
};

const extractWallets = (summary: WalletSummaryData | null, wallets: WalletRecord[]) => {
  if (wallets.length > 0) {
    return wallets;
  }

  return summary?.wallets ?? [];
};

const extractTotalBalance = (summary: WalletSummaryData | null, wallets: WalletRecord[]) => {
  if (summary) {
    return toNumber(summary.total_balance);
  }

  return wallets.reduce((total, wallet) => total + toNumber(wallet.balance), 0);
};

const sortWallets = (wallets: WalletRecord[]) =>
  [...wallets].sort((left, right) => left.name.localeCompare(right.name));

const sortTransfers = (transfers: WalletTransferRecord[]) =>
  [...transfers].sort((left, right) => {
    const leftTime = new Date(left.transfer_date ?? left.created_at ?? 0).getTime();
    const rightTime = new Date(right.transfer_date ?? right.created_at ?? 0).getTime();
    return rightTime - leftTime;
  });

const isMainWalletName = (value?: string | null) => value?.trim().toLowerCase() === 'main';

export default function WalletsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { language, t } = useAppLanguage();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<WalletSummaryData | null>(null);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [transfers, setTransfers] = useState<WalletTransferRecord[]>([]);
  const [walletForm, setWalletForm] = useState<WalletFormState>(createEmptyWalletForm());
  const [walletSubmitting, setWalletSubmitting] = useState(false);
  const [walletDeletingId, setWalletDeletingId] = useState<number | null>(null);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferDraft, setTransferDraft] = useState<WalletTransferDraft>(createEmptyTransferDraft());
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [iosTransferDatePickerVisible, setIosTransferDatePickerVisible] = useState(false);

  const resolvedWallets = useMemo(() => sortWallets(extractWallets(summary, wallets)), [summary, wallets]);
  const resolvedTransfers = useMemo(() => sortTransfers(transfers), [transfers]);
  const totalBalance = useMemo(() => extractTotalBalance(summary, resolvedWallets), [resolvedWallets, summary]);
  const hasWalletSnapshot = resolvedWallets.length > 0 || resolvedTransfers.length > 0 || totalBalance > 0;

  const withAuthorizedRequest = useCallback(
    async <T,>(task: (accessToken: string) => Promise<T>) => {
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
    },
    []
  );

  const loadWallets = useCallback(
    async (isRefresh = false) => {
      const shouldShowSkeleton = !isRefresh && !hasWalletSnapshot;

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

        const results = await withAuthorizedRequest((accessToken) =>
          Promise.allSettled([
            getWalletSummary(accessToken),
            listWallets(accessToken),
            listWalletTransfers(accessToken),
          ])
        );

        const [summaryResult, listResult, transfersResult] = results;
        const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value.Data : summary;
        const nextWallets =
          listResult.status === 'fulfilled'
            ? listResult.value.Data ?? []
            : extractWallets(nextSummary, wallets);
        const nextTransfers = transfersResult.status === 'fulfilled' ? transfersResult.value.Data ?? [] : transfers;

        if (summaryResult.status === 'fulfilled') {
          setSummary(nextSummary);
        }

        if (listResult.status === 'fulfilled') {
          setWallets(nextWallets);
        }

        if (transfersResult.status === 'fulfilled') {
          setTransfers(nextTransfers);
        }

        await writeScreenCache(buildScreenCacheKey('wallets', session.user.id), {
          summary: nextSummary,
          wallets: nextWallets,
          transfers: nextTransfers,
        });

        const hasHardFailure = results.some(
          (result) =>
            result.status === 'rejected' &&
            !(result.reason instanceof ApiRequestError && result.reason.status === 401)
        );

        if (hasHardFailure) {
          setError(t('wallets.partialError'));
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'missing_session') {
          return;
        }

        if (err instanceof ApiRequestError && err.status === 401) {
          router.replace('/login');
          return;
        }

        setError(t('wallets.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hasWalletSnapshot, summary, t, transfers, wallets, withAuthorizedRequest]
  );

  useEffect(() => {
    let active = true;

    const hydrateCache = async () => {
      const session = await getAuthSession();

      if (!session || !active) {
        return;
      }

      const cached = await readScreenCache<WalletScreenCacheState>(buildScreenCacheKey('wallets', session.user.id));

      if (!cached || !active) {
        return;
      }

      setSummary(cached.data.summary);
      setWallets(cached.data.wallets);
      setTransfers(cached.data.transfers);
      setLoading(false);
    };

    hydrateCache();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWallets();
    }, [loadWallets])
  );

  const closeWalletForm = useCallback(() => {
    setWalletForm(createEmptyWalletForm());
  }, []);

  const startCreateWallet = useCallback(() => {
    setWalletForm(createEmptyWalletForm());
  }, []);

  const startEditWallet = useCallback((wallet: WalletRecord) => {
    if (isMainWalletName(wallet.name)) {
      setError(t('wallets.mainLocked'));
      return;
    }

    setWalletForm({
      id: wallet.id,
      name: wallet.name,
      openingBalance: formatCurrencyInput(String(toNumber(wallet.opening_balance))),
    });
  }, [t]);

  const handleSaveWallet = useCallback(async () => {
    const normalizedName = walletForm.name.trim();

    if (!normalizedName) {
      setError(t('wallets.validation'));
      return;
    }

    if (walletForm.id) {
      const currentWallet = resolvedWallets.find((wallet) => wallet.id === walletForm.id);
      if (currentWallet && isMainWalletName(currentWallet.name)) {
        setError(t('wallets.mainLocked'));
        return;
      }
    }

    setWalletSubmitting(true);
    setError('');

    const payload = {
      name: normalizedName,
      opening_balance: parseCurrencyInput(walletForm.openingBalance),
    };

    try {
      if (walletForm.id) {
        await withAuthorizedRequest((accessToken) => updateWallet(accessToken, walletForm.id!, payload));
      } else {
        await withAuthorizedRequest((accessToken) => createWallet(accessToken, payload));
      }

      setWalletForm(createEmptyWalletForm());
      await loadWallets(true);
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setError(t('wallets.saveError'));
      }
    } finally {
      setWalletSubmitting(false);
    }
  }, [loadWallets, resolvedWallets, t, walletForm, withAuthorizedRequest]);

  const handleDeleteWallet = useCallback(
    (wallet: WalletRecord) => {
      if (isMainWalletName(wallet.name)) {
        setError(t('wallets.mainLocked'));
        return;
      }

      Alert.alert(t('wallets.deleteTitle'), t('wallets.deleteMessage', { name: wallet.name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('wallets.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setWalletDeletingId(wallet.id);
            setError('');

            try {
              await withAuthorizedRequest((accessToken) => deleteWallet(accessToken, wallet.id));
              if (walletForm.id === wallet.id) {
                setWalletForm(createEmptyWalletForm());
              }
              await loadWallets(true);
            } catch (deleteError) {
              if (deleteError instanceof ApiRequestError) {
                setError(deleteError.message);
              } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
                setError(t('wallets.deleteError'));
              }
            } finally {
              setWalletDeletingId(null);
            }
          },
        },
      ]);
    },
    [loadWallets, t, walletForm.id, withAuthorizedRequest]
  );

  const openTransferModal = useCallback(
    (fromWalletId?: number) => {
      const fallbackFrom = fromWalletId ?? resolvedWallets[0]?.id ?? 0;
      const fallbackTo = resolvedWallets.find((wallet) => wallet.id !== fallbackFrom)?.id ?? 0;

      setTransferDraft(createEmptyTransferDraft(String(fallbackFrom || ''), String(fallbackTo || '')));
      setTransferError('');
      setIosTransferDatePickerVisible(false);
      setTransferModalVisible(true);
    },
    [resolvedWallets]
  );

  const closeTransferModal = useCallback(() => {
    setTransferModalVisible(false);
    setTransferError('');
    setIosTransferDatePickerVisible(false);
  }, []);

  const handleTransferDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') {
      return;
    }

    if (!selectedDate) {
      return;
    }

    setTransferDraft((current) => ({
      ...current,
      transferDate: selectedDate.toISOString().slice(0, 10),
    }));
  }, []);

  const openTransferDatePicker = useCallback(() => {
    const currentDate = toPickerDate(transferDraft.transferDate);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        onChange: handleTransferDateChange,
      });
      return;
    }

    setIosTransferDatePickerVisible((current) => !current);
  }, [handleTransferDateChange, transferDraft.transferDate]);

  const handleSaveTransfer = useCallback(async () => {
    const fromWalletId = Number(transferDraft.fromWalletId);
    const toWalletId = Number(transferDraft.toWalletId);
    const amount = parseCurrencyInput(transferDraft.amount);

    if (!fromWalletId || !toWalletId || fromWalletId === toWalletId || amount <= 0) {
      setTransferError(t('wallets.transferValidation'));
      return;
    }

    setTransferSubmitting(true);
    setTransferError('');

    try {
      await withAuthorizedRequest((accessToken) =>
        createWalletTransfer(accessToken, {
          from_wallet_id: fromWalletId,
          to_wallet_id: toWalletId,
          amount,
          note: transferDraft.note.trim() || undefined,
          transfer_date: normalizeTransferDate(transferDraft.transferDate),
        })
      );

      closeTransferModal();
      await loadWallets(true);
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setTransferError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setTransferError(t('wallets.transferSaveError'));
      }
    } finally {
      setTransferSubmitting(false);
    }
  }, [closeTransferModal, loadWallets, t, transferDraft, withAuthorizedRequest]);

  const totalWalletCount = resolvedWallets.length;
  const transferCount = resolvedTransfers.length;
  const summaryLabel = formatCompactCurrency(totalBalance, locale);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadWallets(true);
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={colors.shellTextPrimary} />
          </Pressable>
          <View style={styles.topRowCopy}>
            <Text style={styles.kicker}>{t('wallets.kicker')}</Text>
            <Text numberOfLines={1} style={styles.topTitle}>
              {t('wallets.pageTitle')}
            </Text>
          </View>
          <Pressable onPress={() => openTransferModal()} style={styles.transferButton}>
            <MaterialCommunityIcons name="swap-horizontal" size={16} color={colors.onPrimary} />
            <Text style={styles.transferButtonText}>{t('wallets.transferAction')}</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>{t('wallets.summaryKicker')}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.heroAmount}>
              {summaryLabel}
            </Text>
            <Text style={styles.heroMeta}>
              {t('wallets.walletCount', { count: totalWalletCount })} •{' '}
              {t('wallets.transferCount', { count: transferCount })}
            </Text>
          </View>

          <View style={styles.heroBadge}>
            <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
          </View>
        </View>

        <View style={styles.noteCard}>
          <MaterialCommunityIcons name="information-outline" size={18} color={colors.secondary} />
          <Text style={styles.noteText}>{t('wallets.note')}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <View style={styles.formHeaderCopy}>
              <Text style={styles.sectionTitle}>{walletForm.id ? t('wallets.editTitle') : t('wallets.createTitle')}</Text>
              <Text style={styles.sectionSubtitle}>{t('wallets.formHelper')}</Text>
            </View>
            <Pressable onPress={startCreateWallet} style={styles.formResetButton}>
              <Text style={styles.formResetButtonText}>{t('wallets.newWallet')}</Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('wallets.formName')}</Text>
            <TextInput
              value={walletForm.name}
              onChangeText={(value) => setWalletForm((current) => ({ ...current, name: value }))}
              placeholder={t('wallets.formNamePlaceholder')}
              placeholderTextColor={colors.shellTextMuted}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('wallets.formOpeningBalance')}</Text>
            <TextInput
              value={walletForm.openingBalance}
              onChangeText={(value) =>
                setWalletForm((current) => ({ ...current, openingBalance: formatCurrencyInput(value) }))
              }
              placeholder={t('wallets.formOpeningPlaceholder')}
              placeholderTextColor={colors.shellTextMuted}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>

          <View style={styles.formActions}>
            <Pressable onPress={handleSaveWallet} disabled={walletSubmitting} style={styles.primaryButton}>
              {walletSubmitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {walletForm.id ? t('wallets.update') : t('wallets.save')}
                </Text>
              )}
            </Pressable>

            {walletForm.id ? (
              <Pressable onPress={closeWalletForm} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{t('wallets.cancelEdit')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('wallets.walletListTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('wallets.walletListHelper')}</Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>{t('wallets.loading')}</Text>
          </View>
        ) : resolvedWallets.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="wallet-outline" size={28} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{t('wallets.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('wallets.emptyBody')}</Text>
          </View>
        ) : (
          <View style={styles.walletList}>
            {resolvedWallets.map((wallet) => (
              <View
                key={wallet.id}
                style={[
                  styles.walletCard,
                  isMainWalletName(wallet.name) && styles.walletCardLocked,
                ]}>
                <View style={styles.walletCardMain}>
                  <View style={styles.walletCardTop}>
                    <View style={styles.walletIconShell}>
                      <MaterialCommunityIcons
                        name={isMainWalletName(wallet.name) ? 'lock-outline' : 'wallet'}
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.walletCardCopy}>
                      <Text numberOfLines={1} style={styles.walletName}>
                        {wallet.name}
                      </Text>
                      <Text style={styles.walletMeta}>
                        {t('wallets.openingBalanceLabel')}: {formatCurrency(toNumber(wallet.opening_balance), locale)}
                      </Text>
                      {isMainWalletName(wallet.name) ? (
                        <Text style={styles.walletLockMeta}>{t('wallets.mainLocked')}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.walletBalanceShell}>
                    <Text style={styles.walletBalanceLabel}>{t('wallets.balanceLabel')}</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.walletBalance}>
                      {formatCurrency(toNumber(wallet.balance), locale)}
                    </Text>
                  </View>
                </View>

                <View style={styles.walletActions}>
                  <Pressable onPress={() => openTransferModal(wallet.id)} style={styles.walletActionPrimary}>
                    <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.onPrimary} />
                    <Text style={styles.walletActionPrimaryText}>{t('wallets.transferAction')}</Text>
                  </Pressable>
                  {isMainWalletName(wallet.name) ? (
                    <View style={styles.walletLockedChip}>
                      <MaterialCommunityIcons name="shield-lock-outline" size={14} color={colors.primary} />
                      <Text style={styles.walletLockedChipText}>{t('wallets.mainLockedShort')}</Text>
                    </View>
                  ) : (
                    <View style={styles.walletActionRow}>
                      <Pressable onPress={() => startEditWallet(wallet)} style={styles.walletIconButton}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteWallet(wallet)}
                        disabled={walletDeletingId === wallet.id}
                        style={styles.walletIconButton}>
                        {walletDeletingId === wallet.id ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('wallets.transferHistoryTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('wallets.transferHistoryHelper')}</Text>
        </View>

        {resolvedTransfers.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="swap-horizontal" size={28} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{t('wallets.transferEmptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('wallets.transferEmptyBody')}</Text>
          </View>
        ) : (
          <View style={styles.transferList}>
            {resolvedTransfers.map((transfer) => {
              const amount = formatCurrency(toNumber(transfer.amount), locale);
              const fromLabel = transfer.from_wallet_name || String(transfer.from_wallet_id ?? '—');
              const toLabel = transfer.to_wallet_name || String(transfer.to_wallet_id ?? '—');
              const dateLabel = toDateLabel(transfer.transfer_date ?? transfer.created_at ?? getTodayInputValue(), locale);

              return (
                <View key={transfer.id} style={styles.transferCard}>
                  <View style={styles.transferCardTop}>
                    <View style={styles.transferRoute}>
                      <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.secondary} />
                      <Text style={styles.transferRouteText} numberOfLines={2}>
                        {fromLabel} → {toLabel}
                      </Text>
                    </View>
                    <Text style={styles.transferAmount}>{amount}</Text>
                  </View>

                  <View style={styles.transferCardMetaRow}>
                    <Text numberOfLines={2} style={styles.transferMeta}>
                      {transfer.note?.trim() || t('wallets.transferNoNote')}
                    </Text>
                    <Text style={styles.transferDate}>{dateLabel}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <Modal
        visible={transferModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeTransferModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeTransferModal} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.modalKicker}>{t('wallets.transferKicker')}</Text>
                    <Text style={styles.modalTitle}>{t('wallets.transferTitle')}</Text>
                    <Text style={styles.modalSubtitle}>{t('wallets.transferHelper')}</Text>
                  </View>
                  <Pressable onPress={closeTransferModal} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.modalContent}>
                  <View style={styles.transferSectionCard}>
                    <View style={styles.transferSectionHeader}>
                      <View style={styles.transferSectionIcon}>
                        <MaterialCommunityIcons name="bank-transfer" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.transferSectionCopy}>
                        <Text style={styles.transferSectionTitle}>{t('wallets.transferWalletTitle')}</Text>
                        <Text style={styles.transferSectionSubtitle}>{t('wallets.transferWalletHelper')}</Text>
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('wallets.transferFrom')}</Text>
                      <View style={styles.chipWrap}>
                        {resolvedWallets.map((wallet) => {
                          const active = transferDraft.fromWalletId === String(wallet.id);
                          return (
                            <Pressable
                              key={wallet.id}
                              onPress={() => setTransferDraft((current) => ({ ...current, fromWalletId: String(wallet.id) }))}
                              style={[styles.chip, active && styles.chipActive]}>
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{wallet.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('wallets.transferTo')}</Text>
                      <View style={styles.chipWrap}>
                        {resolvedWallets.map((wallet) => {
                          const active = transferDraft.toWalletId === String(wallet.id);
                          return (
                            <Pressable
                              key={wallet.id}
                              onPress={() => setTransferDraft((current) => ({ ...current, toWalletId: String(wallet.id) }))}
                              style={[styles.chip, active && styles.chipActive]}>
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{wallet.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('wallets.transferAmount')}</Text>
                      <TextInput
                        value={transferDraft.amount}
                        onChangeText={(value) =>
                          setTransferDraft((current) => ({ ...current, amount: formatCurrencyInput(value) }))
                        }
                        placeholder={t('wallets.transferAmountPlaceholder')}
                        placeholderTextColor={colors.shellTextMuted}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('wallets.transferNote')}</Text>
                      <TextInput
                        value={transferDraft.note}
                        onChangeText={(value) => setTransferDraft((current) => ({ ...current, note: value }))}
                        placeholder={t('wallets.transferNotePlaceholder')}
                        placeholderTextColor={colors.shellTextMuted}
                        style={styles.input}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('wallets.transferDate')}</Text>
                      <Pressable
                        onPress={openTransferDatePicker}
                        style={({ pressed }) => [styles.dateShell, pressed && styles.dateShellPressed]}>
                        <View style={styles.dateIcon}>
                          <MaterialCommunityIcons name="calendar-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.dateCopy}>
                          <Text style={styles.dateValue}>{toDateLabel(transferDraft.transferDate, locale)}</Text>
                          <Text style={styles.dateMeta}>{t('wallets.transferDateHelper')}</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                      </Pressable>

                      {Platform.OS === 'ios' && iosTransferDatePickerVisible ? (
                        <View style={styles.datePickerCard}>
                          <DateTimePicker
                            value={toPickerDate(transferDraft.transferDate)}
                            mode="date"
                            display="spinner"
                            onChange={handleTransferDateChange}
                            accentColor={colors.primary}
                            themeVariant={isDark ? 'dark' : 'light'}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {!!transferError ? (
                    <View style={styles.formErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.formErrorText}>{transferError}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <View style={styles.modalActionsRow}>
                    <Pressable onPress={closeTransferModal} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable onPress={handleSaveTransfer} disabled={transferSubmitting} style={styles.primaryButton}>
                      {transferSubmitting ? (
                        <ActivityIndicator color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.primaryButtonText}>{t('wallets.transferSend')}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number) => {
  const isDark = colors.background === Colors.dark.background;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 12, 28),
      paddingBottom: 140,
      gap: 16,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topRowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    kicker: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.2,
    },
    topTitle: {
      color: colors.shellTextPrimary,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    transferButton: {
      minHeight: 40,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    transferButtonText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    heroCard: {
      borderRadius: 26,
      padding: 20,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      shadowColor: alpha(colors.primary, 0.26),
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    heroLabel: {
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.2,
      opacity: 0.88,
    },
    heroAmount: {
      color: colors.onPrimary,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '900',
      letterSpacing: -1.4,
    },
    heroMeta: {
      color: alpha(colors.onPrimary, 0.9),
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    heroBadge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.onPrimary, 0.16),
    },
    noteCard: {
      borderRadius: 20,
      padding: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    noteText: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    formCard: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 14,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    formHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    formResetButton: {
      minHeight: 36,
      borderRadius: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
    },
    formResetButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    sectionSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    input: {
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    formActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    primaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    secondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    secondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    sectionHeader: {
      gap: 4,
      marginTop: 4,
    },
    walletList: {
      gap: 12,
    },
    walletCard: {
      borderRadius: 24,
      padding: 16,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 14,
    },
    walletCardLocked: {
      borderColor: alpha(colors.primary, 0.26),
      backgroundColor: alpha(colors.primary, 0.05),
    },
    walletCardMain: {
      gap: 14,
    },
    walletCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    walletIconShell: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.1),
    },
    walletCardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    walletName: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '800',
    },
    walletMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    walletLockMeta: {
      color: colors.primary,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    walletBalanceShell: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: colors.shellCardMuted,
      gap: 4,
    },
    walletBalanceLabel: {
      color: colors.shellTextSoft,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    walletBalance: {
      color: colors.shellTextPrimary,
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    walletActions: {
      gap: 10,
    },
    walletActionPrimary: {
      minHeight: 42,
      borderRadius: 14,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    walletActionPrimaryText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    walletActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      justifyContent: 'flex-end',
    },
    walletLockedChip: {
      minHeight: 38,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: alpha(colors.primary, 0.08),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.16),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'flex-end',
    },
    walletLockedChipText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    walletIconButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    transferList: {
      gap: 12,
    },
    transferCard: {
      borderRadius: 22,
      padding: 16,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 10,
    },
    transferCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    transferRoute: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    transferRouteText: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '800',
    },
    transferAmount: {
      color: colors.secondary,
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    transferCardMetaRow: {
      gap: 6,
    },
    transferMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    transferDate: {
      color: colors.shellTextSoft,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    stateCard: {
      borderRadius: 24,
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
      lineHeight: 22,
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
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: alpha(colors.inverseSurface, 0.36),
    },
    modalSheet: {
      maxHeight: '90%',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      backgroundColor: colors.shellBackground,
      borderTopWidth: 1,
      borderColor: colors.shellBorder,
      overflow: 'hidden',
    },
    modalHandle: {
      alignSelf: 'center',
      width: 46,
      height: 5,
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextSoft, 0.5),
      marginTop: 10,
      marginBottom: 8,
    },
    modalBody: {
      gap: 16,
      paddingHorizontal: 18,
      paddingBottom: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    modalKicker: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2,
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
    modalScroll: {
      maxHeight: 420,
    },
    modalContent: {
      gap: 14,
      paddingBottom: 4,
    },
    transferSectionCard: {
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    transferSectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    transferSectionIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    transferSectionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    transferSectionTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    transferSectionSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minHeight: 36,
      borderRadius: 14,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    chipActive: {
      backgroundColor: colors.primary,
    },
    chipText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chipTextActive: {
      color: colors.onPrimary,
    },
    dateShell: {
      minHeight: 52,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    dateShellPressed: {
      opacity: 0.9,
    },
    dateIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    dateCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    dateValue: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    dateMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
    },
    datePickerCard: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.shellBorder,
      backgroundColor: colors.shellCard,
      marginTop: 4,
    },
    formErrorCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 16,
      backgroundColor: alpha(colors.danger, isDark ? 0.16 : 0.08),
      padding: 14,
      borderWidth: 1,
      borderColor: alpha(colors.danger, isDark ? 0.32 : 0.2),
    },
    formErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    modalFooter: {
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 16,
      backgroundColor: colors.shellBackground,
    },
    modalActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
  });
};
