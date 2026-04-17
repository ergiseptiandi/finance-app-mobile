import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppTheme } from '@/providers/theme-provider';
import { clearAuthSession, getAuthSession } from '@/lib/auth-session';

type SettingsRowProps = {
  colors: AppColorTheme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  iconTone?: 'primary' | 'secondary' | 'muted';
  accent?: boolean;
  rightSlot?: React.ReactNode;
  style?: ViewStyle;
};

function SettingsRow({
  colors,
  icon,
  title,
  subtitle,
  iconTone = 'muted',
  accent = false,
  rightSlot,
  style,
}: SettingsRowProps) {
  const iconColor =
    iconTone === 'primary' ? colors.primary : iconTone === 'secondary' ? colors.secondary : colors.icon;

  return (
    <View style={[settingsRowStyles(colors).row, accent && settingsRowStyles(colors).rowAccent, style]}>
      <View style={settingsRowStyles(colors).left}>
        <View style={settingsRowStyles(colors).iconWrap}>
          <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
        </View>
        <View style={settingsRowStyles(colors).copy}>
          <Text style={settingsRowStyles(colors).title}>{title}</Text>
          <Text style={settingsRowStyles(colors).subtitle}>{subtitle}</Text>
        </View>
      </View>
      {rightSlot}
    </View>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const { setColorScheme } = useAppTheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top);
  const [displayName, setDisplayName] = useState('Alex Sterling');
  const [email, setEmail] = useState('alex.sterling@ledger.io');
  const [memberSince, setMemberSince] = useState('2022');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const session = await getAuthSession();
      if (!session || !active) {
        return;
      }

      setDisplayName(session.user.name || 'Alex Sterling');
      setEmail(session.user.email || 'alex.sterling@ledger.io');
      setMemberSince(
        session.user.created_at ? new Date(session.user.created_at).getFullYear().toString() : '2022'
      );
    };

    loadSession();

    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(() => {
    return displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [displayName]);

  return (
    <View style={styles.screen}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroGrid}>
          <View style={styles.profileCard}>
            <View style={styles.avatarShell}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarCore}>
                  <Text style={styles.avatarText}>{initials || 'AS'}</Text>
                </View>
              </View>
              <Pressable style={styles.editBadge}>
                <MaterialCommunityIcons name="pencil" size={14} color={colors.onPrimary} />
              </Pressable>
            </View>

            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.profileName}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={styles.profileEmail}>
                {email}
              </Text>
              <View style={styles.memberChip}>
                <Text style={styles.memberChipText}>Premium Member</Text>
              </View>
            </View>
          </View>

          <View style={styles.identityCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={34} color={colors.onPrimary} />
            <Text style={styles.identityLabel}>Identity Status</Text>
            <Text style={styles.identityValue}>Verified</Text>
            <Text style={styles.identityMeta}>Member since {memberSince}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security & Privacy</Text>
          <View style={styles.gridTwo}>
            <SettingsRow
              colors={colors}
              icon="lock-reset"
              title="Change Password"
              subtitle="Last updated 3 months ago"
              iconTone="primary"
              rightSlot={<MaterialCommunityIcons name="chevron-right" size={22} color={colors.outlineVariant} />}
            />

            <SettingsRow
              colors={colors}
              icon="fingerprint"
              title="Biometrics"
              subtitle="Touch ID & Face ID active"
              iconTone="secondary"
              rightSlot={
                <Pressable
                  onPress={() => setBiometricEnabled((value) => !value)}
                  style={[styles.switchTrack, biometricEnabled && styles.switchTrackActive]}>
                  <View style={[styles.switchThumb, biometricEnabled && styles.switchThumbActive]} />
                </Pressable>
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.preferenceBlock}>
            <SettingsRow
              colors={colors}
              icon="cash-multiple"
              title="Primary Currency"
              subtitle=""
              rightSlot={
                <View style={styles.rowValueWrap}>
                  <Text style={styles.rowValue}>USD ($)</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
                </View>
              }
              style={styles.preferenceRow}
            />

            <View style={styles.rowDivider} />

            <SettingsRow
              colors={colors}
              icon="translate"
              title="Language"
              subtitle=""
              rightSlot={
                <View style={styles.rowValueWrap}>
                  <Text style={styles.rowValue}>English (US)</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
                </View>
              }
              style={styles.preferenceRow}
            />

            <View style={styles.rowDivider} />

            <SettingsRow
              colors={colors}
              icon="weather-night"
              title="Appearance"
              subtitle=""
              rightSlot={
                <View style={styles.appearanceSegment}>
                  <Pressable
                    onPress={() => setColorScheme('light')}
                    style={[styles.appearancePill, colorScheme === 'light' && styles.appearancePillActive]}>
                    <Text style={[styles.appearanceText, colorScheme === 'light' && styles.appearanceTextActive]}>
                      Light
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setColorScheme('dark')}
                    style={[styles.appearancePill, colorScheme === 'dark' && styles.appearancePillActive]}>
                    <Text style={[styles.appearanceText, colorScheme === 'dark' && styles.appearanceTextActive]}>
                      Dark
                    </Text>
                  </Pressable>
                </View>
              }
              style={styles.preferenceRow}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.gridTwo}>
            <SettingsRow
              colors={colors}
              icon="bell-ring-outline"
              title="Push Notifications"
              subtitle="Alerts on mobile app"
              iconTone="primary"
              accent
              rightSlot={
                <Pressable
                  onPress={() => setPushEnabled((value) => !value)}
                  style={[styles.switchTrack, pushEnabled && styles.switchTrackPrimary]}>
                  <View style={[styles.switchThumb, pushEnabled && styles.switchThumbPrimary]} />
                </Pressable>
              }
            />

            <SettingsRow
              colors={colors}
              icon="email-outline"
              title="Email Alerts"
              subtitle="Weekly summaries"
              rightSlot={
                <Pressable
                  onPress={() => setEmailAlertsEnabled((value) => !value)}
                  style={[styles.switchTrack, emailAlertsEnabled && styles.switchTrackActive]}>
                  <View style={[styles.switchThumb, emailAlertsEnabled && styles.switchThumbActive]} />
                </Pressable>
              }
            />
          </View>
        </View>

        <View style={styles.logoutWrap}>
          <Pressable
            style={styles.logoutButton}
            onPress={async () => {
              await clearAuthSession();
              router.replace('/login');
            }}>
            <MaterialCommunityIcons name="logout" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const settingsRowStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    row: {
      flex: 1,
      minHeight: 86,
      borderRadius: 22,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
    },
    rowAccent: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 14,
    },
    left: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500',
    },
  });

