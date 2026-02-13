import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ServiceStatusCard } from '@/src/components/ServiceStatusCard';
import { crashDetectionService } from '@/src/services';
import { getInitialServiceStatuses } from '@/src/utils/getInitialServiceStatuses';

export function HomeScreen() {
  const statuses = getInitialServiceStatuses();
  const [crashDetected, setCrashDetected] = useState(false);

  useEffect(() => {
    const unsubscribe = crashDetectionService.on('CRASH_DETECTED', () => {
      setCrashDetected(true);
    });

    crashDetectionService.start().catch(() => {
      // Temporary verification mode: ignore startup errors in UI state.
    });

    return () => {
      unsubscribe();
      crashDetectionService.stop();
    };
  }, []);

  return (
    <View style={[styles.container, crashDetected && styles.crashContainer]}>
      {crashDetected ? (
        <Text style={styles.crashText}>CRASH DETECTED</Text>
      ) : (
        <>
          <Text style={styles.title}>Dextrex Control Center</Text>
          <Text style={styles.subtitle}>
            UI is separated from service logic and ready for feature growth.
          </Text>

          <View style={styles.section}>
            {statuses.map((service) => (
              <ServiceStatusCard key={service.name} service={service} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 18,
  },
  crashContainer: {
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 12,
  },
  crashText: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
