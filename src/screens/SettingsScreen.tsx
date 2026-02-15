import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  settingsService,
  type CountdownDurationSeconds,
  type DetectionSensitivity,
  type UserSettings,
} from '@/src/services';

const SENSITIVITY_OPTIONS: DetectionSensitivity[] = ['LOW', 'MEDIUM', 'HIGH'];
const COUNTDOWN_OPTIONS: CountdownDurationSeconds[] = [5, 10, 15];

export function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const loaded = await settingsService.loadSettings();
        if (active) {
          setSettings(loaded);
          setSaveError(null);
        }
      } catch {
        if (active) {
          setSaveError('Unable to load settings right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const helperText = useMemo(() => {
    if (isSaving) {
      return 'Saving changes...';
    }
    return 'Changes apply immediately and are saved locally.';
  }, [isSaving]);

  const onChange = async (patch: Partial<UserSettings>) => {
    if (!settings || isSaving) {
      return;
    }

    const previous = settings;
    const optimistic = { ...previous, ...patch };
    setSettings(optimistic);
    setSaveError(null);
    setIsSaving(true);

    try {
      const saved = await settingsService.updateSettings(patch);
      setSettings(saved);
    } catch {
      setSettings(previous);
      setSaveError('Unable to save this setting. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>RiderShield controls and safety preferences.</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Safety & Alerts</Text>
        <Text style={styles.sectionHint}>Detection and emergency behavior</Text>

        <Text style={styles.fieldTitle}>Sensitivity</Text>
        <View style={styles.optionRow}>
          {SENSITIVITY_OPTIONS.map((option) => {
            const selected = settings.sensitivity === option;
            return (
              <Pressable
                key={option}
                disabled={isSaving}
                style={[styles.optionButton, selected && styles.optionButtonSelected]}
                onPress={() => {
                  void onChange({ sensitivity: option });
                }}>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {toTitleCase(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldTitle}>Countdown Duration</Text>
        <View style={styles.optionRow}>
          {COUNTDOWN_OPTIONS.map((seconds) => {
            const selected = settings.countdownDurationSeconds === seconds;
            return (
              <Pressable
                key={seconds}
                disabled={isSaving}
                style={[styles.optionButton, selected && styles.optionButtonSelected]}
                onPress={() => {
                  void onChange({ countdownDurationSeconds: seconds });
                }}>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {seconds}s
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldTitle}>Alarm Sound</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleMeta}>
            <Text style={styles.toggleDescription}>Play spoken alarm during crash flow.</Text>
          </View>
          <Switch
            value={settings.alarmSoundEnabled}
            disabled={isSaving}
            onValueChange={(value) => {
              void onChange({ alarmSoundEnabled: value });
            }}
          />
        </View>

        <Text style={styles.fieldTitle}>Breadcrumb Tracking</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleMeta}>
            <Text style={styles.toggleDescription}>Collect route trail for emergency payloads.</Text>
          </View>
          <Switch
            value={settings.breadcrumbTrackingEnabled}
            disabled={isSaving}
            onValueChange={(value) => {
              void onChange({ breadcrumbTrackingEnabled: value });
            }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
        <Text style={styles.sectionHint}>Manage your trusted emergency numbers</Text>
        <Pressable style={styles.linkButton} onPress={() => router.push('/emergency-contacts')}>
          <Text style={styles.linkButtonText}>Open Emergency Contacts</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>App Controls</Text>
        <Text style={styles.sectionHint}>Additional controls are available in upcoming blocks.</Text>
        <View style={styles.placeholderRow}>
          <Text style={styles.placeholderLabel}>Mesh Range Settings</Text>
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
        <View style={styles.placeholderRow}>
          <Text style={styles.placeholderLabel}>Data Privacy Settings</Text>
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
        <View style={styles.placeholderRow}>
          <Text style={styles.placeholderLabel}>Help & Support</Text>
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
        <View style={styles.placeholderRow}>
          <Text style={styles.placeholderLabel}>Logout</Text>
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
      </View>

      <Text style={styles.helperText}>{helperText}</Text>
      {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
    </View>
  );
}

function toTitleCase(value: string): string {
  const lower = value.toLowerCase();
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 14,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionHint: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: -4,
  },
  fieldTitle: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  optionButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#1D4ED8',
  },
  optionText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleMeta: {
    flex: 1,
    gap: 2,
  },
  toggleDescription: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  helperText: {
    color: '#93C5FD',
    fontSize: 13,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
  linkButton: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
  },
  placeholderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  placeholderLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  comingSoon: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
});
