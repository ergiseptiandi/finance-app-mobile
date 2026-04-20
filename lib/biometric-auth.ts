import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'finance-go.biometric.enabled';
const BIOMETRIC_REFRESH_TOKEN_KEY = 'finance-go.biometric.refresh-token';

export type BiometricState = {
  available: boolean;
  enabled: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
};

const getEnabledFlag = async () => (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true';

export const getBiometricState = async (): Promise<BiometricState> => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const [enabled, refreshToken] = await Promise.all([
    getEnabledFlag(),
    SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
  ]);

  let enrolledLevel = LocalAuthentication.SecurityLevel.NONE;

  if (hasHardware) {
    try {
      enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    } catch {
      enrolledLevel = LocalAuthentication.SecurityLevel.NONE;
    }
  }

  const isEnrolled = enrolledLevel !== LocalAuthentication.SecurityLevel.NONE;

  return {
    available: hasHardware && isEnrolled,
    enabled: enabled && Boolean(refreshToken),
    hasHardware,
    isEnrolled,
  };
};

export const getBiometricRefreshToken = async () => {
  const [enabled, refreshToken] = await Promise.all([
    getEnabledFlag(),
    SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY),
  ]);

  return enabled ? refreshToken : null;
};

export const saveBiometricCredentials = async (refreshToken: string) => {
  await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
};

export const syncBiometricCredentials = async (refreshToken: string) => {
  if (!(await getEnabledFlag())) {
    return;
  }

  await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY, refreshToken);
};

export const clearBiometricCredentials = async () => {
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_TOKEN_KEY);
};

export const authenticateBiometric = async (promptMessage: string) => {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use PIN',
  });

  return result.success;
};
