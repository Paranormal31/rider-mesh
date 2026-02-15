import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard } from '@/src/components/ui';
import { colors, spacing, typography } from '@/src/theme';

export default function SplashRoute() {
  const router = useRouter();

  return (
    <AppScreen>
      <View style={styles.container}>
        <SectionCard>
          <Text style={styles.title}>RiderShield</Text>
          <Text style={styles.subtitle}>Offline Safety for Every Ride</Text>
          <PrimaryButton
            label="Continue"
            onPress={() => {
              router.push('/(onboarding)/permissions');
            }}
          />
        </SectionCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
