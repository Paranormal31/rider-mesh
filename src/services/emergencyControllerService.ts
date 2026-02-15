import { ALERTS_API_URL } from '@/src/config/api';

import { alarmAudioService } from './alarmAudioService';
import { crashDetectionService, type CrashDetectedEvent } from './crashDetectionService';
import { deviceIdentityService } from './deviceIdentityService';
import { locationService, type LocationPoint } from './locationService';
import { settingsService, type UserSettings } from './settingsService';
import { socketService, type AlertAssignedEvent } from './socketService';
import type { ServiceHealth } from './types';

type EmergencyControllerLocationPayload = {
  latitude: number;
  longitude: number;
  timestamp: number;
  breadcrumbTrail: LocationPoint[];
};

type EmergencyControllerState =
  | 'MONITORING'
  | 'CRASH_DETECTED'
  | 'COUNTDOWN_ACTIVE'
  | 'ALERT_SENDING'
  | 'ALERT_SENT'
  | 'RESPONDER_ASSIGNED';

type CountdownStartedEvent = {
  type: 'COUNTDOWN_STARTED';
  startedAt: number;
  remainingSeconds: number;
};

type CountdownTickEvent = {
  type: 'COUNTDOWN_TICK';
  remainingSeconds: number;
};

type AlertTriggeredEvent = {
  type: 'ALERT_TRIGGERED';
  triggeredAt: number;
  alarmSoundEnabled: boolean;
  location: EmergencyControllerLocationPayload | null;
};

type CancelledEvent = {
  type: 'CANCELLED';
  cancelledAt: number;
};

type ResponderAssignedEvent = {
  type: 'RESPONDER_ASSIGNED';
  alertId: string;
  responderDeviceId: string;
  assignedAt: number;
};

type EmergencyControllerEventMap = {
  COUNTDOWN_STARTED: CountdownStartedEvent;
  COUNTDOWN_TICK: CountdownTickEvent;
  ALERT_TRIGGERED: AlertTriggeredEvent;
  CANCELLED: CancelledEvent;
  RESPONDER_ASSIGNED: ResponderAssignedEvent;
};

type EmergencyControllerListener<TEvent extends keyof EmergencyControllerEventMap> = (
  payload: EmergencyControllerEventMap[TEvent]
) => void;

const DEFAULT_REENTRY_COOLDOWN_MS = 5000;

class EmergencyControllerService {
  private state: EmergencyControllerState = 'MONITORING';
  private countdownRemainingSeconds = 0;
  private countdownStartedAtMs: number | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private crashUnsubscribe: (() => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private socketAssignedUnsubscribe: (() => void) | null = null;
  private running = false;
  private reentryLockedUntilMs = 0;
  private activeAlertId: string | null = null;
  private deviceId: string | null = null;
  private listeners: {
    [K in keyof EmergencyControllerEventMap]: Set<EmergencyControllerListener<K>>;
  } = {
    COUNTDOWN_STARTED: new Set(),
    COUNTDOWN_TICK: new Set(),
    ALERT_TRIGGERED: new Set(),
    CANCELLED: new Set(),
    RESPONDER_ASSIGNED: new Set(),
  };

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.deviceId = await deviceIdentityService.getDeviceId();
    await socketService.start();
    this.socketAssignedUnsubscribe = socketService.on('alert:assigned', (event) => {
      this.handleAlertAssigned(event);
    });

    await crashDetectionService.start();
    const settings = settingsService.getSettings();
    if (settings.breadcrumbTrackingEnabled) {
      void locationService.startTracking().catch(() => {
        // Location is optional. Crash flow must continue even when permission is denied.
      });
    } else {
      locationService.stopTracking();
    }

    this.settingsUnsubscribe = settingsService.on('SETTINGS_CHANGED', ({ settings: nextSettings }) => {
      this.handleSettingsChanged(nextSettings);
    });

    this.crashUnsubscribe = crashDetectionService.on('CRASH_DETECTED', (event) =>
      this.handleCrashDetected(event)
    );
    this.running = true;
    this.state = 'MONITORING';
  }

  stop(): void {
    this.clearCountdownTimer();
    alarmAudioService.stop();
    this.crashUnsubscribe?.();
    this.crashUnsubscribe = null;
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.socketAssignedUnsubscribe?.();
    this.socketAssignedUnsubscribe = null;
    this.running = false;
    this.state = 'MONITORING';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    this.activeAlertId = null;
    crashDetectionService.stop();
    locationService.stopTracking();
    socketService.stop();
  }

  on<TEvent extends keyof EmergencyControllerEventMap>(
    event: TEvent,
    listener: EmergencyControllerListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  getState(): EmergencyControllerState {
    return this.state;
  }

  getCountdownRemainingSeconds(): number {
    return this.countdownRemainingSeconds;
  }

  cancel(): void {
    if (this.state !== 'COUNTDOWN_ACTIVE' && this.state !== 'CRASH_DETECTED') {
      return;
    }

    this.clearCountdownTimer();
    alarmAudioService.stop();
    this.state = 'MONITORING';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    this.activeAlertId = null;
    this.emit('CANCELLED', {
      type: 'CANCELLED',
      cancelledAt: Date.now(),
    });
  }

  getHealth(): ServiceHealth {
    const isActive = this.running || this.state !== 'MONITORING';
    return {
      name: 'Emergency Controller',
      state: isActive ? 'active' : 'idle',
      detail: `State: ${this.state}`,
    };
  }

  private handleCrashDetected(_: CrashDetectedEvent): void {
    if (!this.running) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs < this.reentryLockedUntilMs) {
      return;
    }

    if (this.state !== 'MONITORING') {
      return;
    }

    const settings = settingsService.getSettings();
    this.state = 'CRASH_DETECTED';
    if (settings.alarmSoundEnabled) {
      alarmAudioService.start();
    }
    this.startCountdown(settings.countdownDurationSeconds);
  }

