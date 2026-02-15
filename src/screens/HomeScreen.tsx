import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  crashDetectionService,
  emergencyControllerService,
  settingsService,
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
  const [lastPhaseReason, setLastPhaseReason] = useState<PhaseChangeReason | null>(null);
  const [lastPhaseChangedAt, setLastPhaseChangedAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setState(emergencyControllerService.getState());
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
    const offSettings = settingsService.on('SETTINGS_CHANGED', ({ settings }) => {
      crashDetectionService.applySensitivity(settings.sensitivity);
    });

    const boot = async () => {
      try {
        const settings = await settingsService.loadSettings();
        crashDetectionService.applySensitivity(settings.sensitivity);
        await emergencyControllerService.start();
        if (active) {
          setState(emergencyControllerService.getState());
          setDetectorPhase(crashDetectionService.getPhase());
        }
      } catch {
        if (active) {
          setState('MONITORING');
        }
      }
    };

    void boot();

    return () => {
      active = false;
      offStarted();
      offTick();
      offAlert();
      offCancelled();
      offPhase();
      offSettings();
      emergencyControllerService.stop();
    };
  }, []);

  const isCountdownActive = state === 'COUNTDOWN_ACTIVE';
  const isAlertTriggered = state === 'ALERT_SENDING' || state === 'ALERT_SENT';

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
        <Text style={styles.mainText}>ALERT TRIGGERED</Text>
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
          <Pressable style={styles.settingsButton} onPress={() => router.push('/settings')}>
            <Text style={styles.settingsButtonText}>Settings</Text>
          </Pressable>
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
  settingsButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  settingsButtonText: {
    color: '#E5E7EB',
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
});
