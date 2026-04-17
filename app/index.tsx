import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { getAuthSession } from '@/lib/auth-session';

export default function Index() {
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
          backgroundColor: '#f6f6ff',
        }}>
        <ActivityIndicator size="large" color="#0057bd" />
      </View>
    );
  }

  return <Redirect href={target} />;
}
