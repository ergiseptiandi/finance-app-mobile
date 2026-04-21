import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { ApiRequestError } from '@/lib/api/auth';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import {
  listNotifications,
  markNotificationAsRead,
  type NotificationRecord,
} from '@/lib/api/notifications';
import { resolveNotificationRoute } from '@/lib/push-notifications';
import { useTransitionOverlay } from '@/providers/transition-overlay-provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));

const toDateParts = (value?: string | null, locale = 'id-ID') => {
  if (!value) {
    return { date: '', time: '' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: value, time: '' };
  }

  return {
    date: new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
};

const markReadById = (items: NotificationRecord[], id: NotificationRecord['id']) =>
  items.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          read: true,
          read_at: entry.read_at ?? new Date().toISOString(),
        }
      : entry
  );

const isUnreadNotification = (item: NotificationRecord) => {
  if (typeof item.read === 'boolean') {
    return !item.read;
  }

  return !item.read_at;
};

const isDeviceNotificationId = (id: NotificationRecord['id']) =>
  typeof id === 'string' && id.startsWith('device:');

const getNotificationKindLabel = (kind: string | null | undefined, t: (key: string) => string) => {
  if (kind === 'daily_expense_input') {
    return t('notifications.kindDailyExpense');
  }

  if (kind === 'debt_payment') {
    return t('notifications.kindDebtPayment');
  }

  if (kind === 'salary_reminder') {
    return t('notifications.kindSalaryReminder');
  }

  return kind || t('notifications.kindFallback');
};

const normalizeNotificationList = (data: unknown): NotificationRecord[] => {
  if (Array.isArray(data)) {
    return data as NotificationRecord[];
  }

  if (data && typeof data === 'object') {
    const source = data as Record<string, unknown>;
    const keys = ['data', 'notifications', 'items', 'records', 'rows'] as const;

    for (const key of keys) {
      const items = normalizeNotificationList(source[key]);
      if (items.length > 0) {
        return items;
      }
    }
  }

  return [];
};

const mapPresentedNotification = (notification: Notifications.Notification): NotificationRecord => {
  const content = notification.request.content;
  const data = content.data ?? {};
  const kind =
    typeof data.kind === 'string' ? data.kind : typeof data.type === 'string' ? data.type : null;

  return {
    id: `device:${notification.request.identifier}`,
    kind,
    type: typeof data.type === 'string' ? data.type : kind,
    title: content.title,
    message: content.body,
    read: false,
    read_at: null,
    created_at: new Date(notification.date).toISOString(),
    data,
  };
};

const loadPresentedNotifications = async () => {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented.map(mapPresentedNotification);
  } catch {
    return [];
  }
};

