import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_STORAGE_KEY = '@dextrix/onboarding-complete/v1';

class OnboardingService {
  async isComplete(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      return raw === 'true';
    } catch {
      return false;
    }
  }

  async setComplete(value: boolean): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, value ? 'true' : 'false');
  }
}

export const onboardingService = new OnboardingService();
