import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard } from '@/src/components/ui';
import { onboardingService, profileService } from '@/src/services';
import { colors, spacing, typography } from '@/src/theme';

export default function ProfileSetupRoute() {
  const router = useRouter();
  const [riderId, setRiderId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [emergencyContact1, setEmergencyContact1] = useState('');
  const [emergencyContact2, setEmergencyContact2] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    profileService.getProfile().then((profile) => {
      if (!active || !profile) {
        return;
      }
      setRiderId(profile.riderId);
      setName(profile.name);
      setPhone(profile.phone);
      setPhotoUri(profile.photoUri ?? '');
      setEmergencyContact1(profile.emergencyContact1 ?? '');
      setEmergencyContact2(profile.emergencyContact2 ?? '');
    });

    return () => {
      active = false;
    };
  }, []);

  const onCompleteSetup = async () => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved = await profileService.saveProfile({
        riderId: riderId ?? undefined,
        name,
        phone,
        photoUri,
        emergencyContact1,
        emergencyContact2,
      });

      await onboardingService.setComplete(true);
      setRiderId(saved.riderId);
      router.replace('/(tabs)');
    } catch {
      setFormError('Please enter a valid name and 10-digit phone number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionCard>
          <Text style={styles.title}>Profile Setup</Text>
          <Text style={styles.subtitle}>Name and phone are required to continue.</Text>

          <Text style={styles.label}>Rider ID</Text>
          <Text style={styles.riderIdValue}>{riderId ?? 'Will be generated on save'}</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor={colors.textSecondary}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Phone *</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            placeholder="10-digit phone number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Profile Photo URI (optional)</Text>
          <TextInput
            value={photoUri}
            onChangeText={setPhotoUri}
            style={styles.input}
            placeholder="Optional photo URI"
            placeholderTextColor={colors.textSecondary}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Emergency Contact 1 (optional)</Text>
          <TextInput
            value={emergencyContact1}
            onChangeText={setEmergencyContact1}
            style={styles.input}
            placeholder="Contact number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Emergency Contact 2 (optional)</Text>
          <TextInput
            value={emergencyContact2}
            onChangeText={setEmergencyContact2}
            style={styles.input}
            placeholder="Contact number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            editable={!isSubmitting}
          />

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <PrimaryButton
            label={isSubmitting ? 'Saving...' : 'Complete Setup'}
            onPress={() => {
              void onCompleteSetup();
            }}
            disabled={isSubmitting}
          />
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  riderIdValue: {
    ...typography.body,
    color: colors.meshCyan,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
});