export default function NotificationsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const { showTransitionOverlay } = useTransitionOverlay();
  const insets = useSafeAreaInsets();
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const styles = createStyles(colors, insets.top, insets.bottom);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => isUnreadNotification(item)).length,
    [notifications]
  );

  const navigateToSettings = useCallback(async () => {
    showTransitionOverlay();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    router.navigate('/(tabs)/settings');
  }, [showTransitionOverlay]);

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
          const refreshed = await refreshStoredAuthSession();
          if (refreshed) {
            return task(refreshed.token.access_token);
          }
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace('/login');
        }

        throw error;
      }
    },
    []
  );

  const loadNotifications = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const [serverResult, deviceResult] = await Promise.allSettled([
          withAuthorizedRequest((accessToken) => listNotifications(accessToken)),
          loadPresentedNotifications(),
        ]);

        if (serverResult.status === 'rejected' && serverResult.reason instanceof Error && serverResult.reason.message === 'missing_session') {
          return;
        }

        const serverNotifications =
          serverResult.status === 'fulfilled' ? normalizeNotificationList(serverResult.value.Data) : [];
        const deviceNotifications = deviceResult.status === 'fulfilled' ? deviceResult.value : [];

        setNotifications(serverNotifications.length > 0 ? serverNotifications : deviceNotifications);
      } catch (loadError) {
        if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
          setError(t('notifications.loadError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t, withAuthorizedRequest]
  );

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications])
  );

  const markNotification = useCallback(
    async (item: NotificationRecord) => {
      setSavingId(item.id);
      try {
        if (isDeviceNotificationId(item.id)) {
          const notificationId = String(item.id).slice('device:'.length);
          await Notifications.dismissNotificationAsync(notificationId);
        } else {
          await withAuthorizedRequest((accessToken) => markNotificationAsRead(accessToken, item.id));
        }
        setNotifications((current) => markReadById(current, item.id));

        const route = resolveNotificationRoute({
          kind: item.kind ?? undefined,
          type: item.type ?? undefined,
          route: typeof item.data?.route === 'string' ? item.data.route : undefined,
        });

        if (route !== '/') {
          showTransitionOverlay();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          router.push(route as never);
        }
      } catch {
        // keep the UI responsive even if mark-read fails
      } finally {
        setSavingId(null);
      }
    },
    [showTransitionOverlay, withAuthorizedRequest]
  );

  const markAllAsRead = useCallback(async () => {
    if (savingAll || loading || unreadCount === 0) {
      return;
    }

    const unreadItems = notifications.filter((item) => isUnreadNotification(item));

    if (unreadItems.length === 0) {
      return;
    }

    setSavingAll(true);

    try {
      await withAuthorizedRequest((accessToken) =>
        Promise.allSettled(unreadItems.map((item) => markNotificationAsRead(accessToken, item.id)))
      );
      setNotifications((current) => current.map((entry) => (isUnreadNotification(entry) ? { ...entry, read: true, read_at: entry.read_at ?? new Date().toISOString() } : entry)));
    } finally {
      setSavingAll(false);
    }
  }, [loading, notifications, savingAll, unreadCount, withAuthorizedRequest]);

  const goBack = useCallback(async () => {
    await navigateToSettings();
  }, [navigateToSettings]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        void goBack();
        return true;
      });

      return () => subscription.remove();
    }, [goBack])
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadNotifications(true)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => void goBack()} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.shellTextPrimary} />
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={styles.kicker}>{t('notifications.kicker')}</Text>
            <Text style={styles.title}>{t('notifications.title')}</Text>
          </View>
          <View style={styles.topBarActions}>
            {unreadCount > 0 ? (
              <Pressable
                onPress={() => void markAllAsRead()}
                disabled={savingAll}
                style={({ pressed }) => [
                  styles.readAllButton,
                  pressed && styles.readAllButtonPressed,
                  savingAll && styles.readAllButtonDisabled,
                ]}>
                {savingAll ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.readAllText}>{t('notifications.markAllRead')}</Text>
                )}
              </Pressable>
            ) : null}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{toNumber(unreadCount)}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t('notifications.loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.danger} />
            <Text style={styles.stateTitle}>{t('notifications.loadError')}</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="bell-outline" size={28} color={colors.outlineVariant} />
            <Text style={styles.stateTitle}>{t('notifications.emptyTitle')}</Text>
            <Text style={styles.stateBody}>{t('notifications.emptyBody')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {notifications.map((item) => {
              const unread = isUnreadNotification(item);
              const title = item.title?.trim() || t('notifications.defaultTitle');
              const message = item.message?.trim() || t('notifications.defaultBody');
              const dateParts = toDateParts(item.created_at, locale);
              return (
                <Pressable
                  key={String(item.id)}
                  onPress={() => void markNotification(item)}
                  style={({ pressed }) => [
                    styles.card,
                    unread && styles.cardUnread,
                    pressed && styles.cardPressed,
                  ]}>
                    <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
                      <MaterialCommunityIcons
                        name={
                          item.kind === 'debt_payment' || item.type === 'debt_payment'
                            ? 'calendar-clock'
                            : item.kind === 'salary_reminder' || item.type === 'salary_reminder'
                              ? 'cash-plus'
                              : 'cash-fast'
                        }
                        size={18}
                        color={unread ? colors.primary : colors.shellTextMuted}
                      />
                  </View>
                  <View style={styles.copy}>
                    <View style={styles.cardHeader}>
                      <Text numberOfLines={1} style={styles.cardTitle}>
                        {title}
                      </Text>
                      {unread ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Text numberOfLines={2} style={styles.cardBody}>
                      {message}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardMeta}>{getNotificationKindLabel(item.kind ?? item.type, t)}</Text>
                      <View style={styles.dateBlock}>
                        <Text style={styles.dateText}>{dateParts.date}</Text>
                        <Text style={styles.timeText}>{dateParts.time}</Text>
                      </View>
                    </View>
                  </View>
                  {savingId === item.id ? <ActivityIndicator color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number, bottomInset: number) =>
  StyleSheet.create({
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
      paddingTop: Math.max(topInset + 12, 20),
      paddingBottom: Math.max(bottomInset + 28, 28),
      gap: 16,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.shellCard,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    topBarCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    topBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    kicker: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    badge: {
      minWidth: 38,
      height: 28,
      borderRadius: 999,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.12),
    },
    badgeText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    readAllButton: {
      minHeight: 28,
      borderRadius: 999,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.2),
    },
    readAllButtonPressed: {
      opacity: 0.85,
    },
    readAllButtonDisabled: {
      opacity: 0.6,
    },
    readAllText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
    },
    loadingState: {
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: colors.shellTextMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    stateCard: {
      minHeight: 220,
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    stateTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    stateBody: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
      textAlign: 'center',
    },
    list: {
      gap: 12,
    },
    card: {
      flexDirection: 'row',
      gap: 12,
      borderRadius: 22,
      padding: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'flex-start',
    },
    cardUnread: {
      borderColor: alpha(colors.primary, 0.34),
      backgroundColor: alpha(colors.primary, 0.05),
    },
    cardPressed: {
      opacity: 0.92,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconWrapUnread: {
      backgroundColor: alpha(colors.primary, 0.12),
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.primary,
      flexShrink: 0,
    },
    cardBody: {
      color: colors.shellTextSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardMeta: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    dateBlock: {
      alignItems: 'flex-end',
      gap: 2,
      flexShrink: 0,
    },
    dateText: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      textAlign: 'right',
    },
    timeText: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textAlign: 'right',
    },
  });
