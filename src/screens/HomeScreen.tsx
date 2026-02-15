import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/src/components/ui';
import {
  crashDetectionService,
  emergencyControllerService,
  hazardService,
  locationService,
  networkMeshService,
  profileService,
  responderService,
  rideSessionService,
  settingsService,
  type HazardRecord,
  type NetworkMeshStatus,
  type ResponderAlert,
  type RideSession,
} from '@/src/services';

type Position = { latitude: number; longitude: number };

type MapModules = {
  available: boolean;
  MapView?: ComponentType<any>;
  Marker?: ComponentType<any>;
  Polyline?: ComponentType<any>;
};

function loadMapModules(): MapModules {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps');
    return {
      available: true,
      MapView: maps.default,
      Marker: maps.Marker,
      Polyline: maps.Polyline,
    };
  } catch {
    return { available: false };
  }
}

export function HomeScreen() {
  const router = useRouter();
  const mapModules = useMemo(loadMapModules, []);
  const [riderName, setRiderName] = useState('Rider');
  const [networkStatus, setNetworkStatus] = useState<NetworkMeshStatus>('INTERNET');
  const [rideSession, setRideSession] = useState<RideSession>(rideSessionService.getCurrentSession());
  const [elapsedMs, setElapsedMs] = useState(rideSessionService.getElapsedMs());
  const [hazards, setHazards] = useState<HazardRecord[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Position[]>([]);
  const [controllerState, setControllerState] = useState(emergencyControllerService.getState());
  const [responderAlerts, setResponderAlerts] = useState<ResponderAlert[]>(responderService.getAlerts());
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);
  const [responderFeedback, setResponderFeedback] = useState<string | null>(null);
  const [isAcceptingAlert, setIsAcceptingAlert] = useState(false);

  const crashModalOpen = useRef(false);
  const contentFade = useRef(new Animated.Value(0)).current;
  const sosPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;

    const loadBootstrap = async () => {
      try {
        const [settings, profile, loadedHazards] = await Promise.all([
          settingsService.loadSettings(),
          profileService.getProfile(),
          hazardService.listHazards(),
          rideSessionService.load(),
          networkMeshService.load(),
        ]);

        crashDetectionService.applySensitivity(settings.sensitivity);
        await emergencyControllerService.start();

        if (!active) {
          return;
        }

        setControllerState(emergencyControllerService.getState());
        setNetworkStatus(networkMeshService.getStatus());
        setRideSession(rideSessionService.getCurrentSession());
        setElapsedMs(rideSessionService.getElapsedMs());
        setHazards(loadedHazards);
        if (profile?.name) {
          setRiderName(profile.name);
        }
      } catch {
        if (active) {
          setControllerState('NORMAL');
        }
      }
    };

    void loadBootstrap();

    const offSettings = settingsService.on('SETTINGS_CHANGED', ({ settings }) => {
      crashDetectionService.applySensitivity(settings.sensitivity);
    });
    const offPreDelay = emergencyControllerService.on('PRE_DELAY_STARTED', () => {
      setControllerState('ALERT_PRE_DELAY');
      if (!crashModalOpen.current) {
        crashModalOpen.current = true;
        activeSosModalOpen.current = false;
        router.push('/crash-alert');
      }
    });
    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setControllerState('ALERT_PENDING');
      if (!crashModalOpen.current) {
        crashModalOpen.current = true;
        router.push('/crash-alert');
      }
      setElapsedMs(rideSessionService.getElapsedMs() + event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', () => {
      setControllerState('ALERT_PENDING');
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setControllerState('NORMAL');
      crashModalOpen.current = false;
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setControllerState(emergencyControllerService.getState());
      crashModalOpen.current = true;
      activeSosModalOpen.current = false;
    });
    const offNetwork = networkMeshService.on('STATUS_CHANGED', ({ status }) => {
      setNetworkStatus(status);
    });
    const offRideTick = rideSessionService.on('RIDE_TICK', (event) => {
      setElapsedMs(event.elapsedMs);
    });
    const offRideStarted = rideSessionService.on('RIDE_STARTED', ({ session }) => {
      setRideSession(session);
      setElapsedMs(rideSessionService.getElapsedMs());
    });
    const offRideEnded = rideSessionService.on('RIDE_ENDED', ({ session }) => {
      setRideSession(session);
      setElapsedMs(0);
    });
    const offRideEndedWithSummary = rideSessionService.on('RIDE_ENDED', ({ summary }) => {
      router.push({ pathname: '/ride-summary', params: { summaryId: summary.id } });
    });
    const offHazardAdded = hazardService.on('HAZARD_ADDED', ({ hazard }) => {
      setHazards((prev) => [hazard, ...prev]);
    });
    const offHazardRemoved = hazardService.on('HAZARD_REMOVED', ({ id }) => {
      setHazards((prev) => prev.filter((item) => item.id !== id));
    });
    const offResponder = responderService.on('ALERTS_UPDATED', ({ alerts }) => {
      setResponderAlerts(alerts);
      setDismissedAlertId(null);
      setResponderFeedback(null);
    });

    const positionTimer = setInterval(() => {
      locationService
        .getCurrentLocation()
        .then((point) => {
          if (!active) {
            return;
          }
          setCurrentPosition({ latitude: point.latitude, longitude: point.longitude });
          const trail = locationService
            .getBreadcrumbTrail(20)
            .map((item) => ({ latitude: item.latitude, longitude: item.longitude }));
          setBreadcrumbs(trail);
        })
        .catch(() => {});
    }, 3000);

    return () => {
      active = false;
      offSettings();
      offPreDelay();
      offStarted();
      offTick();
      offCancelled();
      offAlert();
      offNetwork();
      offRideTick();
      offRideStarted();
      offRideEnded();
      offRideEndedWithSummary();
      offHazardAdded();
      offHazardRemoved();
      offResponder();
      clearInterval(positionTimer);
      emergencyControllerService.stop();
    };
  }, [router]);

  useEffect(() => {
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(sosPulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [contentFade, sosPulse]);

  const mapRegion = useMemo(
    () => ({
      latitude: currentPosition?.latitude ?? 28.6139,
      longitude: currentPosition?.longitude ?? 77.209,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    [currentPosition]
  );

  const fatigueLevel = useMemo(() => {
    const mins = Math.floor(elapsedMs / 60000);
    if (mins >= 120) {
      return 'High';
    }
    if (mins >= 60) {
      return 'Moderate';
    }
    return 'Low';
  }, [elapsedMs]);

  const networkVariant = useMemo(() => {
    if (networkStatus === 'INTERNET') {
      return 'internet' as const;
    }
    if (networkStatus === 'MESH_ONLY') {
      return 'mesh' as const;
    }
    return 'offline' as const;
  }, [networkStatus]);

  const topNearbyAlert = useMemo(() => {
    const visible = responderAlerts.filter((alert) => alert.alertId !== dismissedAlertId);
    if (visible.length === 0) {
      return null;
    }

    return [...visible].sort((a, b) => {
      const distanceDiff = a.distanceMeters - b.distanceMeters;
      if (distanceDiff !== 0) {
        return distanceDiff;
      }
      return b.triggeredAt - a.triggeredAt;
    })[0];
  }, [dismissedAlertId, responderAlerts]);

  const onToggleRide = () => {
    if (rideSession.state === 'ACTIVE') {
      void rideSessionService.endRide();
      return;
    }
    void rideSessionService.startRide();
  };

  const onAddHazard = async () => {
    const point = currentPosition;
    if (!point) {
      return;
    }
    await hazardService.addHazard({
      type: 'POTHOLE',
      latitude: point.latitude,
      longitude: point.longitude,
    });
  };

  const onManualSos = async () => {
    const sent = await emergencyControllerService.triggerManualSos();
    if (sent) {
      setControllerState(emergencyControllerService.getState());
    }
  };

  const onAcceptNearbyAlert = async (alertId: string) => {
    setResponderFeedback(null);
    setIsAcceptingAlert(true);
    const result = await responderService.acceptAlert(alertId);
    if (!result.ok) {
      setResponderFeedback(result.reason ?? 'Unable to accept alert.');
    }
    setIsAcceptingAlert(false);
  };

  return (
    <Animated.ScrollView
      style={[styles.container, { opacity: contentFade }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Text style={styles.riderName}>{riderName}</Text>
        <Animated.View style={{ transform: [{ scale: sosPulse }] }}>
          <StatusBadge variant={networkVariant} />
        </Animated.View>
      </View>

      {topNearbyAlert ? (
        <View style={styles.nearbyAlertCard}>
          <Text style={styles.nearbyAlertTitle}>Nearby SOS Alert</Text>
          <Text style={styles.nearbyAlertMeta}>Victim: {shortDeviceId(topNearbyAlert.victimDeviceId)}</Text>
          <Text style={styles.nearbyAlertMeta}>Distance: {Math.round(topNearbyAlert.distanceMeters)}m</Text>
          <Text style={styles.nearbyAlertMeta}>
            Triggered: {new Date(topNearbyAlert.triggeredAt).toLocaleTimeString()}
          </Text>
          <Text style={styles.nearbyAlertMeta}>
            Location: {topNearbyAlert.location ? 'Available' : 'Unavailable'}
          </Text>
          {responderFeedback ? <Text style={styles.nearbyAlertFeedback}>{responderFeedback}</Text> : null}
          <View style={styles.nearbyAlertActions}>
            <Pressable
              style={[styles.nearbyAlertAccept, isAcceptingAlert && styles.nearbyAlertDisabled]}
              disabled={isAcceptingAlert}
              onPress={() => {
                void onAcceptNearbyAlert(topNearbyAlert.alertId);
              }}>
              <Text style={styles.nearbyAlertAcceptText}>
                {isAcceptingAlert ? 'Accepting...' : 'Accept'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.nearbyAlertDismiss}
              onPress={() => setDismissedAlertId(topNearbyAlert.alertId)}>
              <Text style={styles.nearbyAlertDismissText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {controllerState === 'ALERT_SENDING' || controllerState === 'ALERT_SENT' ? (
        <View style={styles.activeSosCard}>
          <Text style={styles.activeSosTitle}>SOS Sent</Text>
          <Text style={styles.activeSosMeta}>Emergency alert is active. You can cancel if you are safe.</Text>
          <Pressable style={styles.activeSosCancelButton} onPress={() => emergencyControllerService.cancel()}>
            <Text style={styles.activeSosCancelText}>Cancel SOS</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.mapCard}>
        {mapModules.available && mapModules.MapView && mapModules.Marker ? (
          <mapModules.MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
            {currentPosition ? <mapModules.Marker coordinate={currentPosition} title="You" /> : null}
            {hazards.map((hazard) => (
              <mapModules.Marker
                key={hazard.id}
                coordinate={{ latitude: hazard.latitude, longitude: hazard.longitude }}
                pinColor="#F59E0B"
                title={hazard.type}
              />
            ))}
            {breadcrumbs.length > 1 && mapModules.Polyline ? (
              <mapModules.Polyline coordinates={breadcrumbs} strokeColor="#22D3EE" strokeWidth={3} />
            ) : null}
            {controllerState === 'ALERT_PRE_DELAY' ||
            controllerState === 'ALERT_PENDING' ||
            controllerState === 'ALERT_ESCALATED' ? (
              <mapModules.Marker
                coordinate={currentPosition ?? mapRegion}
                pinColor="#EF4444"
                title="SOS Active"
                opacity={Math.floor(Date.now() / 500) % 2 === 0 ? 1 : 0.4}
              />
            ) : null}
          </mapModules.MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackTitle}>Map Unavailable</Text>
            <Text style={styles.mapFallbackText}>
              This build does not include native maps. Use a dev build for live map rendering.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Ride Status</Text>
        <Text style={styles.statusText}>Ride Time: {formatDuration(elapsedMs)}</Text>
        <Text style={styles.statusText}>Fatigue Level: {fatigueLevel}</Text>
        <Text style={styles.statusText}>Mesh Status: {networkStatus}</Text>
      </View>

      <View style={styles.actionBar}>
        <Pressable style={styles.primaryAction} onPress={onToggleRide}>
          <Text style={styles.primaryActionText}>{rideSession.state === 'ACTIVE' ? 'End Ride' : 'Start Ride'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={() => void onAddHazard()}>
          <Text style={styles.secondaryActionText}>Report Hazard</Text>
        </Pressable>
        <Animated.View style={{ transform: [{ scale: sosPulse }] }}>
          <Pressable style={styles.dangerAction} onPress={() => void onManualSos()}>
            <Text style={styles.dangerActionText}>Manual SOS</Text>
          </Pressable>
        </Animated.View>
      </View>

      <View style={styles.linksRow}>
        <Pressable style={styles.linkButton} onPress={() => router.push('/emergency-contacts')}>
          <Text style={styles.linkText}>Emergency Contacts</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => router.push('/sos-received')}>
          <Text style={styles.linkText}>SOS Received</Text>
        </Pressable>
      </View>
      <View style={styles.linksRow}>
        <Pressable style={styles.linkButton} onPress={() => router.push('/(tabs)/settings')}>
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => router.push('/(tabs)/ride-history')}>
          <Text style={styles.linkText}>Ride History</Text>
        </Pressable>
      </View>
    </Animated.ScrollView>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function shortDeviceId(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 96,
    gap: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riderName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  nearbyAlertCard: {
    backgroundColor: '#1F2937',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  nearbyAlertTitle: {
    color: '#FEE2E2',
    fontSize: 15,
    fontWeight: '800',
  },
  nearbyAlertMeta: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
  },
  nearbyAlertFeedback: {
    color: '#FCA5A5',
    fontSize: 12,
    marginTop: 4,
  },
  nearbyAlertActions: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
  },
  nearbyAlertAccept: {
    flex: 1,
    backgroundColor: '#16A34A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  nearbyAlertAcceptText: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '800',
  },
  nearbyAlertDismiss: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6B7280',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  nearbyAlertDismissText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '700',
  },
  nearbyAlertDisabled: {
    opacity: 0.7,
  },
  activeSosCard: {
    backgroundColor: '#7F1D1D',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  activeSosTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  activeSosMeta: {
    color: '#FEE2E2',
    fontSize: 13,
    fontWeight: '600',
  },
  activeSosCancelButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  activeSosCancelText: {
    color: '#7F1D1D',
    fontSize: 13,
    fontWeight: '800',
  },
  mapCard: {
    height: 236,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  mapFallbackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  mapFallbackText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  statusCard: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statusTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
  },
  statusText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    gap: 10,
  },
  primaryAction: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryAction: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerAction: {
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  linksRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '700',
  },
});
