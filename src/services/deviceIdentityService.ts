import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'dextrex.device_id';

function generateDeviceId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `device-${Date.now()}-${randomPart}`;
}

class DeviceIdentityService {
  private cachedDeviceId: string | null = null;

  async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.trim()) {
      this.cachedDeviceId = stored.trim();
      return this.cachedDeviceId;
    }

    const created = generateDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, created);
    this.cachedDeviceId = created;
    return created;
  }
}

export const deviceIdentityService = new DeviceIdentityService();
