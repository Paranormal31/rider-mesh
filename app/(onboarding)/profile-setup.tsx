import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard } from '@/src/components/ui';
import { onboardingService } from '@/src/services';
import { colors, spacing, typography } from '@/src/theme';

export default function ProfileSetupRoute() {
  const router = useRouter();

  return (
    <AppScreen>
      <View style={styles.container}>
        <SectionCard>
          <Text style={styles.title}>Profile Setup</Text>
          <Text style={styles.subtitle}>Placeholder setup screen for Block 1.</Text>
          <PrimaryButton
            label="Complete Setup"
            onPress={() => {
              onboardingService
                .setComplete(true)
                .then(() => router.replace('/(tabs)'))
                .catch(() => {});
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
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
