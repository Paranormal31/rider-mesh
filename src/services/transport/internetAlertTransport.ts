import { ALERTS_API_URL, alertAcceptApiUrl, buildAlertStatusApiUrl } from '@/src/config/api';

import { socketService } from '../socketService';
import type {
  AlertAssignedEvent,
  AlertCancelledEvent,
  AlertTransport,
  AlertTransportEventMap,
  AlertTransportListener,
  NearbyAlertEvent,
  PublishResult,
  PublishTriggerResult,
  SOSAssignedPayload,
  SOSCancelledPayload,
  SOSTriggeredPayload,
} from './alertTransport';

class InternetAlertTransport implements AlertTransport {
  readonly id = 'internet' as const;

  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await socketService.start();
    this.started = true;
  }

  stop(): void {
    this.started = false;
    socketService.stop();
  }

  getAvailability() {
    return {
      canPublish: this.started,
      canReceive: this.started && socketService.isConnected(),
    };
  }

  async publishSosTriggered(payload: SOSTriggeredPayload): Promise<PublishTriggerResult> {
    try {
      const response = await fetch(ALERTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: payload.victimDeviceId,
          victimName: payload.victimName,
          status: 'TRIGGERED' as const,
          triggeredAt: payload.triggeredAt,
          location: payload.location,
        }),
      });

      if (!response.ok) {
        return { ok: false, reason: `Create failed with status ${response.status}`, alertId: payload.alertId };
      }

      const body = (await response.json().catch(() => null)) as { data?: { id?: string } } | null;
      const createdId = body?.data?.id;
      if (typeof createdId === 'string' && createdId.trim()) {
        return { ok: true, alertId: createdId };
      }

      return { ok: true, alertId: payload.alertId };
    } catch {
      return { ok: false, reason: 'Network error creating alert', alertId: payload.alertId };
    }
  }

  async publishSosCancelled(payload: SOSCancelledPayload): Promise<PublishResult> {
    try {
      const response = await fetch(buildAlertStatusApiUrl(payload.alertId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });

      if (!response.ok && response.status !== 404) {
        return { ok: false, reason: `Cancel failed with status ${response.status}` };
      }

      return { ok: true };
    } catch {
      return { ok: false, reason: 'Network error sending cancellation' };
    }
  }

  async publishSosAssigned(payload: SOSAssignedPayload): Promise<PublishResult> {
    try {
      const response = await fetch(alertAcceptApiUrl(payload.alertId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responderDeviceId: payload.responderDeviceId,
          responderName: payload.responderName,
        }),
      });

      if (response.ok) {
        return { ok: true };
      }

      if (response.status === 409) {
        return { ok: false, reason: 'Alert already assigned.' };
      }

      return { ok: false, reason: `Assign failed with status ${response.status}` };
    } catch {
      return { ok: false, reason: 'Network error while assigning alert' };
    }
  }

  on<TEvent extends keyof AlertTransportEventMap>(
    event: TEvent,
    listener: AlertTransportListener<TEvent>
  ): () => void {
    if (event === 'nearby_alert') {
      return socketService.on('alert:new_nearby', listener as unknown as (payload: NearbyAlertEvent) => void);
    }

    if (event === 'assigned') {
      return socketService.on('alert:assigned', listener as unknown as (payload: AlertAssignedEvent) => void);
    }

    return socketService.on('alert:cancelled', listener as unknown as (payload: AlertCancelledEvent) => void);
  }
}

export const internetAlertTransport = new InternetAlertTransport();
