import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { AppScreen, SectionCard } from '@/src/components/ui';
import { rideSessionService, type RideSummary } from '@/src/services';
import { colors, spacing, typography } from '@/src/theme';

export default function RideHistoryRoute() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<RideSummary[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await rideSessionService.load();
      if (active) {
        setSummaries(rideSessionService.getSummaries());
      }
    };
    void load();

    const offEnded = rideSessionService.on('RIDE_ENDED', () => {
      setSummaries(rideSessionService.getSummaries());
    });

    return () => {
      active = false;
      offEnded();
    };
  }, []);

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ride History</Text>
        {summaries.length === 0 ? (
          <SectionCard>
            <Text style={styles.subtitle}>No rides yet. Start a ride from Home to build history.</Text>
          </SectionCard>
        ) : (
          summaries.map((summary) => (
            <Pressable
              key={summary.id}
              onPress={() => router.push({ pathname: '/ride-summary', params: { summaryId: summary.id } })}>
              <SectionCard>
                <Text style={styles.itemDate}>{new Date(summary.createdAt).toLocaleString()}</Text>
                <Text style={styles.itemMetric}>Duration: {formatDuration(summary.durationMs)}</Text>
                <Text style={styles.itemMetric}>Distance: {summary.distanceKm} km</Text>
                <Text style={styles.itemMetric}>
                  Hazards: {summary.hazardsReported} | SOS: {summary.sosTriggered}
                </Text>
              </SectionCard>
            </Pressable>
          ))
        )}
      </ScrollView>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  itemDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemMetric: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
