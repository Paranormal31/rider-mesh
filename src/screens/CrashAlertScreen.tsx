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
  const [isSendingNow, setIsSendingNow] = useState(false);
  const countdownScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const offStarted = emergencyControllerService.on('COUNTDOWN_STARTED', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offTick = emergencyControllerService.on('COUNTDOWN_TICK', (event) => {
      setState('COUNTDOWN_ACTIVE');
      setRemainingSeconds(event.remainingSeconds);
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setState('MONITORING');
      if (router.canGoBack()) {
        router.back();
      }
    });
    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setState('ALERT_SENT');
      router.replace('/active-sos');
    });

    return () => {
      offStarted();
      offTick();
      offCancelled();
      offAlert();
    };
  }, [router]);

  useEffect(() => {
    if (state !== 'COUNTDOWN_ACTIVE' && state !== 'CRASH_DETECTED') {
      if (router.canGoBack()) {
        router.back();
      }
    }
  }, [router, state]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(countdownScale, { toValue: 1.08, duration: 180, useNativeDriver: true }),
      Animated.timing(countdownScale, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [countdownScale, remainingSeconds]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CRASH DETECTED</Text>
      <Text style={styles.subtitle}>Sending SOS in:</Text>
      <Animated.Text style={[styles.countdown, { transform: [{ scale: countdownScale }] }]}>
        {Math.max(remainingSeconds, 0)}
      </Animated.Text>
      <Pressable
        style={styles.cancelButton}
        onPress={() => emergencyControllerService.cancel()}
        disabled={isSendingNow}>
        <Text style={styles.cancelText}>I AM SAFE - CANCEL</Text>
      </Pressable>
      <Pressable
        style={[styles.sendNowButton, isSendingNow && styles.sendNowDisabled]}
        onPress={() => {
          setIsSendingNow(true);
          emergencyControllerService.sendAlertNow().finally(() => setIsSendingNow(false));
        }}
        disabled={isSendingNow}>
        <Text style={styles.sendNowText}>{isSendingNow ? 'Sending...' : 'Send Now'}</Text>
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
  sendNowButton: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  sendNowDisabled: {
    opacity: 0.6,
  },
  sendNowText: {
    color: '#FEE2E2',
    fontSize: 16,
    fontWeight: '800',
  },
});
