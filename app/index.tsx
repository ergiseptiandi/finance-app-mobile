import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAuthSession } from '@/lib/auth-session';

export default function Index() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [target, setTarget] = useState<'loading' | '/login' | '/(tabs)'>('loading');

  useEffect(() => {
    let active = true;

    const resolveTarget = async () => {
      const session = await getAuthSession();
      if (!active) {
        return;
      }

      setTarget(session ? '/(tabs)' : '/login');
    };

    resolveTarget();

    return () => {
      active = false;
    };
  }, []);

  if (target === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={target} />;
}
