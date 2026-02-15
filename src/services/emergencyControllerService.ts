import { crashDetectionService, type CrashDetectedEvent } from './crashDetectionService';
import { locationService, type LocationPoint } from './locationService';
import type { ServiceHealth } from './types';

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
  location: {
    latitude: number;
    longitude: number;
    timestamp: number;
    breadcrumbTrail: LocationPoint[];
  } | null;
};

type CancelledEvent = {
  type: 'CANCELLED';
  cancelledAt: number;
};

type EmergencyControllerEventMap = {
  COUNTDOWN_STARTED: CountdownStartedEvent;
  COUNTDOWN_TICK: CountdownTickEvent;
  ALERT_TRIGGERED: AlertTriggeredEvent;
  CANCELLED: CancelledEvent;
};

type EmergencyControllerListener<TEvent extends keyof EmergencyControllerEventMap> = (
  payload: EmergencyControllerEventMap[TEvent]
) => void;

const DEFAULT_COUNTDOWN_SECONDS = 10;
const DEFAULT_REENTRY_COOLDOWN_MS = 5000;

class EmergencyControllerService {
  private state: EmergencyControllerState = 'MONITORING';
  private countdownRemainingSeconds = 0;
  private countdownStartedAtMs: number | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private crashUnsubscribe: (() => void) | null = null;
  private running = false;
  private reentryLockedUntilMs = 0;
  private listeners: {
    [K in keyof EmergencyControllerEventMap]: Set<EmergencyControllerListener<K>>;
  } = {
    COUNTDOWN_STARTED: new Set(),
    COUNTDOWN_TICK: new Set(),
    ALERT_TRIGGERED: new Set(),
    CANCELLED: new Set(),
  };

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await crashDetectionService.start();
    void locationService.startTracking().catch(() => {
      // Location is optional. Crash flow must continue even when permission is denied.
    });
    this.crashUnsubscribe = crashDetectionService.on('CRASH_DETECTED', (event) =>
      this.handleCrashDetected(event)
    );
    this.running = true;
    this.state = 'MONITORING';
  }

  stop(): void {
    this.clearCountdownTimer();
    this.crashUnsubscribe?.();
    this.crashUnsubscribe = null;
    this.running = false;
    this.state = 'MONITORING';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    crashDetectionService.stop();
    locationService.stopTracking();
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
    this.state = 'MONITORING';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
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

    this.state = 'CRASH_DETECTED';
    this.startCountdown(DEFAULT_COUNTDOWN_SECONDS);
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
    this.state = 'ALERT_SENDING';
    const location = await this.buildAlertLocationPayload();
    this.emit('ALERT_TRIGGERED', {
      type: 'ALERT_TRIGGERED',
      triggeredAt: now,
      location,
    });
    this.state = 'ALERT_SENT';
    this.reentryLockedUntilMs = now + DEFAULT_REENTRY_COOLDOWN_MS;
  }

  private async buildAlertLocationPayload(): Promise<{
    latitude: number;
    longitude: number;
    timestamp: number;
    breadcrumbTrail: LocationPoint[];
  } | null> {
    const breadcrumbTrail = locationService.getBreadcrumbTrail(10);

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
export type { EmergencyControllerState };
