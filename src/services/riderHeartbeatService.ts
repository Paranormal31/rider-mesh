import { RIDER_HEARTBEAT_API_URL } from '@/src/config/api';

import { deviceIdentityService } from './deviceIdentityService';
import { locationService } from './locationService';

const HEARTBEAT_INTERVAL_MS = 5000;

class RiderHeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.sendHeartbeat();
    this.timer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const deviceId = await deviceIdentityService.getDeviceId();
      const location = await locationService.getCurrentLocation();

      await fetch(RIDER_HEARTBEAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: location.timestamp,
          },
        }),
      });
    } catch {
      // Heartbeat is best-effort. Next interval retries automatically.
    }
  }
}

export const riderHeartbeatService = new RiderHeartbeatService();
