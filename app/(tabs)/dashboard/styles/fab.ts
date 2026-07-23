import { type AppColorTheme } from '@/constants/theme';
import { type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

export const fabStyles = (colors: AppColorTheme, _compact: boolean, _isDark: boolean): Record<string, AnyStyle> => ({

  fabOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 99 },
  fabMenu: { gap: 10 },
  fabMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.shellCard, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.shellBorder, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  fabMenuIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fabMenuLabel: { color: colors.shellTextPrimary, fontSize: 13, fontWeight: '700' },
  fab: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabPressed: { opacity: 0.9, transform: [{ scale: 0.95 }] },
});
