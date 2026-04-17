import { Tabs } from 'expo-router';
import React from 'react';

import { KineticTabBar } from '@/components/kinetic-tab-bar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Tabs
      tabBar={(props) => <KineticTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.shellBackground,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
        }}
      />
      <Tabs.Screen
        name="debt"
        options={{
          title: 'Debt',
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}
