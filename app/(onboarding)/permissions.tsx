import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard } from '@/src/components/ui';
import { permissionsService, type PermissionSnapshot } from '@/src/services';
import { colors, spacing, typography } from '@/src/theme';

const permissionItems = ['Location', 'Bluetooth', 'SMS', 'Motion Sensors'];

const statusLabels: Record<string, string> = {
  granted: 'Granted',
  denied: 'Denied',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
};

export default function PermissionsRoute() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    permissionsService
      .getSnapshot()
      .then((data) => {
        if (active) {
          setSnapshot(data);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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
              <Text key={item} style={styles.item}>
                {`- ${item}`}
              </Text>
            ))}
          </View>
          {isLoading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <View style={styles.statusList}>
              <Text style={styles.statusTitle}>Current Status</Text>
              <Text style={styles.statusItem}>
                Location: {statusLabels[snapshot?.location ?? 'unknown']}
              </Text>
              <Text style={styles.statusItem}>
                Notifications: {statusLabels[snapshot?.notifications ?? 'unknown']}
              </Text>
              <Text style={styles.statusItem}>Motion: {statusLabels[snapshot?.motion ?? 'unknown']}</Text>
              <Text style={styles.statusItem}>
                Bluetooth: {statusLabels[snapshot?.bluetooth ?? 'unknown']}
              </Text>
              <Text style={styles.statusItem}>SMS: {statusLabels[snapshot?.sms ?? 'unknown']}</Text>
            </View>
          )}
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
  statusList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  statusTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusItem: {
    ...typography.caption,
    color: colors.textPrimary,
  },
});
