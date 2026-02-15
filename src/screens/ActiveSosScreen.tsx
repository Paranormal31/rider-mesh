import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/src/components/ui';
import {
  emergencyContactsService,
  emergencyControllerService,
  networkMeshService,
  profileService,
  type EmergencyControllerState,
  type NetworkMeshStatus,
} from '@/src/services';

export function ActiveSosScreen() {
  const router = useRouter();
  const [state, setState] = useState<EmergencyControllerState>(emergencyControllerService.getState());
  const [now, setNow] = useState(Date.now());
  const [networkStatus, setNetworkStatus] = useState<NetworkMeshStatus>('INTERNET');
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [callStateText, setCallStateText] = useState<string>('Ready');
  const pulse = useRef(new Animated.Value(1)).current;
  const lastAlert = emergencyControllerService.getLastAlertEvent();
  const closeScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  useEffect(() => {
    let active = true;
    Promise.all([profileService.getProfile(), emergencyContactsService.loadContacts(), networkMeshService.load()]).then(
      ([profile, contacts]) => {
        if (!active) {
          return;
        }
        setNetworkStatus(networkMeshService.getStatus());
        const fromProfile = profile?.emergencyContact1?.trim() || profile?.emergencyContact2?.trim() || null;
        const fromContacts = contacts[0]?.phone ?? null;
        setContactPhone(fromProfile ?? fromContacts);
      }
    );

    const offAlert = emergencyControllerService.on('ALERT_TRIGGERED', () => {
      setState(emergencyControllerService.getState());
    });
    const offCancelled = emergencyControllerService.on('CANCELLED', () => {
      setState('MONITORING');
      closeScreen();
    });
    const offNetwork = networkMeshService.on('STATUS_CHANGED', ({ status }) => {
      setNetworkStatus(status);
    });

    const timer = setInterval(() => setNow(Date.now()), 1000);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => {
      active = false;
      offAlert();
      offCancelled();
      offNetwork();
      clearInterval(timer);
      loop.stop();
    };
  }, [closeScreen, pulse, router]);

  useEffect(() => {
    if (
      state !== 'ALERT_SENDING' &&
      state !== 'ALERT_SENT' &&
      state !== 'RESPONDER_ASSIGNED' &&
      state !== 'CRASH_DETECTED' &&
      state !== 'COUNTDOWN_ACTIVE'
    ) {
      closeScreen();
    }
  }, [closeScreen, state]);

  const escalationSeconds = useMemo(() => {
    if (!lastAlert?.triggeredAt) {
      return 0;
    }
    const elapsed = Math.floor((now - lastAlert.triggeredAt) / 1000);
    return Math.max(0, 120 - elapsed);
  }, [lastAlert?.triggeredAt, now]);

  const networkBadge = useMemo(() => {
    if (networkStatus === 'INTERNET') {
      return 'internet' as const;
    }
    if (networkStatus === 'MESH_ONLY') {
      return 'mesh' as const;
    }
    return 'offline' as const;
  }, [networkStatus]);

  const onCallContact = async () => {
    if (!contactPhone) {
      setCallStateText('No emergency contact configured');
      return;
    }

    setCallStateText(`Opening call intent: ${contactPhone}`);
    try {
      await Linking.openURL(`tel:${contactPhone}`);
    } catch {
      setCallStateText(`Call placeholder for ${contactPhone}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Emergency Mode Activated</Text>
      <StatusBadge variant={networkBadge} />
      <View style={styles.statusCard}>
        <Text style={styles.meta}>Location: {lastAlert?.location ? 'Shared' : 'Unavailable'}</Text>
        <Text style={styles.meta}>Broadcasting: Active</Text>
        <Text style={styles.meta}>Escalation in: {formatTimer(escalationSeconds)}</Text>
        <Text style={styles.meta}>Call Contact: {contactPhone ?? 'Not configured'}</Text>
      </View>
      <Text style={styles.callState}>{callStateText}</Text>

      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Pressable style={styles.primaryButton} onPress={() => void onCallContact()}>
          <Text style={styles.primaryButtonText}>Call Emergency Contact</Text>
        </Pressable>
      </Animated.View>
      <Pressable style={styles.secondaryButton} onPress={() => emergencyControllerService.cancel()}>
        <Text style={styles.secondaryButtonText}>Cancel SOS</Text>
      </Pressable>
    </View>
  );
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  statusCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  meta: {
    color: '#D1D5DB',
    fontSize: 15,
    lineHeight: 22,
  },
  callState: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FCA5A5',
    fontSize: 15,
    fontWeight: '800',
  },
});
