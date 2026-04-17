import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const items = [
  {
    icon: 'bank-transfer-out',
    title: 'Scheduled Transfers',
    body: 'Track outgoing movement across recurring bills and operating expenses.',
  },
  {
    icon: 'cash-clock',
    title: 'Pending Settlements',
    body: 'Review queued transactions before they impact available liquidity.',
  },
  {
    icon: 'history',
    title: 'Ledger Timeline',
    body: 'Open a deeper chronological trace of every debit and credit event.',
  },
];

export default function ActivityScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Activity</Text>
      <Text style={styles.title}>Flow monitor for every movement.</Text>
      <Text style={styles.subtitle}>
        This tab is structured for dense event streams, but the cards stay constrained so copy and
        action labels never break out of the viewport.
      </Text>

      {items.map((item) => (
        <View key={item.title} style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name={item.icon as never} size={18} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardBody}>{item.body}</Text>
        </View>
      ))}
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
    card: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      padding: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      color: colors.shellTextPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
    },
    cardBody: {
      color: colors.shellTextMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
  });
