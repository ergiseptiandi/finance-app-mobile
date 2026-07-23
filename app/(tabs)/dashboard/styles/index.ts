import { Colors, type AppColorTheme } from '@/constants/theme';

import { layoutStyles } from './layout';
import { budgetStyles } from './budget';
import { componentStyles } from './components';
import { insightStyles } from './insights';
import { modalStyles } from './modals';
import { fabStyles } from './fab';

export const createStyles = (colors: AppColorTheme, width: number, topInset: number, bottomInset: number): Record<string, any> => {
  const compact = width < 360;
  const isDark = colors.background === Colors.dark.background;

  return {
    ...layoutStyles(colors, compact, isDark),
    ...budgetStyles(colors, compact, isDark),
    ...componentStyles(colors, compact, isDark),
    ...insightStyles(colors, compact, isDark),
    ...modalStyles(colors, compact, isDark),
    ...fabStyles(colors, compact, isDark),
    content: {
      paddingTop: Math.max(topInset + 14, 28),
      paddingHorizontal: compact ? 16 : 18,
      paddingBottom: 164,
      gap: 20,
    },
    fabContainer: {
      position: 'absolute' as const,
      bottom: Math.max(bottomInset + 90, 100),
      right: 18,
      zIndex: 100,
      alignItems: 'flex-end' as const,
      gap: 12,
    },
  };
};
