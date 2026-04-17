import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ReportsScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Reports</Text>
      <Text style={styles.title}>Editorial reporting without noisy chrome.</Text>
      <Text style={styles.subtitle}>
        This report shell keeps headings, chart captions, and summary copy inside readable columns so
        nothing spills beyond the screen edge.
      </Text>

      <View style={styles.heroCard}>
        <MaterialCommunityIcons name="chart-box-outline" size={22} color={colors.primary} />
        <Text style={styles.heroValue}>7 custom summaries ready</Text>
        <Text style={styles.heroBody}>
          Weekly, monthly, and quarter-close exports can land here once the reporting API is wired.
        </Text>
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
    heroCard: {
      borderRadius: 30,
      backgroundColor: colors.shellCard,
      padding: 22,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    heroValue: {
      color: colors.shellTextPrimary,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    heroBody: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
  });
