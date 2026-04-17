import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { clearAuthSession } from '@/lib/auth-session';

export default function ProfileScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Account</Text>
          <Text style={styles.title}>Profile & Security</Text>
          <Text style={styles.subtitle}>Manage session state, API access, and account hygiene.</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account-cog" size={22} color={colors.inverseText} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current Session</Text>
        <Text style={styles.cardValue}>Connected to backend</Text>
        <Text style={styles.cardText}>
          Use the auth endpoints at `https://api-finance.paidev.my.id/v1/auth` for login, register,
          refresh, and profile updates.
        </Text>
      </View>

      <View style={styles.menu}>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons name="account-outline" size={20} color={colors.primary} />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Profile</Text>
            <Text style={styles.menuSubtitle}>Update name and email</Text>
          </View>
        </View>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={colors.primary} />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Password</Text>
            <Text style={styles.menuSubtitle}>Change current password</Text>
          </View>
        </View>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons
            name="shield-refresh-outline"
            size={20}
            color={colors.primary}
          />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Refresh token</Text>
            <Text style={styles.menuSubtitle}>Roll tokens on 401</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          await clearAuthSession();
          router.replace('/login');
        }}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.inverseText} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 20,
      gap: 18,
    },
    header: {
      borderRadius: 28,
      backgroundColor: colors.primary,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      shadowColor: alpha(colors.primary, 0.18),
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
    },
    kicker: {
      color: colors.inverseTextMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.8,
      fontSize: 11,
      fontWeight: '800',
    },
    title: {
      marginTop: 6,
      color: colors.inverseText,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
      letterSpacing: -1,
    },
    subtitle: {
      marginTop: 8,
      maxWidth: 300,
      color: colors.inverseTextSoft,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.heroOverlay,
    },
    card: {
      borderRadius: 24,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 20,
    },
    cardLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    cardValue: {
      marginTop: 8,
      color: colors.onSurface,
      fontSize: 20,
      fontWeight: '900',
    },
    cardText: {
      marginTop: 10,
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    menu: {
      gap: 12,
    },
    menuItem: {
      borderRadius: 22,
      backgroundColor: colors.surfaceContainerLowest,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    menuBody: {
      flex: 1,
    },
    menuTitle: {
      color: colors.onSurface,
      fontSize: 14,
      fontWeight: '800',
    },
    menuSubtitle: {
      marginTop: 4,
      color: colors.icon,
      fontSize: 12,
      fontWeight: '500',
    },
    logoutButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      shadowColor: alpha(colors.danger, 0.22),
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    logoutText: {
      color: colors.inverseText,
      fontSize: 14,
      fontWeight: '800',
    },
  });
