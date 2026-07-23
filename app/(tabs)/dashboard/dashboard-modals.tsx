import { alpha, type AppColorTheme } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSwipeToDismiss } from '@/hooks/use-swipe-to-dismiss';
import {
  computeSalaryCycleDates,
  getCurrentMonthInputValue,
  MONTH_INDEXES,
  toDashboardFilterPickerValue,
  toDateInputLabel,
  type DashboardDateFilterMode,
  type DashboardFilters,
  type MonthPickerState,
} from '@/components/dashboard/dashboard-utils';

export function FilterModal({
  visible, colors, styles, locale, t, language, isDark, salaryDay,
  draftFilters, filterError, monthPickerState, iosFilterDatePickerVisible, filterDateTarget,
  onClose, onOpenMonthPicker, onApplyMonthPicker, onResetFilters, onApplyFilters,
  onSetDraftFilters, onSetMonthPickerState, onOpenFilterDatePicker, onHandleFilterDateChange,
  onSetIosFilterDatePickerVisible,
}: {
  visible: boolean; colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  language: string; isDark: boolean; salaryDay: number;
  draftFilters: DashboardFilters; filterError: string;
  monthPickerState: MonthPickerState; iosFilterDatePickerVisible: boolean;
  filterDateTarget: 'startDate' | 'endDate' | null;
  onClose: () => void; onOpenMonthPicker: () => void; onApplyMonthPicker: () => void;
  onResetFilters: () => void; onApplyFilters: () => void;
  onSetDraftFilters: (fn: (cur: DashboardFilters) => DashboardFilters) => void;
  onSetMonthPickerState: (fn: (cur: MonthPickerState) => MonthPickerState) => void;
  onOpenFilterDatePicker: (target: 'startDate' | 'endDate') => void;
  onHandleFilterDateChange: (event: DateTimePickerEvent, date?: Date) => void;
  onSetIosFilterDatePickerVisible: (v: boolean) => void;
}) {
  const filterSwipe = useSwipeToDismiss(onClose);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.filterModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <View style={styles.filterModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View style={[styles.filterModalSheet, { transform: [{ translateY: filterSwipe.translateY }] }]} {...filterSwipe.panResponder.panHandlers}>
            <View style={styles.filterModalHandle} />
            <View style={styles.filterModalBody}>
              <View style={styles.filterModalHeader}>
                <View style={styles.filterModalHeaderCopy}>
                  <Text style={styles.filterModalKicker}>{t('dashboard.filter.kicker')}</Text>
                  <Text style={styles.filterModalTitle}>{t('dashboard.filter.title')}</Text>
                  <Text style={styles.filterModalSubtitle}>{t('dashboard.filter.helper')}</Text>
                </View>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.filterModalClose}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
                </Pressable>
              </View>
              <ScrollView style={styles.filterModalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filterModalContent}>
                <View style={styles.filterSectionCard}>
                  <View style={styles.filterSectionHeader}>
                    <View style={styles.filterSectionIcon}>
                      <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.filterSectionCopy}>
                      <Text style={styles.filterSectionTitle}>{t('dashboard.filter.dateTitle')}</Text>
                      <Text style={styles.filterSectionSubtitle}>{t('dashboard.filter.dateHelper')}</Text>
                    </View>
                  </View>
                  <View style={styles.filterModeRow}>
                    {(['month', 'range', 'cycle'] as DashboardDateFilterMode[]).map((mode) => {
                      const active = draftFilters.dateMode === mode;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => onSetDraftFilters((current) => ({
                            ...current,
                            dateMode: mode,
                            month: mode === 'month' ? current.month || getCurrentMonthInputValue() : current.month,
                            startDate: mode === 'range' ? current.startDate : '',
                            endDate: mode === 'range' ? current.endDate : '',
                          }))}
                          accessibilityRole="radio"
                          accessibilityLabel={mode === 'month' ? t('dashboard.filter.monthMode') : mode === 'cycle' ? t('dashboard.filter.cycleMode') : t('dashboard.filter.rangeMode')}
                          style={[styles.filterModeButton, active && { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.38 : 0.28) }]}>
                          <View style={[styles.filterModeIcon, { backgroundColor: active ? alpha(colors.primary, 0.16) : colors.shellCardMuted }]}>
                            <MaterialCommunityIcons
                              name={mode === 'month' ? 'calendar-month-outline' : mode === 'cycle' ? 'calendar-sync-outline' : 'calendar-range-outline'}
                              size={16} color={active ? colors.primary : colors.shellTextMuted}
                            />
                          </View>
                          <Text style={[styles.filterModeLabel, active && { color: colors.primary }]}>
                            {mode === 'month' ? t('dashboard.filter.monthMode') : mode === 'cycle' ? t('dashboard.filter.cycleMode') : t('dashboard.filter.rangeMode')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {draftFilters.dateMode === 'cycle' ? (
                    <View style={styles.filterCycleInfo}>
                      <View style={[styles.filterModeIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                        <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.filterCycleText}>{t('dashboard.filter.cycleDescription', { day: salaryDay })}</Text>
                        <Text style={styles.filterCycleMeta}>
                          {t('dashboard.filter.cyclePeriod', {
                            start: toDateInputLabel(computeSalaryCycleDates(salaryDay).startDate, locale),
                            end: toDateInputLabel(computeSalaryCycleDates(salaryDay).endDate, locale),
                          })}
                        </Text>
                      </View>
                      <Pressable onPress={() => { onClose(); router.push('/notification-settings'); }} style={styles.filterCycleAction}>
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                  ) : draftFilters.dateMode === 'month' ? (
                    <>
                      <View style={styles.filterYearRow}>
                        <Pressable onPress={() => onSetMonthPickerState((cur) => ({ ...cur, year: cur.year - 1 }))} accessibilityRole="button" style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
                        </Pressable>
                        <Text style={styles.filterYearText}>{monthPickerState.year}</Text>
                        <Pressable onPress={() => onSetMonthPickerState((cur) => ({ ...cur, year: cur.year + 1 }))} accessibilityRole="button" style={styles.filterYearButton}>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
                        </Pressable>
                      </View>
                      <View style={styles.filterMonthGrid}>
                        {MONTH_INDEXES.map((monthIndex) => {
                          const selected = monthPickerState.monthIndex === monthIndex;
                          const monthLabel = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2020, monthIndex, 1)).replace(/\.$/, '');
                          return (
                            <Pressable
                              key={monthIndex}
                              onPress={() => onSetMonthPickerState((cur) => ({ ...cur, monthIndex }))}
                              accessibilityRole="button"
                              style={[styles.filterMonthChip, selected && { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12), borderColor: alpha(colors.primary, isDark ? 0.42 : 0.28) }]}>
                              <Text style={[styles.filterMonthChipText, selected && { color: colors.primary }]}>{monthLabel}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.filterFieldGroup}>
                        <Text style={styles.filterFieldLabel}>{t('dashboard.filter.startDate')}</Text>
                        <Pressable onPress={() => onOpenFilterDatePicker('startDate')} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.startDate')} style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                          <View style={styles.filterPickerIcon}>
                            <MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.filterPickerCopy}>
                            <Text style={styles.filterPickerValue}>
                              {draftFilters.startDate ? toDateInputLabel(draftFilters.startDate, locale) : t('dashboard.filter.startDatePlaceholder')}
                            </Text>
                            <Text style={styles.filterPickerMeta}>{t('dashboard.filter.dateHelper')}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                        </Pressable>
                      </View>
                      <View style={styles.filterFieldGroup}>
                        <Text style={styles.filterFieldLabel}>{t('dashboard.filter.endDate')}</Text>
                        <Pressable onPress={() => onOpenFilterDatePicker('endDate')} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.endDate')} style={({ pressed }) => [styles.filterPickerShell, pressed && styles.filterPickerPressed]}>
                          <View style={styles.filterPickerIcon}>
                            <MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.filterPickerCopy}>
                            <Text style={styles.filterPickerValue}>
                              {draftFilters.endDate ? toDateInputLabel(draftFilters.endDate, locale) : t('dashboard.filter.endDatePlaceholder')}
                            </Text>
                            <Text style={styles.filterPickerMeta}>{t('dashboard.filter.dateHelper')}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.shellTextMuted} />
                        </Pressable>
                      </View>
                      {Platform.OS === 'ios' && iosFilterDatePickerVisible && filterDateTarget ? (
                        <View style={styles.iosDatePickerOverlay}>
                          <Pressable style={StyleSheet.absoluteFill} onPress={() => onSetIosFilterDatePickerVisible(false)} />
                          <View style={styles.iosDatePickerSheet}>
                            <DateTimePicker value={toDashboardFilterPickerValue(draftFilters, filterDateTarget)} mode="date" display="spinner" onChange={onHandleFilterDateChange} accentColor={colors.primary} themeVariant={isDark ? 'dark' : 'light'} />
                            <Pressable onPress={() => onSetIosFilterDatePickerVisible(false)} style={styles.iosDatePickerDone}>
                              <Text style={styles.iosDatePickerDoneText}>{t('dashboard.filter.apply')}</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
                {!!filterError ? (
                  <View style={styles.filterErrorCard}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                    <Text style={styles.filterErrorText}>{filterError}</Text>
                  </View>
                ) : null}
              </ScrollView>
              <View style={styles.filterModalFooter}>
                <View style={styles.filterModalActions}>
                  <Pressable onPress={onResetFilters} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.reset')} style={styles.filterSecondaryButton}>
                    <Text style={styles.filterSecondaryButtonText}>{t('dashboard.filter.reset')}</Text>
                  </Pressable>
                  <Pressable onPress={onApplyFilters} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.apply')} style={styles.filterPrimaryButton}>
                    <Text style={styles.filterPrimaryButtonText}>{t('dashboard.filter.apply')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function MonthPickerModal({
  visible, colors, styles, locale, t, language, isDark,
  monthPickerState, onClose, onApply, onSetMonthPickerState,
}: {
  visible: boolean; colors: AppColorTheme; styles: any; locale: string; t: (k: string, params?: Record<string, string | number>) => string;
  language: string; isDark: boolean; monthPickerState: MonthPickerState;
  onClose: () => void; onApply: () => void;
  onSetMonthPickerState: (fn: (cur: MonthPickerState) => MonthPickerState) => void;
}) {
  const monthPickerSwipe = useSwipeToDismiss(onClose);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.monthPickerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.monthPickerSheet, { transform: [{ translateY: monthPickerSwipe.translateY }] }]} {...monthPickerSwipe.panResponder.panHandlers}>
          <View style={styles.monthPickerHandle} />
          <View style={styles.monthPickerHeader}>
            <View style={styles.monthPickerHeaderCopy}>
              <Text style={styles.monthPickerKicker}>{t('dashboard.filter.monthMode')}</Text>
              <Text style={styles.monthPickerTitle}>{t('dashboard.filter.monthLabel')}</Text>
              <Text style={styles.monthPickerSubtitle}>{t('dashboard.filter.monthHelper')}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.monthPickerClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.shellTextPrimary} />
            </Pressable>
          </View>
          <View style={styles.monthPickerYearRow}>
            <Pressable onPress={() => onSetMonthPickerState((cur) => ({ ...cur, year: cur.year - 1 }))} accessibilityRole="button" accessibilityLabel={language === 'id' ? 'Tahun sebelumnya' : 'Previous year'} style={styles.monthPickerYearButton}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthPickerYearText}>{monthPickerState.year}</Text>
            <Pressable onPress={() => onSetMonthPickerState((cur) => ({ ...cur, year: cur.year + 1 }))} accessibilityRole="button" accessibilityLabel={language === 'id' ? 'Tahun berikutnya' : 'Next year'} style={styles.monthPickerYearButton}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.monthPickerGrid}>
            {MONTH_INDEXES.map((monthIndex) => {
              const selected = monthPickerState.monthIndex === monthIndex;
              const monthLabel = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2020, monthIndex, 1)).replace(/\.$/, '');
              return (
                <Pressable
                  key={monthIndex}
                  onPress={() => onSetMonthPickerState((cur) => ({ ...cur, monthIndex }))}
                  accessibilityRole="button"
                  accessibilityLabel={monthLabel}
                  style={[styles.monthPickerChip, selected && { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12), borderColor: alpha(colors.primary, isDark ? 0.42 : 0.28) }]}>
                  <Text style={[styles.monthPickerChipText, selected && { color: colors.primary }]}>{monthLabel}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.monthPickerActions}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.reset')} style={styles.monthPickerSecondaryButton}>
              <Text style={styles.monthPickerSecondaryButtonText}>{t('dashboard.filter.reset')}</Text>
            </Pressable>
            <Pressable onPress={onApply} accessibilityRole="button" accessibilityLabel={t('dashboard.filter.apply')} style={styles.monthPickerPrimaryButton}>
              <Text style={styles.monthPickerPrimaryButtonText}>{t('dashboard.filter.apply')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DebtPayModal({
  visible, colors, styles, t, language, debtPayAmount, debtPaying,
  onClose, onSetAmount, onPay, onSetPaying,
}: {
  visible: boolean; colors: AppColorTheme; styles: any; t: (k: string, params?: Record<string, string | number>) => string; language: string;
  debtPayAmount: string; debtPaying: boolean;
  onClose: () => void; onSetAmount: (v: string) => void; onPay: () => Promise<void>;
  onSetPaying: (v: boolean) => void;
}) {
  const debtPaySwipe = useSwipeToDismiss(onClose);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.debtPayOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.debtPaySheet, { transform: [{ translateY: debtPaySwipe.translateY }] }]} {...debtPaySwipe.panResponder.panHandlers}>
          <View style={styles.debtPayHandle} />
          <View style={styles.debtPayHeader}>
            <Text style={styles.debtPayTitle}>{language === 'id' ? 'Bayar utang sekarang' : 'Pay debt now'}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <MaterialCommunityIcons name="close" size={20} color={colors.shellTextPrimary} />
            </Pressable>
          </View>
          <View style={styles.debtPayBody}>
            <Text style={styles.debtPayLabel}>{language === 'id' ? 'Jumlah pembayaran (IDR)' : 'Payment amount (IDR)'}</Text>
            <TextInput
              style={styles.debtPayInput}
              keyboardType="numeric"
              placeholder="0"
              value={debtPayAmount}
              onChangeText={onSetAmount}
              accessibilityLabel={language === 'id' ? 'Jumlah pembayaran' : 'Payment amount'}
            />
          </View>
          <View style={styles.debtPayActions}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={language === 'id' ? 'Batal' : 'Cancel'} style={styles.debtPayCancel}>
              <Text style={styles.debtPayCancelText}>{language === 'id' ? 'Batal' : 'Cancel'}</Text>
            </Pressable>
            <Pressable
              onPress={onPay}
              disabled={debtPaying}
              accessibilityRole="button"
              accessibilityLabel={language === 'id' ? 'Bayar' : 'Pay'}
              style={[styles.debtPayPay, debtPaying && { opacity: 0.75 }]}>
              {debtPaying ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.debtPayPayText}>{language === 'id' ? 'Bayar' : 'Pay'}</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
