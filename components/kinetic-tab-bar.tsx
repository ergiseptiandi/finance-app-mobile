import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, alpha } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TAB_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  index: 'home',
  activity: 'swap-horizontal',
  debt: 'wallet-outline',
  reports: 'chart-bar',
  settings: 'cog-outline',
};

export function KineticTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const styles = createStyles(colors);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.container, { backgroundColor: colors.shellTabBar }]}>
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

const createStyles = (colors: (typeof Colors)['light']) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 14,
      paddingTop: 8,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 28,
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      shadowColor: alpha(colors.onSurface, 0.18),
      shadowOpacity: 1,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: -8 },
      elevation: 20,
    },
    item: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 2,
      paddingVertical: 8,
      borderRadius: 22,
    },
    itemActive: {
      backgroundColor: colors.shellTabActive,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapActive: {
      backgroundColor: colors.shellTabIconActive,
    },
    label: {
      fontSize: 9,
      lineHeight: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
  });
