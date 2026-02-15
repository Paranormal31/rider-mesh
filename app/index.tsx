import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { onboardingService } from '@/src/services';
import { colors } from '@/src/theme';

export default function IndexRoute() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const runGate = async () => {
      const complete = await onboardingService.isComplete();
      if (!active) {
        return;
      }
      if (complete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)/splash');
      }
      setIsChecking(false);
    };

    void runGate();

    return () => {
      active = false;
    };
  }, [router]);

  if (!isChecking) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.textPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
