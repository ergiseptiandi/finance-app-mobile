import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Account</Text>
          <Text style={styles.title}>Profile & Security</Text>
          <Text style={styles.subtitle}>Manage session state, API access, and account hygiene.</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account-cog" size={22} color="#f6f6ff" />
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
          <MaterialCommunityIcons name="account-outline" size={20} color="#0057bd" />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Profile</Text>
            <Text style={styles.menuSubtitle}>Update name and email</Text>
          </View>
        </View>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#0057bd" />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Password</Text>
            <Text style={styles.menuSubtitle}>Change current password</Text>
          </View>
        </View>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons name="shield-refresh-outline" size={20} color="#0057bd" />
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>Refresh token</Text>
            <Text style={styles.menuSubtitle}>Roll tokens on 401</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={() => router.replace('/login')}>
        <MaterialCommunityIcons name="logout" size={18} color="#f6f6ff" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f6ff',
  },
  content: {
    padding: 20,
    gap: 18,
  },
  header: {
    borderRadius: 28,
    backgroundColor: '#0057bd',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  kicker: {
    color: 'rgba(246, 246, 255, 0.72)',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    marginTop: 6,
    color: '#f6f6ff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 300,
    color: 'rgba(246, 246, 255, 0.82)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    padding: 20,
  },
  cardLabel: {
    color: '#535b71',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  cardValue: {
    marginTop: 8,
    color: '#272e42',
    fontSize: 20,
    fontWeight: '900',
  },
  cardText: {
    marginTop: 10,
    color: '#535b71',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  menu: {
    gap: 12,
  },
  menuItem: {
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBody: {
    flex: 1,
  },
  menuTitle: {
    color: '#272e42',
    fontSize: 14,
    fontWeight: '800',
  },
  menuSubtitle: {
    marginTop: 4,
    color: '#6f768e',
    fontSize: 12,
    fontWeight: '500',
  },
  logoutButton: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: '#b31b25',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#b31b25',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  logoutText: {
    color: '#f6f6ff',
    fontSize: 14,
    fontWeight: '800',
  },
});
