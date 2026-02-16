import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_STORAGE_KEY = '@dextrix/user-settings/v1';

type DetectionSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
type CountdownDurationSeconds = 3 | 5 | 10;
type MeshMode = 'AUTO' | 'FORCE_MESH' | 'FORCE_INTERNET';
type MeshRelayHops = 0 | 1 | 2 | 3 | 4;

type UserSettings = {
  sensitivity: DetectionSensitivity;
  countdownDurationSeconds: CountdownDurationSeconds;
  alarmSoundEnabled: boolean;
  breadcrumbTrackingEnabled: boolean;
  meshMode: MeshMode;
  meshRelayHops: MeshRelayHops;
};

type SettingsChangedEvent = {
  type: 'SETTINGS_CHANGED';
  settings: UserSettings;
  updatedAt: number;
};

type SettingsEventMap = {
  SETTINGS_CHANGED: SettingsChangedEvent;
};

type SettingsListener<TEvent extends keyof SettingsEventMap> = (
  payload: SettingsEventMap[TEvent]
) => void;

const DEFAULT_SETTINGS: UserSettings = {
  sensitivity: 'MEDIUM',
  countdownDurationSeconds: 10,
  alarmSoundEnabled: true,
  breadcrumbTrackingEnabled: true,
  meshMode: 'AUTO',
  meshRelayHops: 2,
};

class SettingsService {
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;
  private listeners: {
    [K in keyof SettingsEventMap]: Set<SettingsListener<K>>;
  } = {
    SETTINGS_CHANGED: new Set(),
  };

  async loadSettings(): Promise<UserSettings> {
    if (this.loaded) {
      return this.getSettings();
    }

    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        this.loaded = true;
        return this.getSettings();
      }

      const parsed: unknown = JSON.parse(raw);
      this.settings = this.normalizeStoredSettings(parsed);
      this.loaded = true;
      return this.getSettings();
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
      this.loaded = true;
      return this.getSettings();
    }
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    this.validatePatch(patch);
    const nextSettings: UserSettings = { ...this.settings, ...patch };

    const serialized = JSON.stringify(nextSettings);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    this.settings = nextSettings;
    this.loaded = true;

    this.emit('SETTINGS_CHANGED', {
      type: 'SETTINGS_CHANGED',
      settings: this.getSettings(),
      updatedAt: Date.now(),
    });

    return this.getSettings();
  }

  on<TEvent extends keyof SettingsEventMap>(
    event: TEvent,
    listener: SettingsListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private validatePatch(patch: Partial<UserSettings>): void {
    if (patch.sensitivity !== undefined && !isSensitivity(patch.sensitivity)) {
      throw new Error('Invalid sensitivity setting.');
    }
    if (
      patch.countdownDurationSeconds !== undefined &&
      !isCountdownDuration(patch.countdownDurationSeconds)
    ) {
      throw new Error('Invalid countdown duration setting.');
    }
    if (patch.alarmSoundEnabled !== undefined && typeof patch.alarmSoundEnabled !== 'boolean') {
      throw new Error('Invalid alarm sound setting.');
    }
    if (
      patch.breadcrumbTrackingEnabled !== undefined &&
      typeof patch.breadcrumbTrackingEnabled !== 'boolean'
    ) {
      throw new Error('Invalid breadcrumb tracking setting.');
    }
    if (patch.meshMode !== undefined && !isMeshMode(patch.meshMode)) {
      throw new Error('Invalid mesh mode setting.');
    }
    if (patch.meshRelayHops !== undefined && !isMeshRelayHops(patch.meshRelayHops)) {
      throw new Error('Invalid mesh relay hops setting.');
    }
  }

  private normalizeStoredSettings(value: unknown): UserSettings {
    if (!value || typeof value !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    const candidate = value as Partial<UserSettings>;
    return {
      sensitivity: isSensitivity(candidate.sensitivity)
        ? candidate.sensitivity
        : DEFAULT_SETTINGS.sensitivity,
      countdownDurationSeconds: isCountdownDuration(candidate.countdownDurationSeconds)
        ? candidate.countdownDurationSeconds
        : DEFAULT_SETTINGS.countdownDurationSeconds,
      alarmSoundEnabled:
        typeof candidate.alarmSoundEnabled === 'boolean'
          ? candidate.alarmSoundEnabled
          : DEFAULT_SETTINGS.alarmSoundEnabled,
      breadcrumbTrackingEnabled:
        typeof candidate.breadcrumbTrackingEnabled === 'boolean'
          ? candidate.breadcrumbTrackingEnabled
          : DEFAULT_SETTINGS.breadcrumbTrackingEnabled,
      meshMode: isMeshMode(candidate.meshMode) ? candidate.meshMode : DEFAULT_SETTINGS.meshMode,
      meshRelayHops: isMeshRelayHops(candidate.meshRelayHops)
        ? candidate.meshRelayHops
        : DEFAULT_SETTINGS.meshRelayHops,
    };
  }

  private emit<TEvent extends keyof SettingsEventMap>(
    event: TEvent,
    payload: SettingsEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

function isSensitivity(value: unknown): value is DetectionSensitivity {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH';
}

function isCountdownDuration(value: unknown): value is CountdownDurationSeconds {
  return value === 3 || value === 5 || value === 10;
}

function isMeshMode(value: unknown): value is MeshMode {
  return value === 'AUTO' || value === 'FORCE_MESH' || value === 'FORCE_INTERNET';
}

function isMeshRelayHops(value: unknown): value is MeshRelayHops {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

export const settingsService = new SettingsService();
export type {
  CountdownDurationSeconds,
  DetectionSensitivity,
  MeshMode,
  MeshRelayHops,
  SettingsChangedEvent,
  UserSettings,
};
