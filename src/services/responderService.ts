import { deviceIdentityService } from './deviceIdentityService';
import { profileService } from './profileService';
import { transportRouterService } from './transport/transportRouterService';
import {
  type AlertAssignedEvent,
  type AlertCancelledEvent,
  type NearbyAlertEvent,
} from './transport/alertTransport';

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
  private offCancelled: (() => void) | null = null;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await transportRouterService.start();
    this.offNearby = transportRouterService.on('nearby_alert', (event) => {
      this.upsertAlert(event);
    });
    this.offAssigned = transportRouterService.on('assigned', (event) => {
      this.handleAssigned(event);
    });
    this.offCancelled = transportRouterService.on('cancelled', (event) => {
      this.handleCancelled(event);
    });
    this.started = true;
  }

  stop(): void {
    this.offNearby?.();
    this.offNearby = null;
    this.offAssigned?.();
    this.offAssigned = null;
    this.offCancelled?.();
    this.offCancelled = null;
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
      const [responderDeviceId, profile] = await Promise.all([
        deviceIdentityService.getDeviceId(),
        profileService.getProfile(),
      ]);
      const responderName = profile?.name?.trim() ? profile.name.trim() : null;
      const alert = this.alerts.find((item) => item.alertId === alertId);
      if (!alert) {
        return { ok: false, reason: 'Alert is no longer available.' };
      }
      const response = await transportRouterService.publishSosAssigned({
        alertId,
        victimDeviceId: alert.victimDeviceId,
        responderDeviceId,
        responderName,
        assignedAt: Date.now(),
      });

      if (response.ok) {
        if (__DEV__) {
          console.log('[responder] accept ok', { alertId });
        }
        this.removeAlert(alertId);
        return { ok: true };
      }

      if (__DEV__) {
        console.log('[responder] accept failed', { alertId });
      }
      return { ok: false, reason: response.reason ?? 'Accept request failed.' };
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

  private handleCancelled(event: AlertCancelledEvent): void {
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
