import { alpha, type AppColorTheme } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export function DashboardFab({
  colors, styles, t, fabMenuOpen, onToggleFab,
}: {
  colors: AppColorTheme; styles: any; t: (k: string, params?: Record<string, string | number>) => string;
  fabMenuOpen: boolean; onToggleFab: (open: boolean) => void;
}) {
  return (
    <>
      {fabMenuOpen ? (
        <Pressable style={styles.fabOverlay} onPress={() => onToggleFab(false)} />
      ) : null}
      <View style={[styles.fabContainer, { bottom: 100 }]}>
        {fabMenuOpen ? (
          <View style={styles.fabMenu}>
            <Pressable onPress={() => { onToggleFab(false); router.push('/wallets'); }} style={styles.fabMenuItem} accessibilityLabel={t('fab.wallet')} accessibilityRole="button">
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.fabMenuLabel}>{t('fab.wallet')}</Text>
            </Pressable>
            <Pressable onPress={() => { onToggleFab(false); router.push('/categories'); }} style={styles.fabMenuItem} accessibilityLabel={t('fab.categories')} accessibilityRole="button">
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.secondaryAccent, 0.12) }]}>
                <MaterialCommunityIcons name="shape-outline" size={18} color={colors.secondaryAccent} />
              </View>
              <Text style={styles.fabMenuLabel}>{t('fab.categories')}</Text>
            </Pressable>
            <Pressable onPress={() => { onToggleFab(false); router.push('/budgets'); }} style={styles.fabMenuItem} accessibilityLabel={t('fab.budgets')} accessibilityRole="button">
              <View style={[styles.fabMenuIcon, { backgroundColor: alpha(colors.warning, 0.12) }]}>
                <MaterialCommunityIcons name="flag-outline" size={18} color={colors.warning} />
              </View>
              <Text style={styles.fabMenuLabel}>{t('fab.budgets')}</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          onPress={() => onToggleFab(!fabMenuOpen)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityLabel={fabMenuOpen ? t('dashboard.closeMenu') : t('dashboard.openMenu')}
          accessibilityRole="button">
          <MaterialCommunityIcons name={fabMenuOpen ? 'close' : 'plus'} size={26} color={colors.onPrimary} />
        </Pressable>
      </View>
    </>
  );
}
