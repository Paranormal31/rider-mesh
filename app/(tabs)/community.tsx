import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionCard, StatusBadge } from '@/src/components/ui';
import { colors, spacing, typography } from '@/src/theme';

export default function CommunityRoute() {
  return (
    <AppScreen>
      <View style={styles.container}>
        <SectionCard>
          <Text style={styles.title}>Community</Text>
          <Text style={styles.subtitle}>Placeholder screen for Block 1.</Text>
          <StatusBadge variant="mesh" />
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
