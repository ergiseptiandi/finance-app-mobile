import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, type AppColorTheme } from '@/constants/theme';

const TAB_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  index: 'home',
  activity: 'swap-horizontal',
  debt: 'wallet-outline',
  reports: 'chart-bar',
  settings: 'cog-outline',
};

type KineticTabBarProps = BottomTabBarProps & {
  colors: AppColorTheme;
};

export function KineticTabBar({ state, descriptors, navigation, colors }: KineticTabBarProps) {
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const isFocused = state.index === index;
          const rawLabel =
            typeof descriptor.options.tabBarLabel === 'string'
              ? descriptor.options.tabBarLabel
              : typeof descriptor.options.title === 'string'
                ? descriptor.options.title
                : route.name;

          const label = rawLabel.toUpperCase();

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
              style={[styles.item, isFocused && styles.itemActive]}>
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <MaterialCommunityIcons
                  name={TAB_ICONS[route.name] ?? 'circle-outline'}
                  size={18}
                  color={isFocused ? colors.primary : colors.outlineVariant}
                />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.label, { color: isFocused ? colors.primary : colors.outlineVariant }]}>
                {label}
              </Text>
            </PlatformPressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 6,
      paddingHorizontal: 10,
      backgroundColor: colors.shellTabBar,
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
      shadowColor: alpha(colors.onSurface, 0.06),
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: -2 },
      elevation: 8,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 8,
      paddingTop: 3,
      paddingBottom: 2,
      backgroundColor: colors.shellTabBar,
    },
    item: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 10,
      borderRadius: 22,
    },
    itemActive: {
      backgroundColor: colors.shellTabActive,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapActive: {
      backgroundColor: colors.shellTabIconActive,
    },
    label: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
  });
