import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiRequestError } from '@/lib/api/auth';
import { getAuthSession, refreshStoredAuthSession } from '@/lib/auth-session';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type CategoryType,
  type CategoryRecord,
} from '@/lib/api/categories';
import { useAppLanguage } from '@/providers/language-provider';

type CategoryDraft = {
  id?: number;
  name: string;
  type: CategoryType;
};

const createEmptyCategoryDraft = (type: CategoryType = 'expense'): CategoryDraft => ({
  type,
  name: '',
});

function CategoryCard({
  category,
  colors,
  onEdit,
  onDelete,
  deleting,
}: {
  category: CategoryRecord;
  colors: AppColorTheme;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <View style={cardStyles(colors).card}>
      <View style={cardStyles(colors).copy}>
        <Text style={cardStyles(colors).name}>{category.name}</Text>
        <Text style={cardStyles(colors).meta}>{category.type.toUpperCase()}</Text>
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
  );
}

export default function CategoriesScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();
  const styles = createStyles(colors, insets.top);

  const [filter, setFilter] = useState<'all' | CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<CategoryDraft>(createEmptyCategoryDraft());

  const navigateToSettings = useCallback(() => {
    router.navigate('/(tabs)/settings');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigateToSettings();
        return true;
      });

      return () => subscription.remove();
    }, [navigateToSettings])
  );

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

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await withAuthorizedRequest((accessToken) =>
        listCategories(accessToken, {
          type: filter === 'all' ? undefined : filter,
        })
      );
      setCategories(response.Data ?? []);
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.message === 'missing_session')) {
        setError(t('categories.loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [filter, t, withAuthorizedRequest]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const visibleCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return categories
      .filter((category) => {
        if (!query) {
          return true;
        }

        return `${category.name} ${category.type}`.toLowerCase().includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [categories, searchQuery]);
  const searchActive = searchQuery.trim().length > 0;

  const handleSave = useCallback(async () => {
    const normalizedName = draft.name.trim();

    if (!normalizedName) {
      setError(t('categories.validation'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (draft.id) {
        await withAuthorizedRequest((accessToken) =>
          updateCategory(accessToken, draft.id!, {
            name: normalizedName,
            type: draft.type,
          })
        );
      } else {
        await withAuthorizedRequest((accessToken) =>
          createCategory(accessToken, {
            name: normalizedName,
            type: draft.type,
          })
        );
      }

      setDraft(createEmptyCategoryDraft(draft.type));
      await loadCategories();
    } catch (saveError) {
      if (saveError instanceof ApiRequestError) {
        setError(saveError.message);
      } else if (!(saveError instanceof Error && saveError.message === 'missing_session')) {
        setError(t('categories.saveError'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, loadCategories, t, withAuthorizedRequest]);

  const handleDelete = useCallback(
    async (category: CategoryRecord) => {
      setDeletingId(category.id);
      setError('');

      try {
        await withAuthorizedRequest((accessToken) => deleteCategory(accessToken, category.id));
        if (draft.id === category.id) {
          setDraft(createEmptyCategoryDraft(draft.type));
        }
        await loadCategories();
      } catch (deleteError) {
        if (deleteError instanceof ApiRequestError) {
          setError(deleteError.message);
        } else if (!(deleteError instanceof Error && deleteError.message === 'missing_session')) {
          setError(t('categories.deleteError'));
        }
      } finally {
        setDeletingId(null);
      }
    },
    [draft.id, draft.type, loadCategories, t, withAuthorizedRequest]
  );

  return (
    <ScrollView
      stickyHeaderIndices={[2]}
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Pressable onPress={navigateToSettings} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.shellTextPrimary} />
        </Pressable>
        <Text numberOfLines={1} style={styles.topTitle}>
          {t('categories.title')}
        </Text>
      </View>

      <View style={[styles.hero, searchActive && styles.collapsedSection]}>
        {!searchActive ? (
          <>
          <Text style={styles.kicker}>{t('categories.kicker')}</Text>
          <Text style={styles.title}>{t('categories.subtitle')}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.searchShell}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.shellTextMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('categories.searchPlaceholder')}
          placeholderTextColor={colors.inputPlaceholder}
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

      <View style={[styles.formCard, searchActive && styles.collapsedSection]}>
        {!searchActive ? (
          <>
        <View style={styles.typeSegment}>
          {(['expense', 'income'] as CategoryType[]).map((type) => {
            const active = type === draft.type;
            return (
              <Pressable
                key={type}
                onPress={() => setDraft((current) => ({ ...current, type }))}
                style={[styles.typePill, active && styles.typePillActive]}>
                <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                  {type === 'income' ? t('activity.transactions.income') : t('activity.transactions.expense')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('categories.name')}</Text>
          <TextInput
            value={draft.name}
            onChangeText={(value) => setDraft((current) => ({ ...current, name: value }))}
            placeholder={t('categories.placeholder')}
            placeholderTextColor={colors.inputPlaceholder}
            style={styles.input}
          />
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable onPress={handleSave} disabled={submitting} style={styles.submitButton}>
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.submitButtonText}>
              {draft.id ? t('categories.update') : t('categories.create')}
            </Text>
          )}
        </Pressable>

        {draft.id ? (
          <Pressable onPress={() => setDraft(createEmptyCategoryDraft(draft.type))} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('categories.cancelEdit')}</Text>
          </Pressable>
        ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('categories.listTitle')}</Text>
        <View style={styles.filterBar}>
          {(['all', 'income', 'expense'] as const).map((option) => {
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
      </View>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>{t('categories.loading')}</Text>
        </View>
      ) : visibleCategories.length === 0 ? (
        <View style={styles.stateCard}>
          <MaterialCommunityIcons name="shape-outline" size={28} color={colors.outlineVariant} />
          <Text style={styles.emptyTitle}>{searchQuery.trim() ? t('categories.searchEmptyTitle') : t('categories.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{searchQuery.trim() ? t('categories.searchEmptyBody') : t('categories.emptyBody')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visibleCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              colors={colors}
              onEdit={() =>
                setDraft({
                  id: category.id,
                  name: category.name,
                  type: category.type,
                })
              }
              onDelete={() => handleDelete(category)}
              deleting={deletingId === category.id}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const cardStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 20,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    name: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
    },
    meta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
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
      paddingBottom: 80,
      gap: 18,
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
    topTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
    },
    hero: {
      gap: 8,
      paddingTop: 6,
    },
    kicker: {
      color: colors.primaryContainer,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2.4,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '900',
      letterSpacing: -1,
    },
    formCard: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      padding: 18,
      gap: 14,
    },
    typeSegment: {
      flexDirection: 'row',
      gap: 8,
    },
    typePill: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typePillActive: {
      backgroundColor: colors.primary,
    },
    typePillText: {
      color: colors.shellTextMuted,
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
    fieldLabel: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    input: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.shellCardSoft,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    searchInput: {
      color: colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    searchShell: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
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
    submitButton: {
      minHeight: 50,
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
    secondaryButton: {
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    sectionHeader: {
      gap: 12,
    },
    sectionTitle: {
      color: colors.primary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    filterBar: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
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
    list: {
      gap: 12,
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
  });
