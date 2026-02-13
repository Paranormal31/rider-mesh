import type { ServiceHealth } from './types';

class LocationService {
  private tracking = false;

  startTracking(): void {
    this.tracking = true;
  }

  stopTracking(): void {
    this.tracking = false;
  }

  getHealth(): ServiceHealth {
    return {
      name: 'Location Service',
      state: this.tracking ? 'active' : 'idle',
      detail: this.tracking ? 'Location tracking is active.' : 'Location tracking is disabled.',
    };
  }
}

export const locationService = new LocationService();