const createStyles = (colors: AppColorTheme, topInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: Math.max(topInset + 14, 28),
      paddingBottom: 150,
      gap: 22,
    },
    heroGrid: {
      gap: 18,
    },
    profileCard: {
      borderRadius: 28,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      paddingHorizontal: 20,
      paddingVertical: 28,
      alignItems: 'center',
      gap: 20,
    },
    avatarShell: {
      position: 'relative',
      width: 108,
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 28,
      backgroundColor: colors.shellCardStrong,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: alpha(colors.primary, 0.18),
    },
    avatarCore: {
      width: 82,
      height: 82,
      borderRadius: 22,
      backgroundColor: alpha(colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.primary,
      fontSize: 32,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    editBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileCopy: {
      alignItems: 'center',
      gap: 6,
      width: '100%',
    },
    profileName: {
      color: colors.shellTextPrimary,
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '900',
      letterSpacing: -1,
    },
    profileEmail: {
      color: colors.shellTextMuted,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
    },
    memberChip: {
      marginTop: 10,
      minHeight: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: alpha(colors.secondaryAccent, 0.22),
      backgroundColor: alpha(colors.secondaryAccent, 0.12),
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberChipText: {
      color: colors.onSecondaryContainer,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    identityCard: {
      borderRadius: 28,
      backgroundColor: colors.primary,
      paddingHorizontal: 22,
      paddingVertical: 24,
      minHeight: 198,
      justifyContent: 'space-between',
    },
    identityLabel: {
      color: alpha(colors.onPrimary, 0.68),
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.8,
      marginTop: 22,
    },
    identityValue: {
      color: colors.onPrimary,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '900',
      letterSpacing: -1.1,
      marginTop: 2,
    },
    identityMeta: {
      color: alpha(colors.onPrimary, 0.76),
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '500',
      marginTop: 24,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      color: colors.primary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      paddingHorizontal: 8,
    },
    gridTwo: {
      gap: 12,
    },
    preferenceBlock: {
      borderRadius: 24,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      overflow: 'hidden',
    },
    preferenceRow: {
      minHeight: 76,
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.shellBorder,
      marginHorizontal: 18,
    },
    rowValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    rowValue: {
      color: colors.primary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
    },
    appearanceSegment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.shellCardMuted,
      borderRadius: 18,
      padding: 4,
    },
    appearancePill: {
      minWidth: 50,
      minHeight: 28,
      paddingHorizontal: 12,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appearancePillActive: {
      backgroundColor: colors.primary,
    },
    appearanceText: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
    },
    appearanceTextActive: {
      color: colors.onPrimary,
    },
    switchTrack: {
      width: 44,
      height: 24,
      borderRadius: 14,
      backgroundColor: colors.shellCardMuted,
      padding: 3,
      justifyContent: 'center',
    },
    switchTrackActive: {
      backgroundColor: alpha(colors.secondary, 0.28),
    },
    switchTrackPrimary: {
      backgroundColor: alpha(colors.primary, 0.28),
    },
    switchThumb: {
      width: 18,
      height: 18,
      borderRadius: 10,
      backgroundColor: colors.outlineVariant,
    },
    switchThumbActive: {
      alignSelf: 'flex-end',
      backgroundColor: colors.secondaryAccent,
    },
    switchThumbPrimary: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primaryContainer,
    },
    logoutWrap: {
      paddingTop: 8,
      alignItems: 'center',
    },
    logoutButton: {
      minHeight: 56,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: alpha(colors.danger, 0.32),
      backgroundColor: alpha(colors.danger, 0.1),
      paddingHorizontal: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    logoutText: {
      color: colors.danger,
      fontSize: 15,
      fontWeight: '800',
    },
  });
