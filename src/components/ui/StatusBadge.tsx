import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme';

type StatusBadgeVariant = 'internet' | 'mesh' | 'hybrid' | 'offline';

type StatusBadgeProps = {
  variant: StatusBadgeVariant;
};

const variantMeta: Record<StatusBadgeVariant, { label: string; color: string }> = {
  internet: { label: 'Internet', color: colors.success },
  mesh: { label: 'Mesh Only', color: colors.meshCyan },
  hybrid: { label: 'Hybrid', color: '#22C55E' },
  offline: { label: 'Offline', color: colors.error },
};

export function StatusBadge({ variant }: StatusBadgeProps) {
  const meta = variantMeta[variant];
  return (
    <View style={[styles.badge, { borderColor: meta.color }]}>
      <Text style={[styles.text, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
