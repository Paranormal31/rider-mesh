import { StyleSheet, Text, View } from 'react-native';

import type { ServiceHealth } from '@/src/services';

type ServiceStatusCardProps = {
  service: ServiceHealth;
};

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{service.name}</Text>
      <Text style={styles.state}>{service.state.toUpperCase()}</Text>
      <Text style={styles.detail}>{service.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  name: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  state: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  detail: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
});
