import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';

export default function ActivityScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();
  const styles = createStyles(colors, insets.top);
  const items = [
    {
      icon: 'bank-transfer-out',
      title: t('activity.card.scheduledTransfers.title'),
      body: t('activity.card.scheduledTransfers.body'),
    },
    {
      icon: 'cash-clock',
      title: t('activity.card.pendingSettlements.title'),
      body: t('activity.card.pendingSettlements.body'),
    },
    {
      icon: 'history',
      title: t('activity.card.ledgerTimeline.title'),
      body: t('activity.card.ledgerTimeline.body'),
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>{t('activity.kicker')}</Text>
      <Text style={styles.title}>{t('activity.title')}</Text>
      <Text style={styles.subtitle}>{t('activity.subtitle')}</Text>

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
