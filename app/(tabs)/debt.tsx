import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';

export default function DebtScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();
  const styles = createStyles(colors, insets.top);
  const metrics = [
    { label: t('debt.metric.utilization'), value: '24%', icon: 'percent-outline' },
    { label: t('debt.metric.dueSoon'), value: t('debt.metric.notes', { count: 3 }), icon: 'calendar-alert' },
    { label: t('debt.metric.priority'), value: t('debt.metric.highApr'), icon: 'flash-outline' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>{t('debt.kicker')}</Text>
      <Text style={styles.title}>{t('debt.title')}</Text>
      <Text style={styles.subtitle}>{t('debt.subtitle')}</Text>

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <MaterialCommunityIcons name={metric.icon as never} size={18} color={colors.danger} />
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      padding: 18,
      paddingTop: Math.max(topInset + 14, 28),
      paddingBottom: 150,
      gap: 16,
    },
    kicker: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 3,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '900',
      letterSpacing: -1.2,
    },
    subtitle: {
      color: colors.shellTextSecondary,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '500',
    },
    grid: {
      gap: 12,
    },
    metricCard: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      padding: 20,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    metricLabel: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.3,
    },
    metricValue: {
      color: colors.shellTextPrimary,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
  });
