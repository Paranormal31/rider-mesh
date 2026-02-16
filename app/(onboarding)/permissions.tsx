import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard } from '@/src/components/ui';
import { permissionsService, type PermissionSnapshot } from '@/src/services';
import { colors, spacing, typography } from '@/src/theme';

const permissionItems: {
  label: string;
  key: keyof PermissionSnapshot;
}[] = [
  { label: 'Location', key: 'location' },
  { label: 'Bluetooth', key: 'bluetooth' },
  { label: 'Notifications', key: 'notifications' },
  { label: 'Motion Sensors', key: 'motion' },
];

export default function PermissionsRoute() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);

  const onGrantPermissions = async () => {
    setIsSubmitting(true);
    try {
      const next = await permissionsService.requestAllBestEffort();
      setSnapshot(next);
    } finally {
      setIsSubmitting(false);
      router.push('/(onboarding)/profile-setup');
    }
  };

  return (
    <AppScreen>
      <View style={styles.container}>
        <SectionCard>
          <Text style={styles.title}>Permissions</Text>
          <Text style={styles.subtitle}>We need access to:</Text>
          <View style={styles.list}>
            {permissionItems.map((item) => (
              <Text key={item.label} style={styles.item}>
                {`- ${item.label}${snapshot ? ` (${snapshot[item.key]})` : ''}`}
              </Text>
            ))}
          </View>
          <PrimaryButton
            label={isSubmitting ? 'Requesting...' : 'Grant Permissions'}
            onPress={() => {
              void onGrantPermissions();
            }}
            disabled={isSubmitting}
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
  list: {
    gap: spacing.sm,
  },
  item: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
