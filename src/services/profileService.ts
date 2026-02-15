import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_STORAGE_KEY = '@dextrix/profile/v1';
const REQUIRED_PHONE_DIGITS = 10;

type UserProfile = {
  riderId: string;
  name: string;
  phone: string;
  photoUri?: string | null;
  emergencyContact1?: string | null;
  emergencyContact2?: string | null;
  updatedAt: number;
};

type SaveProfileInput = Omit<UserProfile, 'riderId' | 'updatedAt'> & {
  riderId?: string;
};

class ProfileService {
  async getProfile(): Promise<UserProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed: unknown = JSON.parse(raw);
      return this.normalizeStoredProfile(parsed);
    } catch {
      return null;
    }
  }

  async saveProfile(input: SaveProfileInput): Promise<UserProfile> {
    const profile: UserProfile = {
      riderId: input.riderId?.trim() || this.createRiderId(),
      name: input.name.trim(),
      phone: this.normalizePhone(input.phone),
      photoUri: normalizeOptional(input.photoUri),
      emergencyContact1: normalizeOptional(input.emergencyContact1),
      emergencyContact2: normalizeOptional(input.emergencyContact2),
      updatedAt: Date.now(),
    };

    if (!this.isProfileComplete(profile)) {
      throw new Error('Profile must include a valid name and 10-digit phone number.');
    }

    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  isProfileComplete(profile: UserProfile | null): boolean {
    if (!profile) {
      return false;
    }

    const trimmedName = profile.name.trim();
    const normalizedPhone = this.normalizePhone(profile.phone);
    return trimmedName.length > 0 && normalizedPhone.length === REQUIRED_PHONE_DIGITS;
  }

  async clearProfile(): Promise<void> {
    await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
  }

  normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private normalizeStoredProfile(value: unknown): UserProfile | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<UserProfile>;
    if (typeof candidate.riderId !== 'string') {
      return null;
    }
    if (typeof candidate.name !== 'string') {
      return null;
    }
    if (typeof candidate.phone !== 'string') {
      return null;
    }

    const profile: UserProfile = {
      riderId: candidate.riderId,
      name: candidate.name,
      phone: this.normalizePhone(candidate.phone),
      photoUri: normalizeOptional(candidate.photoUri),
      emergencyContact1: normalizeOptional(candidate.emergencyContact1),
      emergencyContact2: normalizeOptional(candidate.emergencyContact2),
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    };

    return profile;
  }

  private createRiderId(): string {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RIDER-${random}`;
  }
}

function normalizeOptional(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const profileService = new ProfileService();
export type { SaveProfileInput, UserProfile };
