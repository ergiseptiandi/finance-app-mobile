import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((value) => value + value)
          .join('')
      : normalized;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
};

export const alpha = (hex: string, opacity: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const light = {
  primary: '#0057bd',
  primaryContainer: '#6e9fff',
  onPrimary: '#f6f6ff',
  secondary: '#006a2d',
  secondaryContainer: '#d6f6dd',
  onSecondaryContainer: '#0d3a1b',
  secondaryAccent: '#6bff8f',
  surface: '#f6f6ff',
  surfaceContainerLow: '#eef0ff',
  surfaceContainer: '#e4e9ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerHigh: '#d9e2ff',
  surfaceContainerHighest: '#d1dcff',
  onSurface: '#272e42',
  onSurfaceVariant: '#535b71',
  outlineVariant: '#a5adc6',
  inverseSurface: '#060e20',
  danger: '#b31b25',
  dangerSoft: '#fff1f3',
  success: '#006a2d',
  successSoft: '#ebf8ef',
  warning: '#8a5600',
  warningSoft: '#fff4dd',
  inputPlaceholder: '#8f96ad',
  text: '#272e42',
  background: '#f6f6ff',
  tint: '#0057bd',
  icon: '#6f768e',
  tabIconDefault: '#8f96ad',
  tabIconSelected: '#0057bd',
  border: alpha('#a5adc6', 0.15),
  card: '#ffffff',
  notification: '#006a2d',
  glassSurface: alpha('#ffffff', 0.72),
  glassBorder: alpha('#ffffff', 0.78),
  ambientShadow: alpha('#272e42', 0.1),
  ambientShadowStrong: alpha('#272e42', 0.16),
  primaryGlow: alpha('#6e9fff', 0.22),
  secondaryGlow: alpha('#6bff8f', 0.16),
  heroOverlay: alpha('#ffffff', 0.16),
  inverseText: '#f6f6ff',
  inverseTextMuted: alpha('#f6f6ff', 0.72),
  inverseTextSoft: alpha('#f6f6ff', 0.82),
  ghostBorder: alpha('#6e9fff', 0.3),
  dividerSoft: '#d9e2ff',
};

const dark = {
  primary: '#6e9fff',
  primaryContainer: '#3e73d5',
  onPrimary: '#06172f',
  secondary: '#64d98a',
  secondaryContainer: '#10351f',
  onSecondaryContainer: '#d6f6dd',
  secondaryAccent: '#64d98a',
  surface: '#060e20',
  surfaceContainerLow: '#0b1630',
  surfaceContainer: '#112041',
  surfaceContainerLowest: '#101c38',
  surfaceContainerHigh: '#18305e',
  surfaceContainerHighest: '#1d3a70',
  onSurface: '#eff4ff',
  onSurfaceVariant: '#a7b5d4',
  outlineVariant: '#627192',
  inverseSurface: '#f6f6ff',
  danger: '#ff7c85',
  dangerSoft: '#432029',
  success: '#64d98a',
  successSoft: '#0f3320',
  warning: '#ffb95c',
  warningSoft: '#3b2812',
  inputPlaceholder: '#7f8cad',
  text: '#eff4ff',
  background: '#060e20',
  tint: '#6e9fff',
  icon: '#9fb0da',
  tabIconDefault: '#7183af',
  tabIconSelected: '#6e9fff',
  border: alpha('#627192', 0.22),
  card: '#101c38',
  notification: '#64d98a',
  glassSurface: alpha('#101c38', 0.82),
  glassBorder: alpha('#d9e2ff', 0.12),
  ambientShadow: alpha('#000000', 0.24),
  ambientShadowStrong: alpha('#000000', 0.34),
  primaryGlow: alpha('#6e9fff', 0.24),
  secondaryGlow: alpha('#64d98a', 0.16),
  heroOverlay: alpha('#ffffff', 0.08),
  inverseText: '#f6f6ff',
  inverseTextMuted: alpha('#f6f6ff', 0.72),
  inverseTextSoft: alpha('#f6f6ff', 0.82),
  ghostBorder: alpha('#6e9fff', 0.24),
  dividerSoft: '#18305e',
};

export const Colors = {
  light,
  dark,
};

export type AppColorTheme = (typeof Colors)['light'];

export const NavigationThemes: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: light.primary,
      background: light.background,
      card: light.surfaceContainerLowest,
      text: light.text,
      border: light.border,
      notification: light.notification,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: dark.primary,
      background: dark.background,
      card: dark.surfaceContainerLowest,
      text: dark.text,
      border: dark.border,
      notification: dark.notification,
    },
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
