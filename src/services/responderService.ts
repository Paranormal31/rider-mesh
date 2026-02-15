import { alertAcceptApiUrl } from '@/src/config/api';

import { deviceIdentityService } from './deviceIdentityService';
import { socketService, type AlertAssignedEvent, type NearbyAlertEvent } from './socketService';

export type ResponderAlert = NearbyAlertEvent;

type ResponderEventMap = {
  ALERTS_UPDATED: {
    alerts: ResponderAlert[];
  };
};

class ResponderService {
  private alerts: ResponderAlert[] = [];
  private listeners: {
    [K in keyof ResponderEventMap]: Set<(payload: ResponderEventMap[K]) => void>;
  } = {
    ALERTS_UPDATED: new Set(),
  };
  private started = false;
  private offNearby: (() => void) | null = null;
  private offAssigned: (() => void) | null = null;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await socketService.start();
    this.offNearby = socketService.on('alert:new_nearby', (event) => {
      this.upsertAlert(event);
    });
    this.offAssigned = socketService.on('alert:assigned', (event) => {
      this.handleAssigned(event);
    });
    this.started = true;
  }

  stop(): void {
    this.offNearby?.();
    this.offNearby = null;
    this.offAssigned?.();
    this.offAssigned = null;
    this.started = false;
  }

  on<TEvent extends keyof ResponderEventMap>(
    event: TEvent,
    listener: (payload: ResponderEventMap[TEvent]) => void
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  getAlerts(): ResponderAlert[] {
    return [...this.alerts].sort((a, b) => b.triggeredAt - a.triggeredAt);
  }

  async acceptAlert(alertId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      const responderDeviceId = await deviceIdentityService.getDeviceId();
      const response = await fetch(alertAcceptApiUrl(alertId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responderDeviceId,
        }),
      });

      if (response.ok) {
        if (__DEV__) {
          console.log('[responder] accept ok', { alertId });
        }
        this.removeAlert(alertId);
        return { ok: true };
      }

      if (response.status === 409) {
        if (__DEV__) {
          console.log('[responder] accept conflict', { alertId });
        }
        this.removeAlert(alertId);
        return { ok: false, reason: 'Alert already assigned.' };
      }

      if (__DEV__) {
        console.log('[responder] accept failed', { alertId, status: response.status });
      }
      return { ok: false, reason: 'Accept request failed.' };
    } catch {
      if (__DEV__) {
        console.log('[responder] accept network error', { alertId });
      }
      return { ok: false, reason: 'Network error while accepting alert.' };
    }
  }

  private upsertAlert(alert: NearbyAlertEvent): void {
    const idx = this.alerts.findIndex((item) => item.alertId === alert.alertId);
    if (idx === -1) {
      this.alerts.push(alert);
    } else {
      this.alerts[idx] = alert;
    }
    if (__DEV__) {
      console.log('[responder] nearby alerts updated', { count: this.alerts.length });
    }
    this.emit('ALERTS_UPDATED', { alerts: this.getAlerts() });
  }

  private handleAssigned(event: AlertAssignedEvent): void {
    this.removeAlert(event.alertId);
  }

  private removeAlert(alertId: string): void {
    const next = this.alerts.filter((item) => item.alertId !== alertId);
    if (next.length === this.alerts.length) {
      return;
    }

    this.alerts = next;
    this.emit('ALERTS_UPDATED', { alerts: this.getAlerts() });
  }

  private emit<TEvent extends keyof ResponderEventMap>(
    event: TEvent,
    payload: ResponderEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const responderService = new ResponderService();
