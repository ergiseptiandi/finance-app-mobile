import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, type AppColorTheme } from '@/constants/theme';

const TAB_ICONS: Record<string, [keyof typeof MaterialCommunityIcons.glyphMap, keyof typeof MaterialCommunityIcons.glyphMap]> = {
  index: ['home-variant-outline', 'home-variant'],
  activity: ['swap-horizontal', 'swap-horizontal-bold'],
  debt: ['credit-card-outline', 'credit-card'],
  reports: ['chart-box-outline', 'chart-box'],
  settings: ['cog-outline', 'cog'],
};

type KineticTabBarProps = BottomTabBarProps & {
  colors: AppColorTheme;
};

export function KineticTabBar({ state, descriptors, navigation, colors }: KineticTabBarProps) {
  const insets = useSafeAreaInsets();
  const isDark = colors.background !== '#FFFFFF' && colors.background !== '#ffffff';
  const styles = createStyles(colors, isDark);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        const isFocused = state.index === index;
        const rawLabel =
          typeof descriptor.options.tabBarLabel === 'string'
            ? descriptor.options.tabBarLabel
            : typeof descriptor.options.title === 'string'
              ? descriptor.options.title
              : route.name;

        const [iconOutline, iconFilled] = TAB_ICONS[route.name] ?? ['circle-outline', 'circle'];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <PlatformPressable
            key={route.key}
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
            testID={descriptor.options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}>
            <MaterialCommunityIcons
              name={isFocused ? iconFilled : iconOutline}
              size={22}
              color={isFocused ? colors.primary : colors.outlineVariant}
            />
            <Text
              numberOfLines={1}
              style={[styles.label, isFocused && styles.labelActive]}>
              {rawLabel}
            </Text>
          </PlatformPressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: AppColorTheme, isDark: boolean) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingTop: 8,
      paddingHorizontal: 6,
      backgroundColor: isDark ? alpha(colors.surface, 0.97) : alpha('#ffffff', 0.97),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: alpha(colors.outlineVariant, 0.3),
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 4,
    },
    label: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '500',
      color: colors.outlineVariant,
    },
    labelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
