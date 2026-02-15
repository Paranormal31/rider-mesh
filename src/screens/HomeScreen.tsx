import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  crashDetectionService,
  emergencyControllerService,
  locationService,
  type EmergencyControllerLocationPayload,
  type CrashDetectionPhase,
  type EmergencyControllerState,
  type PhaseChangeReason,
} from '@/src/services';

export function HomeScreen() {
  const router = useRouter();
  const [state, setState] = useState<EmergencyControllerState>(
    emergencyControllerService.getState()
  );
  const [detectorPhase, setDetectorPhase] = useState<CrashDetectionPhase>(
    crashDetectionService.getPhase()
  );
  const [remainingSeconds, setRemainingSeconds] = useState(
    emergencyControllerService.getCountdownRemainingSeconds()
  );
  const [alertLocation, setAlertLocation] = useState<EmergencyControllerLocationPayload | null>(null);
  const [liveLocation, setLiveLocation] = useState<EmergencyControllerLocationPayload | null>(null);
  const [liveBreadcrumbCount, setLiveBreadcrumbCount] = useState(0);
  const [lastPhaseReason, setLastPhaseReason] = useState<PhaseChangeReason | null>(null);
  const [lastPhaseChangedAt, setLastPhaseChangedAt] = useState<number | null>(null);

  useEffect(() => {
    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', (event) => {
      setAlertLocation(event.location);
      setState('ALERT_SENT');
      setRemainingSeconds(0);
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setState('MONITORING');
      setRemainingSeconds(0);
    });
    const offPhase = crashDetectionService.on('DETECTION_PHASE_CHANGED', (event) => {
      setDetectorPhase(event.toPhase);
      setLastPhaseReason(event.reason ?? null);
      setLastPhaseChangedAt(event.timestamp);
    });

    emergencyControllerService.start().then(
      () => {
        setState(emergencyControllerService.getState());
        setDetectorPhase(crashDetectionService.getPhase());
      },
      () => setState('MONITORING')
    );

    return () => {
      offStarted();
      offTick();
      offAlert();
      offCancelled();
      offPhase();
      emergencyControllerService.stop();
    };
  }, []);

  useEffect(() => {
    const refreshLiveLocation = () => {
      void locationService
        .getCurrentLocation()
        .then((point) => {
          setLiveLocation({
            ...point,
            breadcrumbTrail: [],
          });
        })
        .catch(() => {
          setLiveLocation(null);
        })
        .finally(() => {
          setLiveBreadcrumbCount(locationService.getBreadcrumbTrail(10).length);
        });
    };

    refreshLiveLocation();
    const timer = setInterval(refreshLiveLocation, 3000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const breadcrumbTrail = alertLocation?.breadcrumbTrail ?? [];
  const breadcrumbCount = breadcrumbTrail.length;
  const firstBreadcrumb = breadcrumbTrail[0] ?? null;
  const lastBreadcrumb = breadcrumbTrail[breadcrumbTrail.length - 1] ?? null;

  const isCountdownActive = state === 'COUNTDOWN_ACTIVE';
  const isAlertTriggered = state === 'ALERT_SENDING' || state === 'ALERT_SENT';
  const isAlertSent = state === 'ALERT_SENT';

  const formatPoint = (point: { latitude: number; longitude: number; timestamp: number } | null) => {
    if (!point) {
      return 'None';
    }

    return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)} @ ${new Date(
      point.timestamp
    ).toLocaleTimeString()}`;
  };

  const renderBreadcrumbDebug = () => (
    <View style={styles.debugPanel}>
      <Text style={styles.debugTitle}>Breadcrumb Debug</Text>
      <Text style={styles.debugText}>
        Live Current Location:{' '}
        {liveLocation
          ? `${liveLocation.latitude.toFixed(6)}, ${liveLocation.longitude.toFixed(6)} @ ${new Date(
              liveLocation.timestamp
            ).toLocaleTimeString()}`
          : 'Location: unavailable'}
      </Text>
      <Text style={styles.debugText}>Live Breadcrumb Count: {liveBreadcrumbCount}</Text>
      <Text style={styles.debugText}>
        Alert Payload Location:{' '}
        {alertLocation
          ? `${alertLocation.latitude.toFixed(6)}, ${alertLocation.longitude.toFixed(6)} @ ${new Date(
              alertLocation.timestamp
            ).toLocaleTimeString()}`
          : 'Location: unavailable'}
      </Text>
      <Text style={styles.debugText}>Breadcrumb Count: {breadcrumbCount}</Text>
      <Text style={styles.debugText}>First Breadcrumb: {formatPoint(firstBreadcrumb)}</Text>
      <Text style={styles.debugText}>Last Breadcrumb: {formatPoint(lastBreadcrumb)}</Text>
    </View>
  );

  const handleRefreshAfterAlert = () => {
    setState('MONITORING');
    setRemainingSeconds(0);
    setAlertLocation(null);
  };

  return (
    <View
      style={[
        styles.container,
        isCountdownActive && styles.countdownContainer,
        isAlertTriggered && styles.alertContainer,
      ]}>
      {isCountdownActive ? (
        <>
          <Text style={styles.mainText}>CRASH DETECTED</Text>
          <Text style={styles.countdownText}>{remainingSeconds}</Text>
          <Pressable style={styles.cancelButton} onPress={() => emergencyControllerService.cancel()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </>
      ) : isAlertTriggered ? (
        <>
          <Text style={styles.mainText}>ALERT TRIGGERED</Text>
          {isAlertSent && (
            <>
              <Pressable style={styles.refreshButton} onPress={handleRefreshAfterAlert}>
                <Text style={styles.refreshButtonText}>Refresh Test</Text>
              </Pressable>
              {renderBreadcrumbDebug()}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>Dextrex Control Center</Text>
          <Text style={styles.subtitle}>Monitoring for crash events.</Text>
          <Text style={styles.stateText}>State: {state}</Text>
          <Text style={styles.stateText}>Detector Phase: {detectorPhase}</Text>
          <Text style={styles.phaseMetaText}>
            Last Phase Event: {lastPhaseReason ?? 'None'}{' '}
            {lastPhaseChangedAt ? `@ ${new Date(lastPhaseChangedAt).toLocaleTimeString()}` : ''}
          </Text>
          <Pressable style={styles.contactsButton} onPress={() => router.push('/emergency-contacts')}>
            <Text style={styles.contactsButtonText}>Emergency Contacts</Text>
          </Pressable>
          {renderBreadcrumbDebug()}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownContainer: {
    backgroundColor: '#B91C1C',
  },
  alertContainer: {
    backgroundColor: '#7F1D1D',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  stateText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  phaseMetaText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  contactsButton: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  contactsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  mainText: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  countdownText: {
    color: '#FEE2E2',
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 78,
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#7F1D1D',
    fontSize: 18,
    fontWeight: '800',
  },
  debugPanel: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  debugTitle: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  debugText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
  },
  refreshButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: '#062E25',
    fontSize: 14,
    fontWeight: '800',
  },
});
