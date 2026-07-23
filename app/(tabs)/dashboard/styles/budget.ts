import { alpha, type AppColorTheme } from '@/constants/theme';
import { type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

export const budgetStyles = (colors: AppColorTheme, compact: boolean, isDark: boolean): Record<string, AnyStyle> => ({
  budgetEmptyState: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  budgetEmptyTitle: { color: colors.shellTextPrimary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  budgetEmptyBody: { color: colors.shellTextMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  budgetAlert: { borderRadius: 20, backgroundColor: alpha(colors.danger, isDark ? 0.14 : 0.1), paddingHorizontal: 14, paddingVertical: 12 },
  budgetAlertText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  budgetPreviewList: { gap: 8 },
  budgetPreviewItem: { gap: 6, borderRadius: 16, backgroundColor: colors.shellCardMuted, padding: 12 },
  budgetPreviewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  budgetPreviewCopy: { flex: 1, minWidth: 0, gap: 2 },
  budgetPreviewTitle: { color: colors.shellTextPrimary, fontSize: 14, fontWeight: '800' },
  budgetPreviewMeta: { color: colors.shellTextMuted, fontSize: 12, fontWeight: '600' },
  budgetPreviewPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  budgetPreviewPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  budgetPreviewTrack: { height: 3, borderRadius: 999, backgroundColor: colors.shellCard, overflow: 'hidden' },
  budgetPreviewFill: { height: '100%', borderRadius: 999 },
  budgetSnapshotRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 },
  budgetRingShell: { width: 118, alignItems: 'center', justifyContent: 'center' },
  budgetSnapshotCopy: { flex: 1, minWidth: 0, gap: 8 },
  budgetSnapshotEyebrow: { color: colors.shellTextSoft, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', lineHeight: 14 },
  budgetSnapshotTitle: { color: colors.shellTextPrimary, fontSize: 16, lineHeight: 21, fontWeight: '900', letterSpacing: -0.4 },
  budgetSnapshotBody: { color: colors.shellTextMuted, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  budgetSnapshotStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  budgetSnapshotStat: { flexGrow: 1, minWidth: 86, borderRadius: 14, backgroundColor: colors.shellCardSoft, paddingHorizontal: 10, paddingVertical: 10, gap: 4, borderWidth: 1, borderColor: colors.shellBorder },
  budgetSnapshotStatLabel: { color: colors.shellTextSoft, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', lineHeight: 12 },
  budgetSnapshotStatValue: { color: colors.shellTextPrimary, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  budgetSnapshotNote: { color: colors.warning, fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
