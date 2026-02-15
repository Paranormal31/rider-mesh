import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Alert, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/src/components/ui';
import {
  crashDetectionService,
  emergencyControllerService,
  hazardService,
  locationService,
  networkMeshService,
  profileService,
  rideSessionService,
  settingsService,
  type HazardRecord,
  type HazardType,
  type NetworkMeshStatus,
  type RideSession,
} from '@/src/services';

type Position = { latitude: number; longitude: number };

type MapModules = {
  available: boolean;
  MapView?: ComponentType<any>;
  Marker?: ComponentType<any>;
  Polyline?: ComponentType<any>;
  Heatmap?: ComponentType<any>;
  Circle?: ComponentType<any>;
};

function loadMapModules(): MapModules {
  // Expo Go may not include react-native-maps native module in this build.
  if (Constants.appOwnership === 'expo') {
    return { available: false };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native');
    if (!NativeModules?.RNMapsAirModule && !NativeModules?.AirMapModule) {
      return { available: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps');
    return {
      available: true,
      MapView: maps.default,
      Marker: maps.Marker,
      Polyline: maps.Polyline,
      Heatmap: maps.Heatmap,
      Circle: maps.Circle,
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

  const crashModalOpen = useRef(false);
  const activeSosModalOpen = useRef(false);
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
          setControllerState('MONITORING');
        }
      }
    };

    void loadBootstrap();

    const offSettings = settingsService.on('SETTINGS_CHANGED', ({ settings }) => {
      crashDetectionService.applySensitivity(settings.sensitivity);
    });
    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setControllerState('COUNTDOWN_ACTIVE');
      if (!crashModalOpen.current) {
        crashModalOpen.current = true;
        activeSosModalOpen.current = false;
        router.push('/crash-alert');
      }
      setElapsedMs(rideSessionService.getElapsedMs() + event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', () => {
      setControllerState('COUNTDOWN_ACTIVE');
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setControllerState('MONITORING');
      crashModalOpen.current = false;
      activeSosModalOpen.current = false;
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setControllerState(emergencyControllerService.getState());
      crashModalOpen.current = false;
      if (!activeSosModalOpen.current) {
        activeSosModalOpen.current = true;
        router.push('/active-sos');
      }
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

  const heatmapByType = useMemo(() => {
    const grouped: Record<HazardType, Array<{ latitude: number; longitude: number; weight: number }>> = {
      POTHOLE: [],
      CONSTRUCTION: [],
      WATERLOGGING: [],
      ACCIDENT_ZONE: [],
    };

    for (const hazard of hazards) {
      grouped[hazard.type].push({
        latitude: hazard.latitude,
        longitude: hazard.longitude,
        weight: 1,
      });
    }

    return grouped;
  }, [hazards]);

  const heatmapGradients: Record<HazardType, { colors: string[]; startPoints: number[]; colorMapSize: number }> = {
    POTHOLE: {
      colors: ['#FDBA74', '#F97316', '#C2410C'],
      startPoints: [0.2, 0.6, 1],
      colorMapSize: 256,
    },
    CONSTRUCTION: {
      colors: ['#FDE68A', '#FACC15', '#A16207'],
      startPoints: [0.2, 0.6, 1],
      colorMapSize: 256,
    },
    WATERLOGGING: {
      colors: ['#93C5FD', '#3B82F6', '#1E3A8A'],
      startPoints: [0.2, 0.6, 1],
      colorMapSize: 256,
    },
    ACCIDENT_ZONE: {
      colors: ['#FCA5A5', '#EF4444', '#991B1B'],
      startPoints: [0.2, 0.6, 1],
      colorMapSize: 256,
    },
  };

  const redZones = useMemo(() => {
    const threshold = 5;
    const radiusMeters = 200;
    const visited = new Set<string>();
    const zones: Array<{ latitude: number; longitude: number }> = [];

    for (let i = 0; i < hazards.length; i += 1) {
      const base = hazards[i];
      if (!base) {
        continue;
      }
      const key = `${base.latitude.toFixed(5)}:${base.longitude.toFixed(5)}`;
      if (visited.has(key)) {
        continue;
      }

      const neighbors = hazards.filter((candidate) => {
        return distanceMeters(
          base.latitude,
          base.longitude,
          candidate.latitude,
          candidate.longitude
        ) <= radiusMeters;
      });

      if (neighbors.length >= threshold) {
        const centroid = neighbors.reduce(
          (acc, item) => {
            acc.latitude += item.latitude;
            acc.longitude += item.longitude;
            return acc;
          },
          { latitude: 0, longitude: 0 }
        );

        zones.push({
          latitude: centroid.latitude / neighbors.length,
          longitude: centroid.longitude / neighbors.length,
        });

        neighbors.forEach((item) => {
          visited.add(`${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`);
        });
      }
    }

    return zones;
  }, [hazards]);

  const onToggleRide = () => {
    if (rideSession.state === 'ACTIVE') {
      void rideSessionService.endRide();
      return;
    }
    void rideSessionService.startRide();
  };

  const onAddHazard = () => {
    router.push('/report-hazard');
  };

  const onManualSos = async () => {
    Alert.alert(
      'Send SOS?',
      'This will start the emergency countdown and notify your contacts if not canceled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            await emergencyControllerService.start();
            const sent = await emergencyControllerService.triggerManualSos();
            if (sent) {
              crashModalOpen.current = true;
              activeSosModalOpen.current = false;
              router.push('/crash-alert');
            } else {
              Alert.alert('SOS unavailable', 'An SOS is already active or initializing. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentFade }]}>
      <View style={styles.topBar}>
        <Text style={styles.riderName}>{riderName}</Text>
        <Animated.View style={{ transform: [{ scale: sosPulse }] }}>
          <StatusBadge variant={networkVariant} />
        </Animated.View>
      </View>

      <View style={styles.mapCard}>
        {mapModules.available && mapModules.MapView && mapModules.Marker ? (
          <mapModules.MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
            {mapModules.Heatmap && Platform.OS === 'android'
              ? (Object.keys(heatmapByType) as HazardType[]).map((type) =>
                  heatmapByType[type].length > 0 ? (
                    <mapModules.Heatmap
                      key={`heatmap-${type}`}
                      points={heatmapByType[type]}
                      radius={30}
                      opacity={0.7}
                      gradient={heatmapGradients[type]}
                    />
                  ) : null
                )
              : null}
            {mapModules.Circle && Platform.OS === 'android'
              ? redZones.map((zone, index) => (
                  <mapModules.Circle
                    key={`red-zone-${index}`}
                    center={zone}
                    radius={200}
                    strokeColor="rgba(239, 68, 68, 0.6)"
                    fillColor="rgba(239, 68, 68, 0.25)"
                  />
                ))
              : null}
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
            {controllerState === 'ALERT_SENDING' || controllerState === 'ALERT_SENT' ? (
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
        <Pressable style={styles.secondaryAction} onPress={onAddHazard}>
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
    </Animated.View>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 52,
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
