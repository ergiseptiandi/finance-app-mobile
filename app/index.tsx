import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAuthSession } from '@/lib/auth-session';
import { getBiometricState } from '@/lib/biometric-auth';
import { getOnboardingCompleted } from '@/lib/onboarding';

export default function Index() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [target, setTarget] = useState<'loading' | '/onboarding' | '/login' | '/biometric-unlock' | '/(tabs)'>('loading');

  useEffect(() => {
    let active = true;

    const resolveTarget = async () => {
      const [completed, session, biometricState] = await Promise.all([
        getOnboardingCompleted(),
        getAuthSession(),
        getBiometricState(),
      ]);

      if (!active) {
        return;
      }

      if (!completed) {
        setTarget('/onboarding');
        return;
      }

      if (!session) {
        setTarget('/login');
        return;
      }

      setTarget(biometricState.enabled ? '/biometric-unlock' : '/(tabs)');
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
