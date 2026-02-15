import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionCard } from '@/src/components/ui';
import { sosSimulationService, type SosIncident } from '@/src/services';

export function SosReceivedScreen() {
  const [incidents, setIncidents] = useState<SosIncident[]>([]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      const seeded = await sosSimulationService.seedDemoIncidents();
      if (active) {
        setIncidents(seeded);
      }
    };
    void boot();

    const offChanged = sosSimulationService.on('INCIDENTS_CHANGED', ({ incidents: next }) => {
      setIncidents(next);
    });

    return () => {
      active = false;
      offChanged();
    };
  }, []);

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>SOS Received</Text>
        {incidents.length === 0 ? (
          <SectionCard>
            <Text style={styles.emptyText}>No nearby SOS alerts right now.</Text>
          </SectionCard>
        ) : (
          incidents.map((incident) => (
            <SectionCard key={incident.id}>
              <Text style={styles.riderName}>{incident.riderName}</Text>
              <Text style={styles.meta}>
                Distance: {incident.distanceMeters}m | Severity: {incident.severity}
              </Text>
              <Text style={styles.meta}>
                {incident.responding ? 'You are marked as responding.' : 'Awaiting responder.'}
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={() => {}}>
                  <Text style={styles.secondaryButtonText}>Navigate</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => {}}>
                  <Text style={styles.secondaryButtonText}>Call Rider</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.primaryButton, incident.responding && styles.primaryButtonDisabled]}
                disabled={incident.responding}
                onPress={() => {
                  void sosSimulationService.markResponding(incident.id);
                }}>
                <Text style={styles.primaryButtonText}>
                  {incident.responding ? 'Responding' : 'Mark as Responding'}
                </Text>
              </Pressable>
            </SectionCard>
          ))
        )}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  riderName: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
