import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { emergencyControllerService, type EmergencyControllerState } from '@/src/services';

export function CrashAlertScreen() {
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(
    emergencyControllerService.getCountdownRemainingSeconds()
  );
  const [state, setState] = useState<EmergencyControllerState>(emergencyControllerService.getState());
  const countdownScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const offPreDelay = emergencyControllerService.on('PRE_DELAY_STARTED', () => {
      setState('ALERT_PRE_DELAY');
      setRemainingSeconds(0);
    });
    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setState('ALERT_PENDING');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', (event) => {
      setState('ALERT_PENDING');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setState('ALERT_CANCELLED');
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setState('ALERT_ESCALATED');
      setRemainingSeconds(0);
    });

    return () => {
      offPreDelay();
      offStarted();
      offTick();
      offCancelled();
      offAlert();
    };
  }, [router]);

  useEffect(() => {
    if (state === 'NORMAL' || state === 'ALERT_CANCELLED') {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [router, state]);

  useEffect(() => {
    if (state !== 'ALERT_PENDING') {
      return;
    }
    Animated.sequence([
      Animated.timing(countdownScale, { toValue: 1.08, duration: 180, useNativeDriver: true }),
      Animated.timing(countdownScale, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [countdownScale, remainingSeconds, state]);

  if (state === 'ALERT_ESCALATED') {
    return (
      <View style={[styles.container, styles.escalatedContainer]}>
        <Text style={styles.title}>EMERGENCY ESCALATED</Text>
        <Text style={styles.escalatedMessage}>Emergency services on the way</Text>
      </View>
    );
  }

  const isPending = state === 'ALERT_PENDING';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CRASH DETECTED</Text>
      {isPending ? (
        <>
          <Text style={styles.subtitle}>Nearby rider alerted</Text>
          <Text style={styles.meta}>Sending SOS in:</Text>
          <Animated.Text style={[styles.countdown, { transform: [{ scale: countdownScale }] }]}>
            {Math.max(remainingSeconds, 0)}
          </Animated.Text>
        </>
      ) : (
        <Text style={styles.meta}>Monitoring crash impact...</Text>
      )}
      <Pressable style={styles.cancelButton} onPress={() => emergencyControllerService.cancel()}>
        <Text style={styles.cancelText}>I AM SAFE - CANCEL</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#B91C1C',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  escalatedContainer: {
    backgroundColor: '#7F1D1D',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#FEE2E2',
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    color: '#FECACA',
    fontSize: 16,
    fontWeight: '600',
  },
  countdown: {
    color: '#FFFFFF',
    fontSize: 96,
    fontWeight: '900',
    lineHeight: 102,
  },
  cancelButton: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cancelText: {
    color: '#7F1D1D',
    fontSize: 16,
    fontWeight: '900',
  },
  escalatedMessage: {
    color: '#FEE2E2',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    color: '#FEE2E2',
    fontSize: 13,
    fontWeight: '700',
  },
});
