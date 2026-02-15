import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { emergencyControllerService, type EmergencyControllerState } from '@/src/services';

export function CrashAlertScreen() {
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(
    emergencyControllerService.getWarningRemainingSeconds()
  );
  const [state, setState] = useState<EmergencyControllerState>(emergencyControllerService.getState());
  const countdownScale = useRef(new Animated.Value(1)).current;
  const closeScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  useEffect(() => {
    const offWarningStarted = emergencyControllerService.on('WARNING_STARTED', (event) => {
      setState('WARNING_COUNTDOWN');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offWarningTick = emergencyControllerService.on('WARNING_TICK', (event) => {
      setState('WARNING_COUNTDOWN');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offDispatched = emergencyControllerService.on('SOS_DISPATCHED', () => {
      setState('SOS_DISPATCHED');
      router.replace('/(tabs)');
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setState('MONITORING');
      closeScreen();
      setState('ALERT_CANCELLED');
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setState('ALERT_ESCALATED');
      setRemainingSeconds(0);
    });

    return () => {
      offWarningStarted();
      offWarningTick();
      offDispatched();
      offCancelled();
      offAlert();
    };
  }, [closeScreen, router]);

  useEffect(() => {
    if (state !== 'COUNTDOWN_ACTIVE' && state !== 'CRASH_DETECTED') {
      closeScreen();
    if (state === 'NORMAL' || state === 'ALERT_CANCELLED') {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [closeScreen, state]);

  useEffect(() => {
    if (state !== 'WARNING_COUNTDOWN') {
      return;
    }
    Animated.sequence([
      Animated.timing(countdownScale, { toValue: 1.08, duration: 180, useNativeDriver: true }),
      Animated.timing(countdownScale, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [countdownScale, remainingSeconds, state]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CRASH DETECTED</Text>
      <Text style={styles.subtitle}>SOS will be sent to nearby riders</Text>
      <Text style={styles.meta}>Sending SOS in:</Text>
      <Animated.Text style={[styles.countdown, { transform: [{ scale: countdownScale }] }]}>
        {Math.max(remainingSeconds, 0)}
      </Animated.Text>
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
    textAlign: 'center',
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
});
