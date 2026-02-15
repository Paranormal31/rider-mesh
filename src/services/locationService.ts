import * as Location from 'expo-location';

import type { ServiceHealth } from './types';

const MAX_BREADCRUMBS = 10;

export type LocationPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

class LocationService {
  private tracking = false;
  private permissionGranted = false;
  private subscription: Location.LocationSubscription | null = null;
  private breadcrumbs: LocationPoint[] = [];

  async requestPermission(): Promise<boolean> {
    const result = await Location.requestForegroundPermissionsAsync();
    this.permissionGranted = result.granted;
    return this.permissionGranted;
  }

  async getCurrentLocation(): Promise<LocationPoint> {
    await this.ensurePermission();
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      timestamp: current.timestamp,
    };
  }

  async startTracking(): Promise<void> {
    if (this.tracking) {
      return;
    }

    await this.ensurePermission();
    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 2000,
        distanceInterval: 3,
      },
      (update) => {
        this.pushBreadcrumb({
          latitude: update.coords.latitude,
          longitude: update.coords.longitude,
          timestamp: update.timestamp,
        });
      }
    );
    this.tracking = true;
  }

  async watchPosition(handler: (point: LocationPoint) => void): Promise<() => void> {
    await this.ensurePermission();
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 1500,
        distanceInterval: 2,
      },
      (update) => {
        handler({
          latitude: update.coords.latitude,
          longitude: update.coords.longitude,
          timestamp: update.timestamp,
        });
      }
    );

    return () => {
      subscription.remove();
    };
  }

  stopTracking(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.tracking = false;
  }

  getBreadcrumbTrail(limit = MAX_BREADCRUMBS): LocationPoint[] {
    const safeLimit = Math.max(1, limit);
    return this.breadcrumbs.slice(-safeLimit);
  }

  getHealth(): ServiceHealth {
    return {
      name: 'Location Service',
      state: this.tracking ? 'active' : 'idle',
      detail: this.tracking
        ? `Tracking active with ${this.breadcrumbs.length} breadcrumbs.`
        : 'Location tracking is disabled.',
    };
  }

  private async ensurePermission(): Promise<void> {
    if (this.permissionGranted) {
      return;
    }

    const granted = await this.requestPermission();
    if (!granted) {
      throw new Error('Location permission denied.');
    }
  }

  private pushBreadcrumb(point: LocationPoint): void {
    this.breadcrumbs.push(point);
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }
}

export const locationService = new LocationService();
