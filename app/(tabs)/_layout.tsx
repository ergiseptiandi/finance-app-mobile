import { Tabs } from 'expo-router';
import React from 'react';

import { KineticTabBar } from '@/components/kinetic-tab-bar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useAppLanguage();

  return (
    <Tabs
      lazy={false}
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
          title: t('tabs.home'),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('tabs.activity'),
        }}
      />
      <Tabs.Screen
        name="debt"
        options={{
          title: t('tabs.debt'),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
        }}
      />
    </Tabs>
  );
}
