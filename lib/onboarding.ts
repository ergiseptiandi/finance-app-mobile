import * as SecureStore from 'expo-secure-store';

const ONBOARDING_STORAGE_KEY = 'finance-go.onboarding.complete';

export const getOnboardingCompleted = async () => {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_STORAGE_KEY)) === 'true';
  } catch {
    return false;
  }
};

export const setOnboardingCompleted = async () => {
  try {
    await SecureStore.setItemAsync(ONBOARDING_STORAGE_KEY, 'true');
  } catch {
    // Ignore persistence failures; the onboarding screen can be shown again.
  }
};
