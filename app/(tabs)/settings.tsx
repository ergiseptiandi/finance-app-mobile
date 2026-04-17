import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { clearAuthSession } from '@/lib/auth-session';

export default function SettingsScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const styles = createStyles(colors);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.title}>Profile, security, and session hygiene.</Text>
      <Text style={styles.subtitle}>
        Menu items use fixed padding and flexible text columns so the row content stays within the
        viewport on compact devices.
      </Text>

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
            <Text style={styles.menuSubtitle}>Roll tokens automatically on 401</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          await clearAuthSession();
          router.replace('/login');
        }}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.onPrimary} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      padding: 18,
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
      gap: 10,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    cardLabel: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
    },
    cardValue: {
      color: colors.shellTextPrimary,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    cardText: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    menu: {
      gap: 12,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    menuBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    menuTitle: {
      color: colors.shellTextPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    menuSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    logoutButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: colors.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    logoutText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
  });
