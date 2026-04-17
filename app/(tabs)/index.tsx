import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View>
          <Text style={styles.kicker}>Finance overview</Text>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>A quick snapshot of balances, movement, and momentum.</Text>
        </View>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="finance" size={22} color="#f6f6ff" />
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceValue}>Rp 24.500.000</Text>
        <View style={styles.balanceMetaRow}>
          <View style={styles.balanceMeta}>
            <Text style={styles.balanceMetaLabel}>Income</Text>
            <Text style={styles.balanceMetaValue}>Rp 18.250.000</Text>
          </View>
          <View style={styles.balanceMeta}>
            <Text style={styles.balanceMetaLabel}>Expense</Text>
            <Text style={styles.balanceMetaValue}>Rp 7.650.000</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#0057bd" />
          <Text style={styles.actionText}>Top Up</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <MaterialCommunityIcons name="swap-horizontal" size={18} color="#0057bd" />
          <Text style={styles.actionText}>Transfer</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <MaterialCommunityIcons name="chart-line" size={18} color="#0057bd" />
          <Text style={styles.actionText}>Insight</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.transactionCard}>
          <View style={styles.transactionIcon}>
            <MaterialCommunityIcons name="arrow-down-left" size={18} color="#006947" />
          </View>
          <View style={styles.transactionBody}>
            <Text style={styles.transactionTitle}>Salary Deposit</Text>
            <Text style={styles.transactionMeta}>Today, 09:30</Text>
          </View>
          <Text style={styles.transactionAmountPositive}>+ Rp 12.000.000</Text>
        </View>
        <View style={styles.transactionCard}>
          <View style={[styles.transactionIcon, styles.transactionIconMuted]}>
            <MaterialCommunityIcons name="arrow-up-right" size={18} color="#b31b25" />
          </View>
          <View style={styles.transactionBody}>
            <Text style={styles.transactionTitle}>Budget Allocation</Text>
            <Text style={styles.transactionMeta}>Today, 08:15</Text>
          </View>
          <Text style={styles.transactionAmountNegative}>- Rp 1.750.000</Text>
        </View>
      </View>
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
  hero: {
    borderRadius: 28,
    backgroundColor: '#0057bd',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    shadowColor: '#0057bd',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
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
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 280,
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
  balanceCard: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    padding: 20,
    shadowColor: '#060e20',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  balanceLabel: {
    color: '#535b71',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  balanceValue: {
    marginTop: 10,
    color: '#272e42',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  balanceMetaRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  balanceMeta: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#eef0ff',
    padding: 14,
  },
  balanceMetaLabel: {
    color: '#6f768e',
    fontSize: 12,
    fontWeight: '700',
  },
  balanceMetaValue: {
    marginTop: 8,
    color: '#272e42',
    fontSize: 15,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: {
    color: '#0057bd',
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#272e42',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  transactionCard: {
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(209, 220, 255, 0.9)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(107, 255, 143, 0.18)',
  },
  transactionIconMuted: {
    backgroundColor: 'rgba(251, 81, 81, 0.12)',
  },
  transactionBody: {
    flex: 1,
  },
  transactionTitle: {
    color: '#272e42',
    fontSize: 14,
    fontWeight: '800',
  },
  transactionMeta: {
    marginTop: 4,
    color: '#6f768e',
    fontSize: 12,
    fontWeight: '500',
  },
  transactionAmountPositive: {
    color: '#006947',
    fontSize: 12,
    fontWeight: '800',
  },
  transactionAmountNegative: {
    color: '#b31b25',
    fontSize: 12,
    fontWeight: '800',
  },
});
