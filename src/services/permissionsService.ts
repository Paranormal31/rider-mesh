import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { PermissionsAndroid, Platform } from 'react-native';

const PERMISSIONS_STORAGE_KEY = '@dextrix/permissions-snapshot/v1';

type PermissionKey = 'location' | 'notifications' | 'motion' | 'bluetooth' | 'sms';
type PermissionStatus = 'granted' | 'denied' | 'unavailable' | 'unknown';
type PermissionSnapshot = Record<PermissionKey, PermissionStatus> & {
  updatedAt: number;
};

const DEFAULT_SNAPSHOT: PermissionSnapshot = {
  location: 'unknown',
  notifications: 'unknown',
  motion: 'unknown',
  bluetooth: 'unknown',
  sms: 'unknown',
  updatedAt: 0,
};

class PermissionsService {
  async getSnapshot(): Promise<PermissionSnapshot> {
    try {
      const raw = await AsyncStorage.getItem(PERMISSIONS_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SNAPSHOT };
      }

      const parsed: unknown = JSON.parse(raw);
      return this.normalizeSnapshot(parsed);
    } catch {
      return { ...DEFAULT_SNAPSHOT };
    }
  }

  async requestAllBestEffort(): Promise<PermissionSnapshot> {
    const next: PermissionSnapshot = { ...(await this.getSnapshot()) };

    next.location = await this.requestLocationBestEffort();
    next.notifications = await this.requestNotificationsBestEffort();
    next.motion = await this.requestMotionBestEffort();
    next.bluetooth = await this.requestBluetoothBestEffort();
    next.sms = 'unknown';
    next.updatedAt = Date.now();

    await this.saveSnapshot(next);
    return next;
  }

  async saveSnapshot(snapshot: PermissionSnapshot): Promise<void> {
    await AsyncStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(snapshot));
  }

  private async requestLocationBestEffort(): Promise<PermissionStatus> {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  }

  private async requestNotificationsBestEffort(): Promise<PermissionStatus> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as {
        requestPermissionsAsync?: () => Promise<{ granted: boolean }>;
      };
      if (!Notifications?.requestPermissionsAsync) {
        return 'unavailable';
      }

      const result = await Notifications.requestPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  }

  private async requestMotionBestEffort(): Promise<PermissionStatus> {
    try {
      const available = await Accelerometer.isAvailableAsync();
      return available ? 'granted' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  private async requestBluetoothBestEffort(): Promise<PermissionStatus> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }

    try {
      if (Platform.Version >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ];
        const result = await PermissionsAndroid.requestMultiple(permissions);
        const allGranted = permissions.every(
          (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
        );
        return allGranted ? 'granted' : 'denied';
      }

      const fallbackResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return fallbackResult === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  }

  private normalizeSnapshot(value: unknown): PermissionSnapshot {
    if (!value || typeof value !== 'object') {
      return { ...DEFAULT_SNAPSHOT };
    }

    const candidate = value as Partial<PermissionSnapshot>;
    return {
      location: toPermissionStatus(candidate.location),
      notifications: toPermissionStatus(candidate.notifications),
      motion: toPermissionStatus(candidate.motion),
      bluetooth: toPermissionStatus(candidate.bluetooth),
      sms: toPermissionStatus(candidate.sms),
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
    };
  }
}

function toPermissionStatus(value: unknown): PermissionStatus {
  if (
    value === 'granted' ||
    value === 'denied' ||
    value === 'unavailable' ||
    value === 'unknown'
  ) {
    return value;
  }

  return 'unknown';
}

export const permissionsService = new PermissionsService();
export type { PermissionKey, PermissionSnapshot, PermissionStatus };
