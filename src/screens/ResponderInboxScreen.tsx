import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { responderService, type ResponderAlert } from '@/src/services';

export function ResponderInboxScreen() {
  const [alerts, setAlerts] = useState<ResponderAlert[]>(responderService.getAlerts());
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      await responderService.start();
      if (active) {
        setAlerts(responderService.getAlerts());
      }
    };

    void boot();

    const off = responderService.on('ALERTS_UPDATED', ({ alerts: nextAlerts }) => {
      setAlerts(nextAlerts);
    });

    return () => {
      active = false;
      off();
      responderService.stop();
    };
  }, []);

  const onAccept = async (alertId: string) => {
    setFeedback(null);
    const result = await responderService.acceptAlert(alertId);
    if (!result.ok) {
      setFeedback(result.reason ?? 'Unable to accept alert');
    } else {
      setFeedback('Alert accepted');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Responder Inbox</Text>
      <Text style={styles.subtitle}>Nearby alerts within 1km appear here.</Text>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      {alerts.length === 0 ? (
        <Text style={styles.emptyText}>No nearby open alerts.</Text>
      ) : (
        <View style={styles.list}>
          {alerts.map((alert) => (
            <View key={alert.alertId} style={styles.card}>
              <Text style={styles.cardTitle}>Alert {alert.alertId.slice(-6)}</Text>
              <Text style={styles.cardText}>Victim: {alert.victimDeviceId}</Text>
              <Text style={styles.cardText}>
                Distance: {Math.round(alert.distanceMeters)}m
              </Text>
              <Text style={styles.cardText}>
                Triggered: {new Date(alert.triggeredAt).toLocaleTimeString()}
              </Text>
              <Pressable style={styles.acceptButton} onPress={() => void onAccept(alert.alertId)}>
                <Text style={styles.acceptButtonText}>Accept</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
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
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  feedback: {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 15,
    marginTop: 8,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cardText: {
    color: '#D1D5DB',
    fontSize: 13,
  },
  acceptButton: {
    marginTop: 6,
    backgroundColor: '#16A34A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#ECFDF5',
    fontSize: 14,
    fontWeight: '800',
  },
});