  private startCountdown(seconds: number): void {
    this.clearCountdownTimer();
    this.state = 'COUNTDOWN_ACTIVE';
    this.countdownRemainingSeconds = seconds;
    this.countdownStartedAtMs = Date.now();

    this.emit('COUNTDOWN_STARTED', {
      type: 'COUNTDOWN_STARTED',
      startedAt: this.countdownStartedAtMs,
      remainingSeconds: this.countdownRemainingSeconds,
    });

    this.countdownTimer = setInterval(() => {
      this.countdownRemainingSeconds -= 1;

      if (this.countdownRemainingSeconds > 0) {
        this.emit('COUNTDOWN_TICK', {
          type: 'COUNTDOWN_TICK',
          remainingSeconds: this.countdownRemainingSeconds,
        });
        return;
      }

      this.clearCountdownTimer();
      void this.triggerAlert();
    }, 1000);
  }

  private async triggerAlert(): Promise<void> {
    const now = Date.now();
    const settings = settingsService.getSettings();
    this.state = 'ALERT_SENDING';
    const immediateLocation = this.buildImmediateLocationPayload();

    this.emit('ALERT_TRIGGERED', {
      type: 'ALERT_TRIGGERED',
      triggeredAt: now,
      alarmSoundEnabled: settings.alarmSoundEnabled,
      location: immediateLocation,
    });
    this.state = 'ALERT_SENT';
    this.reentryLockedUntilMs = now + DEFAULT_REENTRY_COOLDOWN_MS;
    alarmAudioService.stop();

    void this.sendAlertInBackground(now, immediateLocation);
  }

  private buildImmediateLocationPayload(): EmergencyControllerLocationPayload | null {
    const includeBreadcrumbs = settingsService.getSettings().breadcrumbTrackingEnabled;
    const breadcrumbTrail = includeBreadcrumbs ? locationService.getBreadcrumbTrail(10) : [];
    const lastPoint = breadcrumbTrail[breadcrumbTrail.length - 1];

    if (!lastPoint) {
      return null;
    }

    return {
      latitude: lastPoint.latitude,
      longitude: lastPoint.longitude,
      timestamp: lastPoint.timestamp,
      breadcrumbTrail,
    };
  }

  private async sendAlertInBackground(
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): Promise<void> {
    const resolvedLocation = (await this.buildAlertLocationPayload()) ?? immediateLocation;
    const deviceId = this.deviceId ?? (await deviceIdentityService.getDeviceId());
    const payload = {
      deviceId,
      status: 'TRIGGERED' as const,
      triggeredAt,
      location: resolvedLocation,
    };

    const response = await this.sendAlertRequest(payload);
    if (response?.id) {
      this.activeAlertId = response.id;
    }
  }

  private handleAlertAssigned(event: AlertAssignedEvent): void {
    if (!this.running) {
      return;
    }

    if (this.deviceId && event.victimDeviceId !== this.deviceId) {
      return;
    }

    if (this.activeAlertId && event.alertId !== this.activeAlertId) {
      return;
    }

    this.state = 'RESPONDER_ASSIGNED';
    this.emit('RESPONDER_ASSIGNED', {
      type: 'RESPONDER_ASSIGNED',
      alertId: event.alertId,
      responderDeviceId: event.responderDeviceId,
      assignedAt: event.assignedAt,
    });
  }

  private async buildAlertLocationPayload(): Promise<EmergencyControllerLocationPayload | null> {
    const includeBreadcrumbs = settingsService.getSettings().breadcrumbTrackingEnabled;
    const breadcrumbTrail = includeBreadcrumbs ? locationService.getBreadcrumbTrail(10) : [];

    try {
      const currentLocation = await locationService.getCurrentLocation();
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        timestamp: currentLocation.timestamp,
        breadcrumbTrail,
      };
    } catch {
      return null;
    }
  }

  private handleSettingsChanged(settings: UserSettings): void {
    const shouldAlarmBeActive = this.state === 'CRASH_DETECTED' || this.state === 'COUNTDOWN_ACTIVE';
    if (!settings.alarmSoundEnabled) {
      alarmAudioService.stop();
    } else if (shouldAlarmBeActive && !alarmAudioService.isPlaying()) {
      alarmAudioService.start();
    }

    if (!this.running) {
      return;
    }

    if (settings.breadcrumbTrackingEnabled) {
      void locationService.startTracking().catch(() => {
        // Location is optional. Crash flow must continue even when permission is denied.
      });
      return;
    }

    locationService.stopTracking();
  }

  private async sendAlertRequest(payload: {
    deviceId: string;
    status: 'TRIGGERED';
    triggeredAt: number;
    location: {
      latitude: number;
      longitude: number;
      timestamp: number;
      breadcrumbTrail: LocationPoint[];
    } | null;
  }): Promise<{ id: string } | null> {
    try {
      const response = await fetch(ALERTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        console.error('[alerts] Failed to send alert', {
          url: ALERTS_API_URL,
          status: response.status,
          body,
        });
        return null;
      }

      console.log('[alerts] Alert sent successfully', body);
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { data?: { id?: unknown } }).data?.id === 'string'
      ) {
        return { id: (body as { data: { id: string } }).data.id };
      }
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[alerts] Network error while sending alert', {
        url: ALERTS_API_URL,
        reason,
      });
      return null;
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private emit<TEvent extends keyof EmergencyControllerEventMap>(
    event: TEvent,
    payload: EmergencyControllerEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const emergencyControllerService = new EmergencyControllerService();
export type { EmergencyControllerLocationPayload, EmergencyControllerState, ResponderAssignedEvent };
