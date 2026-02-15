import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionCard } from '@/src/components/ui';
import { rideSessionService, type RideSummary } from '@/src/services';

export function RideSummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ summaryId?: string }>();
  const [summary, setSummary] = useState<RideSummary | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await rideSessionService.load();
      const summaries = rideSessionService.getSummaries();
      const selected =
        (params.summaryId ? summaries.find((item) => item.id === params.summaryId) : null) ?? summaries[0] ?? null;
      if (active) {
        setSummary(selected);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [params.summaryId]);

  const durationLabel = useMemo(() => {
    if (!summary) {
      return '00:00:00';
    }
    return formatDuration(summary.durationMs);
  }, [summary]);

  return (
    <AppScreen>
      <View style={styles.container}>
        <Text style={styles.title}>Ride Summary</Text>
        <SectionCard>
          <Text style={styles.metric}>Duration: {durationLabel}</Text>
          <Text style={styles.metric}>Distance: {summary?.distanceKm ?? 0} km</Text>
          <Text style={styles.metric}>Fatigue Warnings: {summary?.fatigueWarnings ?? 0}</Text>
          <Text style={styles.metric}>Hazards Reported: {summary?.hazardsReported ?? 0}</Text>
          <Text style={styles.metric}>SOS Triggered: {summary?.sosTriggered ?? 0}</Text>
        </SectionCard>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/ride-history')}>
          <Text style={styles.primaryText}>Save Ride</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.secondaryText}>Back to Dashboard</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  metric: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#D1D5DB',
    fontSize: 15,
    fontWeight: '700',
  },
});
